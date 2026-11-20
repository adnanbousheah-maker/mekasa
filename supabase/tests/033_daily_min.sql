-- 19 نوفمبر 2026: الحد الأدنى للفروع حسب اليوم (par_level_daily_min و v_below_min)
begin;
select no_plan();

select tests.create_staff('9c9c9c9c-0000-4000-8000-000000000001', 'أدمن الحد اليومي', '962799990301', null, array['admin']::public.app_role[]);
select tests.create_staff('9c9c9c9c-0000-4000-8000-000000000002', 'موظف الحد اليومي', '962799990302', 'SWF', array['branch_staff']::public.app_role[]);

-- أول جرد بالصويفية مشان الفحص يشتغل: Flan كيكتين
select tests.authenticate_as('9c9c9c9c-0000-4000-8000-000000000002');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb, now() - interval '5 minutes');

select tests.authenticate_as('9c9c9c9c-0000-4000-8000-000000000001');
insert into public.par_levels (location_id, product_id, par_pieces, min_pieces)
values (tests.location('SWF'), tests.product('Flan'), 100, 10)
on conflict (location_id, product_id) do update set min_pieces = 10;

select is(
  (select min_pieces from public.v_below_min where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  null::int, 'Flan (20 pieces) is above the general minimum of 10'
);

-- حد اليوم أعلى من الموجود: بيطلع تحت الحد
insert into public.par_level_daily_min (location_id, product_id, weekday, min_pieces)
values (tests.location('SWF'), tests.product('Flan'), public.day_number(public.count_day_today()), 50);
select is(
  (select min_pieces from public.v_below_min where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  50, 'today''s own minimum wins over the general one'
);

-- حد يوم ثاني ما بيأثر
update public.par_level_daily_min set weekday = public.day_number(public.count_day_today() + 1)
where location_id = tests.location('SWF') and product_id = tests.product('Flan');
select is(
  (select count(*)::int from public.v_below_min where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  0, 'another day''s minimum does not count today'
);

select throws_ok(
  format($$ insert into public.par_level_daily_min (location_id, product_id, weekday, min_pieces) values (%L, %L, 1, 5) $$,
    tests.location('FAC'), tests.product('Flan')),
  '23514', null, 'daily minimums are for branches only'
);
select throws_ok(
  format($$ insert into public.par_level_daily_min (location_id, product_id, weekday, min_pieces) values (%L, %L, 8, 5) $$,
    tests.location('SWF'), tests.product('Flan')),
  '23514', null, 'the weekday is 1 to 7'
);
select ok(
  exists (select 1 from public.audit_log where table_name = 'par_level_daily_min'),
  'daily minimum changes are in the audit log'
);

select tests.authenticate_as('9c9c9c9c-0000-4000-8000-000000000002');
select throws_ok(
  format($$ insert into public.par_level_daily_min (location_id, product_id, weekday, min_pieces) values (%L, %L, 3, 5) $$,
    tests.location('SWF'), tests.product('Latte')),
  '42501', null, 'staff cannot set minimums'
);
select ok(
  (select count(*) from public.par_level_daily_min) > 0, 'the branch can read its own daily minimums'
);

-- اقتراح الطلبية بياخذ حد بكرا (الحد اللي نقلناه لبكرا فوق = 50)
select is(
  (select min_pieces from public.branch_min_tomorrow(tests.location('SWF')) where product_id = tests.product('Flan')),
  50, 'the order suggestion reads tomorrow''s minimum'
);
select throws_ok(
  format($$ select * from public.branch_min_tomorrow(%L) $$, tests.location('DBQ')),
  '42501', null, 'a branch cannot read another branch''s minimums'
);

select * from finish();
rollback;
