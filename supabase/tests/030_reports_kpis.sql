-- تقارير الإدارة بالكميات: الاستهلاك والتالف وانضباط الجرد لكل موقع، وكل صنف، وكل يوم.
begin;
select no_plan();

select tests.create_staff('8c8c8c8c-0000-4000-8000-000000000001', 'المدير العام', '962791160001', null, '{general_manager}');
select tests.create_staff('8c8c8c8c-0000-4000-8000-000000000002', 'أحمد', '962791160002', 'SWF', '{branch_staff}');

-- موعد جرد بالصويفية من 3 أيام
insert into public.count_schedules (location_id, time_of_day, is_active, created_at)
values (tests.location('SWF'), '00:01', true, now() - interval '3 days');

-- جردين: 3 كيكات (افتتاحي) وبعدين كيكة = استهلاك كيكتين، وكيكة تالفة
select tests.authenticate_as('8c8c8c8c-0000-4000-8000-000000000002');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb, now() - interval '2 hours');
select public.record_waste(tests.location('SWF'), tests.product('Flan'), 'cake', 1, 'broken');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 1}]', tests.product('Flan'))::jsonb, null,
  (select id from public.count_schedules where location_id = tests.location('SWF') and time_of_day = '00:01'));

select tests.authenticate_as('8c8c8c8c-0000-4000-8000-000000000001');
select results_eq(
  $$ select consumed_cakes, waste_cakes, counts_done from public.report_locations(public.count_day_today() - 1, public.count_day_today())
     where location_id = tests.location('SWF') $$,
  $$ values (1.0::numeric, 1.0::numeric, 1) $$,
  'consumption = 3 − 1 waste − 1 counted; the waste and the scheduled count are there'
);
select ok(
  (select counts_expected >= 1 from public.report_locations(public.count_day_today() - 1, public.count_day_today())
   where location_id = tests.location('SWF')),
  'the schedule is expected each day'
);
select is(
  (select count(*)::int from public.report_locations(public.count_day_today(), public.count_day_today())),
  (select count(*)::int from public.locations where is_active and kind in ('branch', 'factory')),
  'the general manager sees every branch and the factory'
);
select results_eq(
  $$ select consumed_pieces, waste_pieces from public.report_products(public.count_day_today() - 1, public.count_day_today())
     where product_id = tests.product('Flan') $$,
  $$ values (10, 10) $$,
  'per product, in pieces'
);
select ok(
  (select consumed_cakes = 1.0 from public.report_daily(public.count_day_today(), public.count_day_today())
   where location_id = tests.location('SWF')),
  'per day'
);
select throws_ok(
  $$ select * from public.report_locations('2026-01-01', '2025-01-01') $$,
  '23514', null, 'the period must make sense'
);
select throws_ok(
  $$ select * from public.report_locations('2024-01-01', '2026-01-01') $$,
  '23514', null, 'and be at most a year'
);

-- موظف الفرع بيشوف فرعه بس
select tests.authenticate_as('8c8c8c8c-0000-4000-8000-000000000002');
select results_eq(
  $$ select location_id from public.report_locations(public.count_day_today(), public.count_day_today()) $$,
  $$ values (tests.location('SWF')) $$,
  'branch staff only see their branch'
);

select * from finish();
rollback;
