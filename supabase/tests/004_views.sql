-- الـ views: الستوك، الاستهلاك، الدفعات، مواعيد اليوم، المواد الأولية.
begin;
select no_plan();

select tests.create_staff('33333333-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select tests.create_staff('33333333-0000-4000-8000-000000000003', 'سامر', '962793333333', 'FAC', '{storekeeper}');
select tests.create_staff('33333333-0000-4000-8000-000000000004', 'عدنان', '962794444444', null, '{admin}');

-- ─── الأصناف ─────────────────────────────────────────────────────────

update public.products set pieces_per_cake = 8 where name_en = 'Flan';

select results_eq(
  $$ select name_en, effective_pieces_per_cake::int from public.v_products
     where name_en in ('Classic Choco', 'Flan', 'Tiramisu') order by name_en $$,
  $$ values ('Classic Choco', 10), ('Flan', 8), ('Tiramisu', null::int) $$,
  'effective pieces per cake: global default, product override, none for pieces only'
);

-- ─── الاستهلاك ───────────────────────────────────────────────────────
-- أمس: جرد افتتاحي 3 كيكات + 5 قطع = 35. بعدها تالف 5 قطع. اليوم العد 2 كيكة = 20.
-- المتوقع 30، فالتعديل −10 والاستهلاك 10.

create temp table counts as
select
  tests.confirmed_count('SWF', '33333333-0000-4000-8000-000000000001', 'Classic Choco', 3, 5,
                        is_opening => true, started_at => now() - interval '1 day') as opening_line,
  tests.confirmed_count('SWF', '33333333-0000-4000-8000-000000000001', 'Classic Choco', 2, 0) as today_line;

select tests.count_movement((select opening_line from counts), 35, 'opening_balance');

insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, reason, recorded_by, occurred_at)
values (tests.location('SWF'), tests.product('Classic Choco'), 'piece', 5, 'expired',
        '33333333-0000-4000-8000-000000000001', now() - interval '12 hours');
insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
select occurred_at, location_id, product_id, -qty_pieces, 'waste', id from public.waste_records;

select tests.count_movement((select today_line from counts), -10);

select is(
  (select qty_pieces from public.v_stock_by_product
   where location_id = tests.location('SWF') and product_id = tests.product('Classic Choco')),
  20, 'current stock equals the latest count after its adjustment'
);

select results_eq(
  $$ select consumed_pieces from public.v_count_consumption $$,
  $$ values (10) $$,
  'consumption = previous count + in − out − waste − current count; the opening count is excluded'
);

-- رقم مستحيل: العد أكثر من المتوقع
select tests.count_movement(
  tests.confirmed_count('SWF', '33333333-0000-4000-8000-000000000001', 'Flan', 1, 0), 8);

select is(
  (select consumed_pieces from public.v_count_consumption where product_id = tests.product('Flan')),
  -8, 'counting more than expected shows as negative consumption (impossible, shown in red)'
);

-- ─── دفعات المصنع ────────────────────────────────────────────────────

select tests.count_movement(
  tests.confirmed_count('FAC', '33333333-0000-4000-8000-000000000003', 'Carrot', 2, 0,
                        batch_id => tests.batch('Carrot', public.amman_today() - 6), is_opening => true),
  20, 'opening_balance');
select tests.count_movement(
  tests.confirmed_count('FAC', '33333333-0000-4000-8000-000000000003', 'Carrot', 4, 0,
                        batch_id => tests.batch('Carrot', public.amman_today()), is_opening => true),
  40, 'opening_balance');

select results_eq(
  $$ select age_days, is_last_day, is_expired, qty_pieces
     from public.v_factory_batches order by production_date $$,
  $$ values (6, true, false, 20), (0, false, false, 40) $$,
  'a 6-day-old batch is on its last day with a 7-day shelf life'
);
select is(
  (select day_number::int from public.v_factory_batches where age_days = 0),
  public.day_number(public.amman_today())::int,
  'factory batches carry their day number'
);

-- ─── مواعيد جرد اليوم ────────────────────────────────────────────────

insert into public.stock_counts (location_id, schedule_id, method, counted_by)
select cs.location_id, cs.id, 'manual', '33333333-0000-4000-8000-000000000001'
from public.count_schedules cs
where cs.location_id = tests.location('SWF') and cs.time_of_day = '09:00';
update public.stock_counts set status = 'confirmed', confirmed_at = now() where schedule_id is not null;

select tests.authenticate_as('33333333-0000-4000-8000-000000000001');

select results_eq(
  $$ select time_of_day, status = 'done' from public.v_count_slots_today order by time_of_day $$,
  $$ values ('09:00'::time, true), ('21:00'::time, false) $$,
  'branch staff see their own count slots, and a confirmed scheduled count marks the slot done'
);

select tests.authenticate_as('33333333-0000-4000-8000-000000000004');
select is((select count(*)::int from public.v_count_slots_today), 6, 'admin sees every count slot today');

-- ─── الإخراج اللي ما انستلم ──────────────────────────────────────────

select tests.as_postgres();
update public.app_settings set unreceived_alert_hours = 3;
insert into public.dispatches (from_location_id, to_location_id, kind, dispatched_by, dispatched_at)
values
  (tests.location('FAC'), tests.location('DBQ'), 'replenishment', '33333333-0000-4000-8000-000000000003', now() - interval '16 hours'),
  (tests.location('FAC'), tests.location('SWF'), 'replenishment', '33333333-0000-4000-8000-000000000003', now() - interval '1 hour');

select results_eq(
  $$ select to_location_id, is_overdue from public.v_unreceived_dispatches order by dispatched_at $$,
  $$ values (tests.location('DBQ'), true), (tests.location('SWF'), false) $$,
  'a dispatch not received after the alert hours is overdue'
);

-- ─── المواد الأولية: بيكفي كم يوم ────────────────────────────────────

insert into public.raw_materials (name, base_unit, min_qty) values ('طحين الاختبار 004', 'كيلو', 100);
insert into public.raw_movements (occurred_at, location_id, material_id, qty_base, movement_type, supplier_name)
select now() - interval '10 days', tests.location('FAC'), id, 380, 'receipt', 'المطاحن' from public.raw_materials where name = 'طحين الاختبار 004';
-- صرف 14 × 20 كيلو = 280 بآخر 14 يوم → 20 باليوم، والموجود 100 → بيكفي 5 أيام
insert into public.raw_movements (occurred_at, location_id, material_id, qty_base, movement_type)
select now() - make_interval(days => d), tests.location('FAC'), m.id, -20, 'issue'
from public.raw_materials m, generate_series(0, 13) as d where m.name = 'طحين الاختبار 004';

select results_eq(
  $$ select qty_base::numeric, avg_daily_issue::numeric, days_left, below_min from public.v_raw_stock
     where material_id = (select id from public.raw_materials where name = 'طحين الاختبار 004') $$,
  $$ values (100::numeric, 20::numeric, 5, false) $$,
  'raw stock, daily usage over 14 days, and days left'
);

select * from finish();
rollback;
