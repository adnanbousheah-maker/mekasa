-- RLS: كل موظف بيشوف موقعه بس، الأدمن بيشوف الكل، والموقوف ما بيشوف شي.
begin;
select no_plan();

-- ─── التجهيز (كـ postgres، بدون RLS) ─────────────────────────────────

select tests.create_staff('11111111-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select tests.create_staff('11111111-0000-4000-8000-000000000002', 'رنا', '962792222222', 'JBH', '{branch_staff}');
select tests.create_staff('11111111-0000-4000-8000-000000000003', 'سامر', '962793333333', 'FAC', '{dispatcher,storekeeper}');
select tests.create_staff('11111111-0000-4000-8000-000000000004', 'عدنان', '962794444444', null, '{admin}');

-- جرد بالصويفية والجبيهة، وجرد بالدفعات بالمصنع
select tests.count_movement(
  tests.confirmed_count('SWF', '11111111-0000-4000-8000-000000000001', 'Classic Choco', 3, 5, is_opening => true),
  35, 'opening_balance');
select tests.count_movement(
  tests.confirmed_count('JBH', '11111111-0000-4000-8000-000000000002', 'Flan', 2, 0, is_opening => true),
  20, 'opening_balance');
select tests.count_movement(
  tests.confirmed_count('FAC', '11111111-0000-4000-8000-000000000003', 'Carrot', 4, 0,
                        batch_id => tests.batch('Carrot', public.amman_today()), is_opening => true),
  40, 'opening_balance');

-- تالف بالصويفية، وبخانة المرتجعات (تابعة للمصنع)
insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, pieces_per_cake_snapshot, reason, recorded_by)
values
  (tests.location('SWF'), tests.product('Classic Choco'), 'piece', 2, 10, 'broken', '11111111-0000-4000-8000-000000000001'),
  (tests.location('RET'), tests.product('Nightmare'), 'cake', 1, 10, 'expired', '11111111-0000-4000-8000-000000000003');

-- طلب من الجبيهة للمصنع، وإخراجه
with req as (
  insert into public.stock_requests (requesting_location_id, supplying_location_id, requested_by)
  values (tests.location('JBH'), tests.location('FAC'), '11111111-0000-4000-8000-000000000002')
  returning id
)
insert into public.dispatches (from_location_id, to_location_id, request_id, kind, dispatched_by)
select tests.location('FAC'), tests.location('JBH'), id, 'replenishment', '11111111-0000-4000-8000-000000000003' from req;
insert into public.dispatch_lines (dispatch_id, product_id, whole_cakes, pieces_per_cake_snapshot)
select id, tests.product('Flan'), 2, 10 from public.dispatches;

-- ─── موظف فرع الصويفية ───────────────────────────────────────────────

select tests.authenticate_as('11111111-0000-4000-8000-000000000001');

select is((select count(*)::int from public.locations), 6, 'branch staff read all locations');
select is((select count(*)::int from public.products), 24, 'branch staff read the products (cakes and packaging)');
select is((select count(*)::int from public.app_settings), 1, 'branch staff read the settings');

select results_eq(
  $$ select distinct location_id from public.stock_counts $$,
  $$ select tests.location('SWF') $$,
  'branch staff see only their own branch counts'
);
select results_eq(
  $$ select distinct location_id from public.stock_movements $$,
  $$ select tests.location('SWF') $$,
  'branch staff see only their own branch movements'
);
select is((select count(*)::int from public.stock_count_lines), 1, 'branch staff see only their own count lines');
select is((select count(*)::int from public.waste_records), 1, 'branch staff see only their own waste');
select is((select count(*)::int from public.par_levels), 20, 'branch staff see only their own par levels');
select is((select count(*)::int from public.count_form_versions), 1, 'branch staff see only their own count form');

select results_eq(
  $$ select id from public.staff $$,
  $$ values ('11111111-0000-4000-8000-000000000001'::uuid) $$,
  'staff read only their own staff row (no other phone numbers)'
);
-- (بس موظفين هالاختبار؛ ممكن يكون في موظفين تجريبيين من db:seed-staff)
select is((select count(*)::int from public.v_staff_names where id::text like '11111111-%'), 4, 'staff can read every active colleague''s name');
select throws_ok(
  $$ update public.v_staff_names set full_name = 'اسم ثاني' $$,
  '42501', null,
  'the names view (owner privileges) cannot be used to edit staff'
);
select is((select count(*)::int from public.staff_roles), 1, 'staff read only their own roles');
select is_empty($$ select 1 from public.audit_log $$, 'branch staff cannot read the audit log');
select is_empty($$ select 1 from public.login_attempts $$, 'branch staff cannot read login attempts');

select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id)
     values (now(), tests.location('SWF'), tests.product('Flan'), 100, 'count_adjustment', null) $$,
  '42501', null,
  'staff cannot write stock movements directly'
);
select throws_ok(
  $$ insert into public.stock_counts (location_id, method, counted_by)
     values (tests.location('SWF'), 'manual', '11111111-0000-4000-8000-000000000001') $$,
  '42501', null,
  'staff cannot create counts directly (only through the count functions)'
);
select throws_ok(
  $$ insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, reason, recorded_by)
     values (tests.location('SWF'), tests.product('Flan'), 'piece', 1, 'broken', '11111111-0000-4000-8000-000000000001') $$,
  '42501', null,
  'staff cannot record waste directly'
);
select is_empty(
  $$ update public.products set name_ar = 'شوكولاتة' returning id $$,
  'staff cannot edit products'
);
select is_empty(
  $$ update public.app_settings set returns_enabled = true returning id $$,
  'staff cannot change settings'
);
select is_empty(
  $$ update public.staff set full_name = 'غيّرت اسمي' returning id $$,
  'staff cannot edit staff rows, not even their own'
);
select throws_ok(
  $$ insert into public.staff_roles (staff_id, role) values ('11111111-0000-4000-8000-000000000001', 'admin') $$,
  '42501', null,
  'staff cannot grant themselves a role'
);
select throws_ok(
  $$ insert into public.par_levels (location_id, product_id, par_pieces)
     values (tests.location('SWF'), tests.product('Flan'), 999)
     on conflict (location_id, product_id) do update set par_pieces = 999 $$,
  '42501', null,
  'staff cannot change par levels'
);
select throws_ok(
  $$ insert into public.count_schedules (location_id, time_of_day) values (tests.location('SWF'), '13:00') $$,
  '42501', null,
  'staff cannot add count times'
);

select is_empty($$ select 1 from public.stock_requests $$, 'a branch does not see another branch''s requests');
select is_empty($$ select 1 from public.dispatches $$, 'a branch does not see dispatches to another branch');
select is_empty($$ select 1 from public.dispatch_lines $$, 'a branch does not see another branch''s dispatch lines');

-- الإشعارات: جهازه هو بس، وخدمات معروفة بس، وأقصى 5
select lives_ok(
  $$ insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
     values ('11111111-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/device-1', 'key', 'auth') $$,
  'staff register their own phone for notifications'
);
select throws_ok(
  $$ insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
     values ('11111111-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/device-x', 'key', 'auth') $$,
  '42501', null,
  'staff cannot register notifications for someone else'
);
select throws_ok(
  $$ insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
     values ('11111111-0000-4000-8000-000000000001', 'https://169.254.169.254/latest/meta-data/', 'key', 'auth') $$,
  '23514', null,
  'only known push services are accepted (no requests to internal addresses)'
);
select lives_ok(
  $$ insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
     select '11111111-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/device-' || i, 'key', 'auth'
     from generate_series(2, 5) as i $$,
  'staff can register up to five devices'
);
select throws_ok(
  $$ insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth_key)
     values ('11111111-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/device-6', 'key', 'auth') $$,
  '23514', null,
  'a sixth device is rejected'
);

-- ─── فرع الجبيهة: بيشوف طلبه وإخراجه ─────────────────────────────────

select tests.authenticate_as('11111111-0000-4000-8000-000000000002');
select is((select count(*)::int from public.stock_requests), 1, 'the requesting branch sees its request');
select is((select count(*)::int from public.dispatch_lines), 1, 'the receiving branch sees the dispatch lines');

-- ─── المصنع: بيشوف مرتجعاته كمان ─────────────────────────────────────

select tests.authenticate_as('11111111-0000-4000-8000-000000000003');

select results_eq(
  $$ select distinct location_id from public.stock_movements $$,
  $$ select tests.location('FAC') $$,
  'factory staff see factory movements only'
);
select results_eq(
  $$ select location_id from public.waste_records $$,
  $$ select tests.location('RET') $$,
  'factory staff see the returns bin under the factory'
);
select is((select count(*)::int from public.staff_roles), 2, 'a staff member with two roles sees both');
select is((select count(*)::int from public.stock_requests), 1, 'the supplying factory sees the branch request');
select is((select count(*)::int from public.dispatches), 1, 'the factory sees its dispatch');

-- ─── الأدمن ──────────────────────────────────────────────────────────

select tests.authenticate_as('11111111-0000-4000-8000-000000000004');

select is((select count(*)::int from public.stock_counts), 3, 'admin sees counts at every location');
select is((select count(*)::int from public.waste_records), 2, 'admin sees waste at every location');
select is((select count(*)::int from public.staff where id::text like '11111111-%'), 4, 'admin sees all staff');
select isnt_empty($$ select 1 from public.audit_log where table_name = 'staff' $$, 'admin reads the audit log');
select isnt_empty(
  $$ update public.products set name_ar = 'كلاسيك شوكو' where name_en = 'Classic Choco' returning id $$,
  'admin edits products'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id)
     values (now(), tests.location('SWF'), tests.product('Flan'), 100, 'count_adjustment', null) $$,
  '42501', null,
  'not even the admin writes stock movements directly'
);

-- ─── الإيقاف الفوري ──────────────────────────────────────────────────

select tests.as_postgres();
update public.staff set is_active = false where id = '11111111-0000-4000-8000-000000000001';
select tests.authenticate_as('11111111-0000-4000-8000-000000000001');

select is_empty($$ select 1 from public.products $$, 'a deactivated staff member sees no products');
select is_empty($$ select 1 from public.stock_counts $$, 'a deactivated staff member sees no counts');
select is_empty($$ select 1 from public.staff $$, 'a deactivated staff member cannot read their own row');
select is_empty($$ select 1 from public.v_staff_names $$, 'a deactivated staff member sees no names');
select is_empty($$ select 1 from public.push_subscriptions $$, 'a deactivated staff member sees no push subscriptions');

select tests.as_postgres();
update public.staff set is_active = false where id = '11111111-0000-4000-8000-000000000004';
select tests.authenticate_as('11111111-0000-4000-8000-000000000004');

select is_empty($$ select 1 from public.stock_counts $$, 'a deactivated admin sees no counts');
select is_empty($$ select 1 from public.audit_log $$, 'a deactivated admin cannot read the audit log');
select is_empty(
  $$ update public.products set name_ar = 'محاولة' returning id $$,
  'a deactivated admin cannot edit products'
);

-- ─── بدون دخول ───────────────────────────────────────────────────────

select tests.as_anon();
select throws_ok($$ select 1 from public.products $$, '42501', null, 'anon cannot read products');
select throws_ok($$ select 1 from public.v_staff_names $$, '42501', null, 'anon cannot read staff names');

select * from finish();
rollback;
