-- 17 نوفمبر 2026: سوبر أدمن IT، وضع المعاينة وزر التصفير، ومفتاح المهام المتكررة.
-- الخطة: docs/plan-it-preview.md

-- ─── الدور ───────────────────────────────────────────────────────────

create function private.is_it_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('it_admin')
$$;

revoke execute on function private.is_it_admin() from public, anon;
grant execute on function private.is_it_admin() to authenticated, service_role;

-- نفس الدالة (20261108100200)، بس سوبر أدمن IT ما إله موقع متل الأدمن
create or replace function private.assert_roles_match_location(target_staff uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  bad_role public.app_role;
begin
  select r.role into bad_role
  from public.staff_roles r
  join public.staff s on s.id = r.staff_id
  left join public.locations l on l.id = s.location_id
  where r.staff_id = target_staff
    and case r.role
          when 'admin' then false
          when 'it_admin' then false
          when 'general_manager' then false
          when 'branch_staff' then l.kind is distinct from 'branch'
          when 'branch_manager' then l.kind is distinct from 'branch'
          when 'packaging_keeper' then l.id is null
          else l.kind is distinct from 'factory'
        end
  limit 1;

  if bad_role is not null then
    raise exception 'role % does not match the staff member''s location', bad_role
      using errcode = 'check_violation';
  end if;
end;
$$;

-- الدور بينعطى وبينشال من قاعدة البيانات بس (بدون جلسة تطبيق). من التطبيق:
-- إضافته بترفض، وشيله بينتجاهل (فورم الموظف ما فيه هالدور، فالحفظ ما بيشيله بالغلط).
create function private.guard_it_admin_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.role = 'it_admin' then
    raise exception 'the IT role is managed outside the app' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' and old.role = 'it_admin' then
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.role = 'it_admin' or new.role = 'it_admin') then
    raise exception 'the IT role is managed outside the app' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger staff_roles_guard_it_admin
before insert or update or delete on public.staff_roles
for each row execute function private.guard_it_admin_role();

-- حساب IT ما بيتعدّل (الاسم، الموقع، الإيقاف، القفل، اسم المستخدم) إلا منه هو أو من قاعدة البيانات
create function private.guard_it_admin_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or caller = old.id or private.is_it_admin() then
    return new;
  end if;
  if exists (select 1 from public.staff_roles r where r.staff_id = old.id and r.role = 'it_admin') then
    raise exception 'the IT account can only be changed by itself' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger staff_guard_it_admin
before update on public.staff
for each row execute function private.guard_it_admin_account();

-- ─── الإعدادات: وضع المعاينة والمزايا ─────────────────────────────────

alter table public.app_settings
  add column preview_mode boolean not null default true,
  add column feature_tasks boolean not null default false;

-- بس IT بيغيّرهم، ووضع المعاينة لما ينطفي ما بيرجع
create function private.guard_it_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preview_mode and not old.preview_mode then
    raise exception 'preview mode cannot be turned back on' using errcode = 'check_violation';
  end if;
  if (new.preview_mode is distinct from old.preview_mode or new.feature_tasks is distinct from old.feature_tasks)
     and (select auth.uid()) is not null and not private.is_it_admin() then
    raise exception 'only IT can change this' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger app_settings_guard_it
before update on public.app_settings
for each row execute function private.guard_it_settings();

create function private.feature_enabled(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case feature
    when 'tasks' then (select a.feature_tasks from public.app_settings a)
    else false
  end
$$;

revoke execute on function private.feature_enabled(text) from public, anon;
grant execute on function private.feature_enabled(text) to authenticated, service_role;

-- نفس الدالة (20261108100500)، بس بترفض لما المهام مخفية
create or replace function public.complete_task(p_template_id uuid, p_note text default null, p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.task_templates;
  loc uuid := private.my_location_id();
  today date := public.count_day_today();
  run_id uuid;
begin
  if not private.feature_enabled('tasks') then
    raise exception 'recurring tasks are turned off' using errcode = 'check_violation', hint = 'feature_off';
  end if;
  select * into t from public.task_templates x where x.id = p_template_id and x.is_active;
  if t.id is null or loc is null
     or not exists (
       select 1 from public.locations l
       where l.id = loc and l.is_active
         and (t.location_ids is null and l.kind = 'branch' or l.id = any (t.location_ids))
     )
     or not private.task_due_on(t, today) then
    raise exception 'this task is not due here today' using errcode = 'check_violation';
  end if;
  if not private.has_role(t.role) then
    raise exception 'this task is for another role' using errcode = 'insufficient_privilege';
  end if;
  if t.requires_photo and coalesce(p_photo_path, '') = '' then
    raise exception 'this task needs a photo' using errcode = 'check_violation', hint = 'photo_required';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> loc::text then
    raise exception 'the photo must be in your location folder' using errcode = 'check_violation';
  end if;

  insert into public.task_runs (template_id, location_id, due_date, done_by, note, photo_path)
  values (t.id, loc, today, (select auth.uid()), nullif(trim(p_note), ''), nullif(p_photo_path, ''))
  on conflict (template_id, location_id, due_date) do nothing
  returning id into run_id;
  if run_id is null then
    raise exception 'already done today' using errcode = 'unique_violation', hint = 'already_done';
  end if;
  return run_id;
end;
$$;

-- ─── زر التصفير ───────────────────────────────────────────────────────
-- بيمسح كل الشغل (الحركات والمستندات والسجلات) ويخلّي الإعدادات والأصناف والمواقع والموظفين.
-- triggers الحماية بتمنع المسح، فبتنطفي بس جوا هالدالة (session_replication_role محلي للـ transaction).
-- الصور بتنمسح من التطبيق بعدها (Storage API).
create function public.it_reset_operations(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_it_admin() then
    raise exception 'only IT can reset the system' using errcode = 'insufficient_privilege';
  end if;
  if not (select a.preview_mode from public.app_settings a) then
    raise exception 'reset is closed after the preview period' using errcode = 'check_violation', hint = 'preview_over';
  end if;
  if p_confirm is distinct from 'صفّر' then
    raise exception 'type the confirmation word' using errcode = 'check_violation', hint = 'confirm';
  end if;

  set local session_replication_role = replica;
  truncate table
    public.stock_movements, public.stock_count_lines, public.stock_counts,
    public.dispatch_line_batches, public.dispatch_lines, public.dispatches,
    public.receipt_lines, public.receipts, public.return_dispositions,
    public.stock_request_missing, public.stock_request_lines, public.stock_requests,
    public.production_lines, public.production_entries, public.batches,
    public.raw_count_lines, public.raw_counts, public.raw_movements,
    public.waste_records, public.task_runs,
    public.alert_log, public.notification_log, public.notifications,
    public.ai_messages, public.ai_conversations, public.ai_usage_log,
    public.login_attempts, public.audit_log;
  set local session_replication_role = origin;

  insert into public.audit_log (table_name, row_id, action, reason, changed_by)
  values ('system', 'reset', 'delete', 'تصفير النظام (فترة المعاينة)', (select auth.uid()));
end;
$$;

revoke execute on function public.it_reset_operations(text) from public, anon;
grant execute on function public.it_reset_operations(text) to authenticated;
