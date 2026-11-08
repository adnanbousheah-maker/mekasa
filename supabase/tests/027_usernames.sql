-- الدخول باسم المستخدم: الأدمن بيحطه، ما بيتكرر، والقفل نفسه تبع الرقم.
begin;
select no_plan();

select tests.create_staff('89898989-0000-4000-8000-000000000001', 'أدمن', '962791130001', null, '{admin}');
select tests.create_staff('89898989-0000-4000-8000-000000000002', 'أحمد', '962791130002', 'SWF', '{branch_staff}');
select tests.create_staff('89898989-0000-4000-8000-000000000003', 'رنا', '962791130003', 'JBH', '{branch_staff}');

select tests.authenticate_as('89898989-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.admin_set_staff_username('89898989-0000-4000-8000-000000000002', 'ahmad') $$,
  '42501', null, 'staff cannot set their own username'
);

select tests.authenticate_as('89898989-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.admin_set_staff_username('89898989-0000-4000-8000-000000000002', '  Ahmad.K ') $$,
  'the admin sets a username'
);
select is(
  (select username from public.staff where id = '89898989-0000-4000-8000-000000000002'),
  'ahmad.k', 'the username is trimmed and lowercased'
);
select throws_ok(
  $$ select public.admin_set_staff_username('89898989-0000-4000-8000-000000000003', 'ahmad.k') $$,
  '23505', null, 'a username belongs to one person'
);
select throws_ok(
  $$ select public.admin_set_staff_username('89898989-0000-4000-8000-000000000003', 'رنا') $$,
  '23514', null, 'a username is in English letters'
);
select lives_ok(
  $$ select public.admin_set_staff_username('89898989-0000-4000-8000-000000000003', '') $$,
  'an empty username means none'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'staff'
   and row_id = '89898989-0000-4000-8000-000000000002'),
  2, 'the change is in the audit log (created + username)'
);

-- الدخول
select tests.as_postgres();
select is(
  (select status from public.auth_reserve_login_attempt('AHMAD.K', null)),
  'verify', 'a username goes on to PIN verification, any case'
);
select is(
  (select staff_id from public.auth_reserve_login_attempt('962791130002', null)),
  '89898989-0000-4000-8000-000000000002'::uuid, 'the phone still works'
);
select is(
  (select failed_pin_attempts::int from public.staff where id = '89898989-0000-4000-8000-000000000002'),
  2, 'both ways count against the same lock'
);
select is(
  (select status from public.auth_reserve_login_attempt('nobody', null)),
  'unknown', 'an unknown username looks like an unknown phone'
);

select * from finish();
rollback;
