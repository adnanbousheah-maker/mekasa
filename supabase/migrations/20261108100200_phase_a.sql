-- المرحلة أ (8 نوفمبر 2026): المدير العام ومسؤول الفرع، القفل المتدرّج، والإشعارات داخل التطبيق.

-- ─── الأدوار ─────────────────────────────────────────────────────────

-- مسؤول الفرع بيعمل كل شغل موظف الفرع، فكل فحص has_role('branch_staff') بيقبله
create or replace function private.has_role(wanted public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.staff s on s.id = r.staff_id
    where r.staff_id = (select auth.uid()) and s.is_active
      and (r.role = wanted or (wanted = 'branch_staff' and r.role = 'branch_manager'))
  )
$$;

-- بيقرأ كل شي: الأدمن والمدير العام. الكتابة لسا للأدمن بس (is_admin).
create function private.can_read_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or private.has_role('general_manager')
$$;

revoke execute on function private.can_read_all() from public, anon;
grant execute on function private.can_read_all() to authenticated, service_role;

-- نفس الدالة (20261025100510)، بس المدير العام كمان
create or replace function private.can_see_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_all() or exists (
    select 1 from public.locations l
    where l.id = loc
      and (private.my_location_id() in (l.id, l.parent_location_id)
           or (l.kind = 'packaging' and private.has_role('packaging_keeper')))
  )
$$;

alter policy "staff read themselves, admin reads all" on public.staff
  using (((id = (select auth.uid())) and is_active) or private.can_read_all());
alter policy "staff read their roles, admin reads all" on public.staff_roles
  using (((staff_id = (select auth.uid())) and private.is_active_staff()) or private.can_read_all());
alter policy "admin reads audit log" on public.audit_log using (private.can_read_all());
alter policy "admin reads notification log" on public.notification_log using (private.can_read_all());
-- المساعد للمدير العام كمان (أدواته قراءة بس)
alter policy "admin reads ai usage" on public.ai_usage_log using (private.can_read_all());
alter policy "admin reads own conversations" on public.ai_conversations
  using ((staff_id = (select auth.uid())) and private.can_read_all());
alter policy "admin starts conversations" on public.ai_conversations
  with check ((staff_id = (select auth.uid())) and private.can_read_all());
alter policy "admin reads own messages" on public.ai_messages
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.staff_id = (select auth.uid()) and private.can_read_all()));

-- المدير العام بدون موقع أو بأي موقع، ومسؤول الفرع بفرع
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

-- ─── الإشعارات داخل التطبيق ──────────────────────────────────────────
-- كل إشعار (Push أو لا) بينحفظ هون للموظف، مع رابط للشي المرتبط فيه.

create table public.notifications (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff (id),
  kind text not null check (length(kind) between 1 and 40),
  title text not null check (length(title) between 1 and 120),
  body text check (body is null or length(body) <= 500),
  -- رابط داخل التطبيق بس
  url text check (url is null or url ~ '^/[^/]'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_inbox on public.notifications (staff_id, created_at desc);

alter table public.notifications enable row level security;

create policy "staff read their notifications" on public.notifications
  for select to authenticated
  using (staff_id = (select auth.uid()) and private.is_active_staff());

-- قراءة إشعاراتي (فاضي = الكل)
create function public.mark_notifications_read(p_ids bigint[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  if not private.is_active_staff() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.notifications n
  set read_at = now()
  where n.staff_id = (select auth.uid()) and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke execute on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;

-- إشعار لكل أدمن فعّال (من دوال قاعدة البيانات)
create function private.notify_admins(p_kind text, p_title text, p_body text, p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (staff_id, kind, title, body, url)
  select distinct s.id, p_kind, p_title, p_body, p_url
  from public.staff s
  join public.staff_roles r on r.staff_id = s.id and r.role = 'admin'
  where s.is_active
$$;

revoke execute on function private.notify_admins(text, text, text, text) from public, anon, authenticated;
grant execute on function private.notify_admins(text, text, text, text) to service_role;

-- ─── القفل المتدرّج ──────────────────────────────────────────────────
-- بدل القفل الدائم بعد 10 (حدا بيعرف رقم موظف كان يقدر يقفله): كل 5 غلط قفل أطول،
-- 15 دقيقة، ساعة، وبعدين يوم. من ثاني قفل الأدمن بيوصله إشعار. الرمز الجديد بيفك القفل متل قبل.
create or replace function public.auth_reserve_login_attempt(p_phone text, p_ip inet default null)
returns table (attempt_id bigint, staff_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lock_every constant int := 5;
  ip_failure_limit constant int := 20;
  ip_window constant interval := interval '15 minutes';
  v_attempt bigint;
  v_staff public.staff%rowtype;
  v_failed int;
  v_lock interval;
begin
  insert into public.login_attempts (phone, ip, succeeded)
  values (p_phone, p_ip, false)
  returning id into v_attempt;

  if p_ip is not null and (
    select count(*) from public.login_attempts a
    where a.ip = p_ip and not a.succeeded and a.attempted_at > now() - ip_window
  ) > ip_failure_limit then
    return query select v_attempt, null::uuid, 'blocked';
    return;
  end if;

  select * into v_staff from public.staff s
  where s.phone = p_phone or s.username = lower(trim(p_phone))
  for update;

  if not found or not v_staff.is_active then
    return query select v_attempt, null::uuid, 'unknown';
    return;
  end if;

  if v_staff.requires_admin_reset or v_staff.locked_until > now() then
    return query select v_attempt, v_staff.id, 'blocked';
    return;
  end if;

  v_failed := v_staff.failed_pin_attempts + 1;
  v_lock := case
    when v_failed % lock_every <> 0 then null
    when v_failed = lock_every then interval '15 minutes'
    when v_failed = lock_every * 2 then interval '1 hour'
    else interval '24 hours'
  end;

  update public.staff
  set failed_pin_attempts = v_failed,
      locked_until = case when v_lock is not null then now() + v_lock end,
      requires_admin_reset = false
  where id = v_staff.id;

  if v_lock is not null and v_failed >= lock_every * 2 then
    perform private.notify_admins(
      'account_locked',
      'حساب انقفل: ' || v_staff.full_name,
      v_failed || ' محاولة غلط. مقفول ' ||
        case when v_lock = interval '1 hour' then 'ساعة' else 'يوم' end ||
        '. إذا هو، أعطيه رمز جديد.',
      '/admin/staff/' || v_staff.id
    );
  end if;

  return query select v_attempt, v_staff.id, 'verify';
end;
$$;
