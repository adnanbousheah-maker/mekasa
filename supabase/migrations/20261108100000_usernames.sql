-- ملاحظات 8 نوفمبر 2026: الدخول باسم المستخدم كمان (مش بس رقم الجوال).
-- اسم المستخدم اختياري، بالإنجليزي الصغير، وما بيتكرر. الأدمن بيحطه من صفحة الموظف.

alter table public.staff
  add column username text
  check (username ~ '^[a-z][a-z0-9._]{2,29}$');

create unique index staff_username_key on public.staff (username);

-- الأدمن بيحط اسم المستخدم أو بيشيله (فراغ = بدون). بينسجل بسجل التعديلات (staff_audit).
create function public.admin_set_staff_username(p_staff_id uuid, p_username text)
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
  set username = nullif(lower(trim(p_username)), '')
  where id = p_staff_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on function public.admin_set_staff_username(uuid, text) from public, anon;
grant execute on function public.admin_set_staff_username(uuid, text) to authenticated;

-- نفس الدالة (20261023101100)، بس بتلاقي الموظف برقم الجوال أو باسم المستخدم.
-- p_phone صار "المعرّف": رقم بصيغة 962… أو اسم مستخدم.
create or replace function public.auth_reserve_login_attempt(p_phone text, p_ip inet default null)
returns table (attempt_id bigint, staff_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  timed_lock_after constant int := 5;
  timed_lock constant interval := interval '15 minutes';
  admin_reset_after constant int := 10;
  ip_failure_limit constant int := 20;
  ip_window constant interval := interval '15 minutes';
  v_attempt bigint;
  v_staff public.staff%rowtype;
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

  update public.staff
  set failed_pin_attempts = failed_pin_attempts + 1,
      locked_until = case when failed_pin_attempts + 1 = timed_lock_after then now() + timed_lock end,
      requires_admin_reset = failed_pin_attempts + 1 >= admin_reset_after
  where id = v_staff.id;

  return query select v_attempt, v_staff.id, 'verify';
end;
$$;
