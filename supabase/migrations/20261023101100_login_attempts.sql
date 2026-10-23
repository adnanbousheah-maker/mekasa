-- محاولات الدخول: القفل كله هون، بقفل على صف الموظف، مشان الطلبات المتزامنة ما تتخطاه.
-- كل محاولة بتنحسب غلط قبل ما الرمز ينفحص، وبتنمسح بس لما الدخول ينجح.
-- الدوال للسيرفر بس (service role)، مش للمستخدمين.

-- القيم لازم تطابق LOCKOUT بـ src/features/auth/lockout.ts
-- p_ip اختياري: محلياً ما في عنوان، والعميل ما بيبعت المعامل أصلاً
create function public.auth_reserve_login_attempt(p_phone text, p_ip inet default null)
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

  -- حد الـ IP: بيحسب هالمحاولة كمان، فالمتزامنة ما بتفلت
  if p_ip is not null and (
    select count(*) from public.login_attempts a
    where a.ip = p_ip and not a.succeeded and a.attempted_at > now() - ip_window
  ) > ip_failure_limit then
    return query select v_attempt, null::uuid, 'blocked';
    return;
  end if;

  select * into v_staff from public.staff s where s.phone = p_phone for update;

  if not found or not v_staff.is_active then
    return query select v_attempt, null::uuid, 'unknown';
    return;
  end if;

  if v_staff.requires_admin_reset or v_staff.locked_until > now() then
    return query select v_attempt, v_staff.id, 'blocked';
    return;
  end if;

  -- بنحجز المحاولة كغلط قبل الفحص. (بـ SET، failed_pin_attempts هي القيمة القديمة)
  update public.staff
  set failed_pin_attempts = failed_pin_attempts + 1,
      locked_until = case when failed_pin_attempts + 1 = timed_lock_after then now() + timed_lock end,
      requires_admin_reset = failed_pin_attempts + 1 >= admin_reset_after
  where id = v_staff.id;

  return query select v_attempt, v_staff.id, 'verify';
end;
$$;

-- الرمز صح: بنمسح العداد والقفل، وبنعلّم المحاولة ناجحة.
create function public.auth_record_login_success(p_attempt_id bigint, p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.login_attempts set succeeded = true where id = p_attempt_id;
  update public.staff
  set failed_pin_attempts = 0, locked_until = null, requires_admin_reset = false, last_login_at = now()
  where id = p_staff_id;
end;
$$;

revoke execute on function
  public.auth_reserve_login_attempt(text, inet),
  public.auth_record_login_success(bigint, uuid)
from public, anon, authenticated;
grant execute on function
  public.auth_reserve_login_attempt(text, inet),
  public.auth_record_login_success(bigint, uuid)
to service_role;
