-- سوبر أدمن IT: الدور محمي، وضع المعاينة والمهام بإيده، وزر التصفير.
begin;
select no_plan();

select tests.create_staff('9e9e9e9e-0000-4000-8000-000000000001', 'IT', '962791180001', null, '{admin,it_admin}');
select tests.create_staff('9e9e9e9e-0000-4000-8000-000000000002', 'أدمن', '962791180002', null, '{admin}');
select tests.create_staff('9e9e9e9e-0000-4000-8000-000000000003', 'أحمد', '962791180003', 'SWF', '{branch_staff}');

select ok((select preview_mode and not feature_tasks from public.app_settings), 'preview on and tasks hidden by default');

-- الأدمن العادي ما بيقدر يعطي دور IT ولا يشيله ولا يعدّل حساب IT
select tests.authenticate_as('9e9e9e9e-0000-4000-8000-000000000002');
select ok(not private.is_it_admin(), 'a plain admin is not IT');
select throws_ok(
  $$ select public.admin_save_staff('9e9e9e9e-0000-4000-8000-000000000003', 'أحمد', '962791180003', '{branch_staff,it_admin}', tests.location('SWF')) $$,
  '42501', null, 'an admin cannot grant the IT role'
);
select throws_ok(
  $$ select public.admin_set_staff_active('9e9e9e9e-0000-4000-8000-000000000001', false) $$,
  '42501', null, 'an admin cannot deactivate the IT account'
);
select throws_ok(
  $$ select public.admin_save_staff('9e9e9e9e-0000-4000-8000-000000000001', 'غيّرته', '962791180001', '{admin}', null) $$,
  '42501', null, 'an admin cannot edit the IT account'
);
select throws_ok(
  $$ update public.app_settings set feature_tasks = true $$,
  '42501', null, 'an admin cannot turn on hidden features'
);
select throws_ok(
  $$ select public.it_reset_operations('صفّر') $$,
  '42501', null, 'an admin cannot reset the system'
);

-- IT بيعدّل حسابه بالفورم بدون ما يضيع الدور
select tests.authenticate_as('9e9e9e9e-0000-4000-8000-000000000001');
select ok(private.is_it_admin() and private.is_admin(), 'IT is also an admin');
select public.admin_save_staff('9e9e9e9e-0000-4000-8000-000000000001', 'Adnan IT', '962791180001', '{admin}', null);
select ok(
  exists (select 1 from public.staff_roles where staff_id = '9e9e9e9e-0000-4000-8000-000000000001' and role = 'it_admin'),
  'saving the IT account from the form keeps its IT role'
);

-- المهام بإيده
update public.app_settings set feature_tasks = true;
select ok((select feature_tasks from public.app_settings), 'IT turns tasks on');
update public.app_settings set feature_tasks = false;

-- شغل تجريبي، وبعدين تصفير
select tests.authenticate_as('9e9e9e9e-0000-4000-8000-000000000003');
select public.submit_count(tests.location('SWF'), format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Latte'))::jsonb);
select tests.authenticate_as('9e9e9e9e-0000-4000-8000-000000000001');
select throws_ok($$ select public.it_reset_operations('اه') $$, '23514', null, 'reset needs the confirmation word');
select public.it_reset_operations('صفّر');
select tests.as_postgres();
select is((select count(*)::int from public.stock_movements), 0, 'reset clears the ledger');
select is((select count(*)::int from public.stock_counts), 0, 'reset clears counts');
select ok((select count(*) from public.staff where id::text like '9e9e9e9e%') = 3, 'reset keeps staff');
select ok((select count(*) from public.products) > 0 and (select count(*) from public.locations) > 0, 'reset keeps products and locations');
select is(
  (select reason from public.audit_log order by id desc limit 1), 'تصفير النظام (فترة المعاينة)',
  'the reset itself is recorded'
);
select throws_ok($$ truncate public.stock_movements $$, '23001', null, 'ledger protection is back on after the reset');

-- بعد المعاينة: التصفير مسكّر وما بيرجع
select tests.authenticate_as('9e9e9e9e-0000-4000-8000-000000000001');
update public.app_settings set preview_mode = false;
select throws_ok($$ update public.app_settings set preview_mode = true $$, '23514', null, 'preview mode never comes back');
select throws_ok($$ select public.it_reset_operations('صفّر') $$, '23514', null, 'reset is closed after the preview');

select * from finish();
rollback;
