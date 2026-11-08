-- المرحلة أ: المدير العام بيقرأ كل شي وما بيكتب، مسؤول الفرع = موظف فرع، والإشعارات لصاحبها بس.
begin;
select no_plan();

select tests.create_staff('8a8a8a8a-0000-4000-8000-000000000001', 'المدير العام', '962791140001', null, '{general_manager}');
select tests.create_staff('8a8a8a8a-0000-4000-8000-000000000002', 'مسؤول الصويفية', '962791140002', 'SWF', '{branch_manager}');
select tests.create_staff('8a8a8a8a-0000-4000-8000-000000000003', 'موظف الجبيهة', '962791140003', 'JBH', '{branch_staff}');

select lives_ok($$ set constraints all immediate $$, 'a general manager needs no location, a branch manager sits at a branch');
set constraints all deferred;

select throws_ok(
  $$ select tests.create_staff('8a8a8a8a-0000-4000-8000-000000000004', 'غلط', '962791140004', 'FAC', '{branch_manager}');
     set constraints all immediate $$,
  '23514', null, 'a branch manager cannot sit at the factory'
);
set constraints all deferred;

-- المدير العام
select tests.authenticate_as('8a8a8a8a-0000-4000-8000-000000000001');
select ok((select count(*) from public.locations) >= 4, 'the general manager sees every location');
select ok((select count(*) from public.staff) >= 3, 'and every staff member');
select lives_ok($$ select count(*) from public.audit_log $$, 'and the audit log');
select is(
  (select count(*)::int from public.v_count_list), (select count(*)::int from public.stock_counts where status = 'confirmed'),
  'and every count'
);
select throws_ok(
  $$ select public.admin_set_staff_username('8a8a8a8a-0000-4000-8000-000000000003', 'nope') $$,
  '42501', null, 'but cannot manage staff'
);
update public.app_settings set count_late_after_minutes = 99;
select isnt(
  (select count_late_after_minutes::int from public.app_settings), 99,
  'and cannot change settings'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[]') $$, tests.location('SWF')),
  '42501', null, 'and does not count'
);

-- مسؤول الفرع
select tests.authenticate_as('8a8a8a8a-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.submit_count(%L, '[]') $$, tests.location('SWF')),
  'the branch manager counts their branch like branch staff'
);
select is(
  (select count(*)::int from public.stock_counts where location_id = tests.location('JBH')),
  0, 'but does not see other branches'' counts'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[]') $$, tests.location('JBH')),
  '42501', null, 'or count there'
);

-- الإشعارات
reset role;
insert into public.notifications (staff_id, kind, title, url) values
  ('8a8a8a8a-0000-4000-8000-000000000002', 'test', 'إلك', '/orders'),
  ('8a8a8a8a-0000-4000-8000-000000000002', 'test', 'وكمان إلك', null),
  ('8a8a8a8a-0000-4000-8000-000000000003', 'test', 'لغيرك', null);
select throws_ok(
  $$ insert into public.notifications (staff_id, kind, title, url) values ('8a8a8a8a-0000-4000-8000-000000000002', 'x', 'y', 'https://evil.example') $$,
  '23514', null, 'links stay inside the app'
);

select tests.authenticate_as('8a8a8a8a-0000-4000-8000-000000000002');
select is((select count(*)::int from public.notifications), 2, 'staff see only their own notifications');
select throws_ok(
  $$ insert into public.notifications (staff_id, kind, title) values ('8a8a8a8a-0000-4000-8000-000000000002', 'x', 'y') $$,
  '42501', null, 'staff cannot write notifications'
);
select is(
  public.mark_notifications_read((select array_agg(id) from public.notifications where title = 'إلك')),
  1, 'one notification is marked read'
);
select is(public.mark_notifications_read(), 1, 'mark all reads the rest');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'nothing left unread');
reset role;
select is(
  (select read_at from public.notifications where title = 'لغيرك'), null,
  'other people''s notifications are untouched'
);

select * from finish();
rollback;
