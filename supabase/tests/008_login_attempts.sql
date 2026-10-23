-- القفل بقاعدة البيانات: كل محاولة بتنحسب قبل فحص الرمز، والنجاح بس بيمسح العداد.
begin;
select no_plan();

select tests.create_staff('88888888-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');

create temp table r (n int generated always as identity, attempt_id bigint, staff_id uuid, status text);
create function pg_temp.attempt(p_phone text, p_ip inet default null) returns text language sql as $$
  insert into r (attempt_id, staff_id, status)
  select * from public.auth_reserve_login_attempt(p_phone, p_ip)
  returning status
$$;

-- ─── مين بيقدر ينادي ─────────────────────────────────────────────────

select tests.authenticate_as('88888888-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.auth_reserve_login_attempt('962791111111', null) $$,
  '42501', null, 'signed-in staff cannot call the login bookkeeping'
);
select throws_ok(
  $$ select public.auth_record_login_success(1, '88888888-0000-4000-8000-000000000001') $$,
  '42501', null, 'signed-in staff cannot clear their own lock'
);
select tests.as_postgres();

-- ─── رقم مش موجود ────────────────────────────────────────────────────

select is(pg_temp.attempt('962799999999'), 'unknown', 'an unknown phone is reported as unknown (the app shows the same message)');
select is(
  (select count(*)::int from public.login_attempts where phone = '962799999999' and not succeeded), 1,
  'the attempt is recorded even for an unknown phone'
);

-- ─── العداد قبل الفحص ────────────────────────────────────────────────

select is(pg_temp.attempt('962791111111'), 'verify', 'a known phone goes on to PIN verification');
select is(
  (select failed_pin_attempts::int from public.staff where phone = '962791111111'), 1,
  'the attempt counts as failed before the PIN is checked'
);

-- 4 كمان = 5 بالمجموع
select pg_temp.attempt('962791111111') from generate_series(1, 4);
select is(
  (select locked_until is not null from public.staff where phone = '962791111111'), true,
  'the fifth attempt locks the account'
);
select is(pg_temp.attempt('962791111111'), 'blocked', 'a locked account is blocked before any PIN check');
select is(
  (select failed_pin_attempts::int from public.staff where phone = '962791111111'), 5,
  'blocked attempts do not count again'
);

-- النجاح بيمسح كل شي
select public.auth_record_login_success(
  (select attempt_id from r where status = 'verify' order by n desc limit 1),
  '88888888-0000-4000-8000-000000000001'
);
select results_eq(
  $$ select failed_pin_attempts::int, locked_until, requires_admin_reset, last_login_at is not null
     from public.staff where phone = '962791111111' $$,
  $$ values (0, null::timestamptz, false, true) $$,
  'a correct PIN clears the counter and the lock and records the login'
);
select is(
  (select succeeded from public.login_attempts where id = (select attempt_id from r where status = 'verify' order by n desc limit 1)),
  true, 'the successful attempt is marked as such'
);

-- ─── بعد 10: لحد ما الأدمن يعطي رمز جديد ─────────────────────────────

update public.staff set failed_pin_attempts = 9, locked_until = null where phone = '962791111111';
select is(pg_temp.attempt('962791111111'), 'verify', 'the tenth attempt is still checked');
select is(
  (select requires_admin_reset from public.staff where phone = '962791111111'), true,
  'the tenth wrong attempt needs the admin'
);
select is(pg_temp.attempt('962791111111'), 'blocked', 'after ten, every attempt is blocked');

-- ─── الموقوف ─────────────────────────────────────────────────────────

update public.staff set is_active = false, failed_pin_attempts = 0, requires_admin_reset = false
where phone = '962791111111';
select is(pg_temp.attempt('962791111111'), 'unknown', 'a deactivated account looks like an unknown phone');

-- ─── حد الـ IP ───────────────────────────────────────────────────────

insert into public.login_attempts (phone, ip, succeeded)
select '96279000' || lpad(i::text, 4, '0'), '203.0.113.7', false from generate_series(1, 20) as i;
select is(pg_temp.attempt('962799999998', '203.0.113.7'), 'blocked', 'more than 20 failures from one address in 15 minutes blocks it');
select is(pg_temp.attempt('962799999998', '203.0.113.8'), 'unknown', 'other addresses are not affected');

select * from finish();
rollback;
