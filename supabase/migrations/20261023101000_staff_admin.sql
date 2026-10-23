-- إدارة الموظفين من لوحة الأدمن. كل عملية transaction وحدة، والدالة بتتأكد بنفسها إنه المنادي أدمن.
-- حسابات الدخول نفسها (Supabase Auth) بتنعمل بالسيرفر بـ service role، مش هون.

-- لازم يضل أدمن فعّال واحد على الأقل. القفل بيخلي عمليتين متزامنتين يمشوا ورا بعض،
-- مشان ما كل أدمن يوقف الثاني بنفس اللحظة ويضل النظام بدون أدمن.
create function private.lock_admin_changes()
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('mekasa:admin-changes'))
$$;

create function private.assert_an_active_admin_remains()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.staff s
    join public.staff_roles r on r.staff_id = s.id
    where r.role = 'admin' and s.is_active
  ) then
    raise exception 'at least one active admin must remain' using errcode = 'check_violation';
  end if;
end;
$$;

revoke execute on function private.lock_admin_changes(), private.assert_an_active_admin_remains() from public, anon;
grant execute on function private.lock_admin_changes(), private.assert_an_active_admin_remains() to authenticated, service_role;

-- إنشاء أو تعديل موظف مع أدواره. الموقع والأدوار بيتغيروا مع بعض، والتوافق بينهم
-- بيتفحص بآخر الـ transaction (staff_roles_match_location)، فما في حالة نص نص.
create function public.admin_save_staff(
  p_staff_id uuid,
  p_full_name text,
  p_phone text,
  p_roles public.app_role[],
  -- null للأدمن اللي ما إله موقع
  p_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if not private.is_admin() then
    raise exception 'only an admin can manage staff' using errcode = 'insufficient_privilege';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'a staff member needs at least one role' using errcode = 'check_violation';
  end if;
  if p_staff_id = caller and not ('admin' = any (p_roles)) then
    raise exception 'an admin cannot remove their own admin role' using errcode = 'check_violation';
  end if;

  perform private.lock_admin_changes();

  insert into public.staff (id, full_name, phone, location_id, created_by)
  values (p_staff_id, trim(p_full_name), p_phone, p_location_id, caller)
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        location_id = excluded.location_id;

  delete from public.staff_roles
  where staff_id = p_staff_id and role <> all (p_roles);

  insert into public.staff_roles (staff_id, role, granted_by)
  select p_staff_id, r, caller from unnest(p_roles) as r
  on conflict (staff_id, role) do nothing;

  perform private.assert_an_active_admin_remains();
end;
$$;

-- الإيقاف والتفعيل. الموقوف بتنحذف جلساته كلها (مشان ما ترجع لو تفعّل بعدين)
-- واشتراكات إشعاراته (جواله ممكن يصير مع موظف ثاني). الحظر بـ Supabase Auth بيصير بالسيرفر.
create function public.admin_set_staff_active(p_staff_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an admin can manage staff' using errcode = 'insufficient_privilege';
  end if;
  if p_staff_id = (select auth.uid()) and not p_active then
    raise exception 'an admin cannot deactivate themselves' using errcode = 'check_violation';
  end if;

  perform private.lock_admin_changes();

  update public.staff set is_active = p_active where id = p_staff_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'no_data_found';
  end if;

  if not p_active then
    delete from public.push_subscriptions where staff_id = p_staff_id;
    -- refresh tokens بتنحذف معها (cascade)
    delete from auth.sessions where user_id = p_staff_id;
    perform private.assert_an_active_admin_remains();
  end if;
end;
$$;

-- "رمز جديد": بيفك القفل وبيسجل مين عطى الرمز. الرمز نفسه ما بيوصل لقاعدة البيانات أبداً.
create function public.admin_record_pin_reset(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an admin can manage staff' using errcode = 'insufficient_privilege';
  end if;

  update public.staff
  set failed_pin_attempts = 0, locked_until = null, requires_admin_reset = false
  where id = p_staff_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (table_name, row_id, action, reason, changed_by)
  values ('staff', p_staff_id::text, 'update', 'رمز دخول جديد', (select auth.uid()));
end;
$$;

revoke execute on function
  public.admin_save_staff(uuid, text, text, public.app_role[], uuid),
  public.admin_set_staff_active(uuid, boolean),
  public.admin_record_pin_reset(uuid)
from public, anon;
grant execute on function
  public.admin_save_staff(uuid, text, text, public.app_role[], uuid),
  public.admin_set_staff_active(uuid, boolean),
  public.admin_record_pin_reset(uuid)
to authenticated, service_role;
