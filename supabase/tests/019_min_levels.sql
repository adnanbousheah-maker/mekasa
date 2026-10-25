-- الحد الأدنى بالفروع، وإشعاراته.
begin;
select no_plan();

select tests.create_staff('ffffffff-0000-4000-8000-000000000001', 'أحمد', '962797770001', 'SWF', '{branch_staff}');
select tests.create_staff('ffffffff-0000-4000-8000-000000000002', 'رنا', '962797770002', 'JBH', '{branch_staff}');

-- الصويفية: Latte موجود 30 قطعة والحد الأدنى 40، وCarrot موجود 30 والحد 20
select tests.authenticate_as('ffffffff-0000-4000-8000-000000000001');
select public.submit_count(tests.location('SWF'), format(
  '[{"product_id": "%s", "whole_cakes": 3}, {"product_id": "%s", "whole_cakes": 3}]',
  tests.product('Latte'), tests.product('Carrot'))::jsonb);
select tests.as_postgres();
update public.par_levels set min_pieces = 40
where location_id = tests.location('SWF') and product_id = tests.product('Latte');
update public.par_levels set min_pieces = 20
where location_id = tests.location('SWF') and product_id = tests.product('Carrot');
-- الجبيهة: Pecan حده الأدنى 10 وما في منه شي
update public.par_levels set min_pieces = 10
where location_id = tests.location('JBH') and product_id = tests.product('Pecan');

select results_eq(
  $$ select l.code, p.name_en, b.qty_pieces, b.min_pieces from public.v_below_min b
     join public.locations l on l.id = b.location_id join public.products p on p.id = b.product_id
     order by l.code $$,
  $$ values ('JBH', 'Pecan', 0, 10), ('SWF', 'Latte', 30, 40) $$,
  'only items under their minimum are listed, including items with no stock at all'
);

-- المصنع ومستودع التغليف كمان، كل واحد بأصنافه
insert into public.par_levels (location_id, product_id, par_pieces, min_pieces)
values (tests.location('FAC'), tests.product('Flan'), 0, 30),
       (tests.location('PKG'), tests.product('Cake Box'), 0, 200),
       (tests.location('PKG'), tests.product('Flan'), 0, 10);
select results_eq(
  $$ select l.code, p.name_en, b.min_pieces from public.v_below_min b
     join public.locations l on l.id = b.location_id join public.products p on p.id = b.product_id
     where l.kind <> 'branch' order by l.code $$,
  $$ values ('FAC', 'Flan', 30), ('PKG', 'Cake Box', 200) $$,
  'the factory and the packaging store have minimums too, each for its own kind of item'
);

select tests.authenticate_as('ffffffff-0000-4000-8000-000000000001');
select results_eq(
  $$ select p.name_en from public.v_below_min b join public.products p on p.id = b.product_id $$,
  $$ values ('Latte') $$,
  'a branch sees only its own items under the minimum'
);

select tests.as_postgres();
select throws_ok(
  $$ update public.par_levels set min_pieces = -1 where location_id = tests.location('SWF') and product_id = tests.product('Latte') $$,
  '23514', null, 'a minimum cannot be negative'
);

-- الإشعار مرة لكل فرع وصنف باليوم، وصنفين بنفس اليوم مسموح
insert into public.alert_log (kind, location_id, product_id, slot_date)
values ('below_min', tests.location('SWF'), tests.product('Latte'), public.amman_today()),
       ('below_min', tests.location('SWF'), tests.product('Carrot'), public.amman_today());
select throws_ok(
  $$ insert into public.alert_log (kind, location_id, product_id, slot_date)
     values ('below_min', tests.location('SWF'), tests.product('Latte'), public.amman_today()) $$,
  '23505', null, 'the same item at the same branch is alerted once a day'
);

select * from finish();
rollback;
