-- دوال إدارة الموظفين: الأدمن بس، وكل شي بـ transaction وحدة.
begin;
select no_plan();

select tests.create_staff('77777777-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select tests.create_staff('77777777-0000-4000-8000-000000000004', 'عدنان', '962794444444', null, '{admin}');

-- حساب دخول لموظف جديد (السيرفر بيعمله بـ service role قبل ما ينادي الدالة)
insert into auth.users (id, aud, role, email)
values ('77777777-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'new@test.mekasa.local');

-- ─── موظف عادي ما بيقدر ──────────────────────────────────────────────

select tests.authenticate_as('77777777-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000009', 'سامي', '962795555555', '{branch_staff}', tests.location('SWF')) $$,
  '42501', null, 'staff cannot create staff'
);
select throws_ok(
  $$ select public.admin_set_staff_active('77777777-0000-4000-8000-000000000004', false) $$,
  '42501', null, 'staff cannot deactivate anyone'
);
select throws_ok(
  $$ select public.admin_record_pin_reset('77777777-0000-4000-8000-000000000001') $$,
  '42501', null, 'staff cannot unlock themselves'
);

-- ─── الأدمن ──────────────────────────────────────────────────────────

select tests.authenticate_as('77777777-0000-4000-8000-000000000004');

select lives_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000009', '  سامي  ', '962795555555', '{dispatcher,storekeeper}', tests.location('FAC')) $$,
  'the admin creates a staff member with two roles'
);
select results_eq(
  $$ select s.full_name, s.created_by, array_agg(r.role::text order by r.role)
     from public.staff s join public.staff_roles r on r.staff_id = s.id
     where s.id = '77777777-0000-4000-8000-000000000009'
     group by s.full_name, s.created_by $$,
  $$ values ('سامي', '77777777-0000-4000-8000-000000000004'::uuid, array['dispatcher', 'storekeeper']) $$,
  'the new staff member is saved with a trimmed name, the creator and both roles'
);

-- نقل لفرع وتغيير الدور مع بعض: بتنجح لأنها transaction وحدة
select lives_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000009', 'سامي', '962795555555', '{branch_staff}', tests.location('JBH')) $$,
  'moving to a branch and changing the role together works'
);
select results_eq(
  $$ select role::text from public.staff_roles where staff_id = '77777777-0000-4000-8000-000000000009' $$,
  $$ values ('branch_staff') $$,
  'the old roles are removed'
);

select throws_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000009', 'سامي', '962791111111', '{branch_staff}', tests.location('JBH')) $$,
  '23505', null, 'two staff members cannot share a phone number'
);
select throws_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000009', 'سامي', '962795555555', '{}', tests.location('JBH')) $$,
  '23514', null, 'a staff member needs a role'
);
select throws_ok(
  $$ select public.admin_save_staff('77777777-0000-4000-8000-000000000004', 'عدنان', '962794444444', '{branch_staff}', null) $$,
  '23514', null, 'the admin cannot remove their own admin role'
);

select throws_ok(
  $$ select public.admin_set_staff_active('77777777-0000-4000-8000-000000000004', false) $$,
  '23514', null, 'the admin cannot deactivate themselves'
);

select tests.as_postgres();
insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
values ('77777777-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/a', 'k', 'a');
insert into auth.sessions (id, user_id, created_at, updated_at)
values (gen_random_uuid(), '77777777-0000-4000-8000-000000000001', now(), now());
select tests.authenticate_as('77777777-0000-4000-8000-000000000004');

select lives_ok(
  $$ select public.admin_set_staff_active('77777777-0000-4000-8000-000000000001', false) $$,
  'the admin deactivates a staff member'
);
select tests.as_postgres();
select is(
  (select is_active from public.staff where id = '77777777-0000-4000-8000-000000000001'), false,
  'the staff member is inactive'
);
select is_empty(
  $$ select 1 from public.push_subscriptions where staff_id = '77777777-0000-4000-8000-000000000001' $$,
  'their notification subscriptions are removed'
);
select is_empty(
  $$ select 1 from auth.sessions where user_id = '77777777-0000-4000-8000-000000000001' $$,
  'all their sessions are deleted, so reactivating does not bring an old session back'
);
select isnt_empty(
  $$ select 1 from public.audit_log
     where table_name = 'staff' and row_id = '77777777-0000-4000-8000-000000000001'
       and changed_by = '77777777-0000-4000-8000-000000000004'
       and (new_values ->> 'is_active') = 'false' $$,
  'the deactivation is audited with who did it'
);

update public.staff set failed_pin_attempts = 10, requires_admin_reset = true
where id = '77777777-0000-4000-8000-000000000001';
select tests.authenticate_as('77777777-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.admin_record_pin_reset('77777777-0000-4000-8000-000000000001') $$,
  'the admin records a new PIN'
);
select tests.as_postgres();
select results_eq(
  $$ select failed_pin_attempts::int, locked_until, requires_admin_reset
     from public.staff where id = '77777777-0000-4000-8000-000000000001' $$,
  $$ values (0, null::timestamptz, false) $$,
  'a new PIN clears the lock'
);
select isnt_empty(
  $$ select 1 from public.audit_log
     where reason = 'رمز دخول جديد' and row_id = '77777777-0000-4000-8000-000000000001'
       and changed_by = '77777777-0000-4000-8000-000000000004' $$,
  'the PIN reset is audited with who did it'
);

-- ─── لازم يضل أدمن فعّال ─────────────────────────────────────────────

select tests.create_staff('77777777-0000-4000-8000-000000000005', 'مدير ثاني', '962796666666', null, '{admin}');
select tests.authenticate_as('77777777-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.admin_set_staff_active('77777777-0000-4000-8000-000000000005', false) $$,
  'an admin can deactivate another admin while one remains'
);
select tests.as_postgres();
-- أي أدمن تجريبي من db:seed-staff ما بيعد هون
update public.staff set is_active = false where id::text not like '77777777-%';
update public.staff set is_active = false where id = '77777777-0000-4000-8000-000000000004';
select throws_ok(
  $$ select private.assert_an_active_admin_remains() $$,
  '23514', null, 'the system refuses to be left without an active admin'
);
update public.staff set is_active = true where id = '77777777-0000-4000-8000-000000000004';

select tests.as_anon();
select throws_ok(
  $$ select public.admin_record_pin_reset('77777777-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call the staff functions'
);

select * from finish();
rollback;
