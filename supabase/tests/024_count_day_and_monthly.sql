-- يوم الجرد بيخلص 5 الصبح، وجرد آخر الشهر.
begin;
select no_plan();

-- ─── يوم الجرد ───────────────────────────────────────────────────────

select is(
  private.count_day('2026-11-05 00:40+03'),
  date '2026-11-04',
  'a count at 00:40 belongs to the day before'
);
select is(private.count_day('2026-11-05 05:00+03'), date '2026-11-05', 'from 5 in the morning it is the new day');
select is(private.count_day('2026-11-04 23:00+03'), date '2026-11-04', 'a count at 23:00 is that day');

select is(
  private.slot_at(date '2026-11-04', time '00:40'),
  timestamptz '2026-11-05 00:40+03',
  'a 00:40 slot is after midnight'
);
select is(private.slot_at(date '2026-11-04', time '23:00'), timestamptz '2026-11-04 23:00+03', 'a 23:00 slot is that evening');

select tests.create_staff('acacacac-0000-4000-8000-000000000041', 'رنا', '962799990041', 'JBH', '{branch_staff}');
select tests.create_staff('acacacac-0000-4000-8000-000000000042', 'أدمن', '962799990042', null, '{admin}');

-- الجرد بينسجل على يوم الجرد مهما كان business_date المكتوب
select tests.as_postgres();
insert into public.stock_counts (location_id, business_date, started_at, counted_by, method)
values (tests.location('JBH'), date '2000-01-01', now(), 'acacacac-0000-4000-8000-000000000041', 'manual');
select is(
  (select business_date from public.stock_counts where location_id = tests.location('JBH') order by created_at desc limit 1),
  public.count_day_today(),
  'a new count takes the count day of its start'
);

-- ─── جرد آخر الشهر ───────────────────────────────────────────────────

select ok(
  (select count(*) from public.monthly_counts where is_active) >= 6,
  'every place has a monthly count, and the factory its raw materials'
);

select throws_ok(
  $$ insert into public.monthly_counts (location_id, scope, time_of_day) values (tests.location('SWF'), 'raw', '22:00') $$,
  '23514', null,
  'raw materials are counted at the factory only'
);

select tests.authenticate_as('acacacac-0000-4000-8000-000000000041');
select is(
  (select count(*)::int from public.monthly_counts where location_id = tests.location('JBH')),
  1,
  'staff see the monthly counts'
);
update public.monthly_counts set time_of_day = '01:00' where location_id = tests.location('JBH');
select tests.as_postgres();
select is(
  (select time_of_day from public.monthly_counts where location_id = tests.location('JBH') and scope = 'stock'),
  time '23:00',
  'staff cannot change the monthly count'
);

-- الـ view بترجع صفوف بس بآخر يوم بالشهر
select tests.authenticate_as('acacacac-0000-4000-8000-000000000042');
select is(
  (select count(*) > 0 from public.v_monthly_counts_today),
  public.count_day_today() = (date_trunc('month', public.count_day_today()) + interval '1 month - 1 day')::date,
  'monthly counts show only on the last day of the month'
);

-- انعمل؟ جرد من الصبح ما بيحسب، والمواد الأولية لازم كلها
select tests.as_postgres();
update public.stock_counts set status = 'confirmed', confirmed_at = now()
where location_id = tests.location('JBH') and business_date = public.count_day_today();
select ok(
  private.monthly_count_done(tests.location('JBH'), 'stock', public.count_day_today(), now() + interval '1 hour'),
  'a count started shortly before the monthly time counts'
);
select ok(
  not private.monthly_count_done(tests.location('JBH'), 'stock', public.count_day_today(), now() + interval '5 hours'),
  'a count from hours before the monthly time does not'
);
select ok(
  not private.monthly_count_done(tests.location('FAC'), 'raw', public.count_day_today(), now()),
  'raw materials are not done without counting every material'
);
select throws_ok(
  $$ select public.monthly_count_done(tests.location('FAC'), 'raw', public.count_day_today(), now()) $$,
  '42501', null,
  'only the cron can call the public check'
) from (select set_config('role', 'authenticated', true)) r;

select * from finish();
rollback;
