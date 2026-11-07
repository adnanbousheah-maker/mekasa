-- الصوصات: بتنطلب من المصنع مع الكيك، بتطلع بدون دفعات، وبتنعدّ بجرد لحالها.
begin;
select no_plan();

select tests.create_staff('afafafaf-0000-4000-8000-000000000001', 'أحمد', '962791120001', 'SWF', '{branch_staff}');
select tests.create_staff('afafafaf-0000-4000-8000-000000000002', 'سامر', '962791120002', 'FAC', '{dispatcher,storekeeper}');
select tests.create_staff('afafafaf-0000-4000-8000-000000000003', 'رنا', '962791120003', 'JBH', '{branch_staff}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into public.products (name_en, name_ar, kind, sell_mode) values
  ('Test Caramel Sauce', 'صوص كراميل', 'sauce', 'pieces_only'),
  ('Test Choco Sauce', 'صوص شوكولاتة', 'sauce', 'pieces_only');

select throws_ok(
  $$ insert into public.products (name_en, kind, sell_mode, pieces_per_cake) values ('Bad Sauce', 'sauce', 'whole_and_pieces', 8) $$,
  '23514', null, 'a sauce is counted by the unit'
);

-- رصيد افتتاحي بالمصنع: جرد الصوصات
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000002');
insert into ids values ('fac_sauce', public.submit_sauce_count(
  format('[{"product_id": "%s", "loose_pieces": 30}]', tests.product('Test Caramel Sauce'))::jsonb));
select results_eq(
  format($$ select scope, is_opening from public.stock_counts where id = %L $$, (select id from ids where name = 'fac_sauce')),
  $$ values ('sauce', true) $$,
  'the first sauce count is an opening balance'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Test Caramel Sauce')),
  30, 'the factory has the counted sauces'
);
select throws_ok(
  format($$ select public.submit_sauce_count('[{"product_id": "%s", "loose_pieces": 1}]') $$, tests.product('Flan')),
  '23514', null, 'cakes are not counted in the sauce count'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "loose_pieces": 1}]') $$,
    tests.location('FAC'), tests.product('Test Caramel Sauce')),
  '23514', null, 'sauces are not counted in the cake count'
);

-- الطلب: كيك وصوصات بنفس الطلب من المصنع
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000001');
insert into ids values ('request', public.create_request(format(
  '[{"product_id": "%s", "loose_pieces": 4}, {"product_id": "%s", "loose_pieces": 2}]',
  tests.product('Test Caramel Sauce'), tests.product('Test Choco Sauce'))::jsonb));
select is(
  (select supplying_location_id from public.stock_requests where id = (select id from ids where name = 'request')),
  tests.location('FAC'), 'sauces are ordered from the factory'
);
select lives_ok(
  format($$ select public.create_request('[{"product_id": "%s", "whole_cakes": 1}, {"product_id": "%s", "loose_pieces": 3}]') $$,
    tests.product('Flan'), tests.product('Test Caramel Sauce')),
  'one request mixes cakes and sauces'
);
select throws_ok(
  format($$ select public.create_request('[{"product_id": "%s", "loose_pieces": 3}, {"product_id": "%s", "loose_pieces": 20}]') $$,
    tests.product('Test Caramel Sauce'), tests.product('Cake Box')),
  '23514', null, 'sauces and packaging do not mix'
);

-- الإخراج: بدون دفعات
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000002');
insert into ids values ('dispatch', public.create_dispatch(
  tests.location('SWF'),
  (select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'loose_pieces', l.loose_pieces, 'request_line_id', l.id))
   from public.stock_request_lines l where l.request_id = (select id from ids where name = 'request')),
  (select id from ids where name = 'request')));
select results_eq(
  format($$ select count(*)::int, count(m.batch_id)::int, sum(m.qty_pieces)::int from public.stock_movements m
     join public.dispatch_lines dl on dl.id = m.dispatch_line_id where dl.dispatch_id = %L $$,
    (select id from ids where name = 'dispatch')),
  $$ values (2, 0, -6) $$,
  'sauces leave the factory without batches'
);
select is(
  (select count(*)::int from public.dispatch_line_batches x
   join public.dispatch_lines dl on dl.id = x.dispatch_line_id where dl.dispatch_id = (select id from ids where name = 'dispatch')),
  0, 'no batch is picked for sauces'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Test Choco Sauce')),
  -2, 'sauces the factory never counted still go out (the monthly count fixes it)'
);

-- توزيع اليوم مع كيك وصوصات
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000003');
insert into ids values ('jbh', public.create_request(format(
  '[{"product_id": "%s", "loose_pieces": 5}]', tests.product('Test Caramel Sauce'))::jsonb));
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.dispatch_round(%L) $$, jsonb_build_array(
    jsonb_build_object('request_id', (select id from ids where name = 'jbh'),
      'lines', jsonb_build_array(jsonb_build_object('product_id', tests.product('Test Caramel Sauce'), 'loose_pieces', 5))))),
  'the daily round sends sauces'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Test Caramel Sauce')),
  21, 'the round takes the sauces out of the factory'
);

-- الاستلام بالفرع
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.receive_dispatch(%L, %L) $$,
    (select id from ids where name = 'dispatch'),
    (select jsonb_agg(jsonb_build_object('dispatch_line_id', dl.id, 'loose_pieces', dl.qty_pieces))
     from public.dispatch_lines dl where dl.dispatch_id = (select id from ids where name = 'dispatch'))),
  'the branch receives the sauces'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Test Caramel Sauce')),
  4, 'the branch has the sauces'
);

-- جرد الكيك اليومي ما بيلمس الصوصات
select lives_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "whole_cakes": 1}]') $$,
    tests.location('SWF'), tests.product('Flan')),
  'a daily count at the branch'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Test Caramel Sauce')),
  4, 'the daily count leaves the sauces alone'
);
select is(
  (select count(*)::int from public.stock_counts where location_id = tests.location('SWF') and scope = 'stock' and is_opening),
  1, 'the first cake count is an opening balance'
);

-- جرد الصوصات بالفرع: اللي ما انعدّ صفر
select lives_ok(
  format($$ select public.submit_sauce_count('[{"product_id": "%s", "loose_pieces": 1}]') $$,
    tests.product('Test Choco Sauce')),
  'the branch counts its sauces'
);
select results_eq(
  $$ select p.name_en, sum(m.qty_pieces)::int from public.stock_movements m
     join public.products p on p.id = m.product_id
     where m.location_id = tests.location('SWF') and p.kind = 'sauce' group by 1 order by 1 $$,
  $$ values ('Test Caramel Sauce', 0), ('Test Choco Sauce', 1) $$,
  'an uncounted sauce counts as zero'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  10, 'the sauce count leaves the cakes alone'
);

select tests.authenticate_as('afafafaf-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.submit_sauce_count('[{"product_id": "%s", "loose_pieces": "x"}]') $$, tests.product('Test Choco Sauce')),
  '22P02', null, 'bad numbers are refused'
);

-- الجرد الشهري: الكيك لحاله ما بيكفي إذا في صوصات
reset role;
select ok(
  not private.monthly_count_done(tests.location('JBH'), 'stock', public.count_day_today(), now()),
  'nothing counted yet at JBH'
);
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000003');
select public.submit_count(tests.location('JBH'), '[]');
reset role;
select ok(
  not private.monthly_count_done(tests.location('JBH'), 'stock', public.count_day_today(), now()),
  'the monthly count needs the sauces too'
);
select tests.authenticate_as('afafafaf-0000-4000-8000-000000000003');
select public.submit_sauce_count('[]');
reset role;
select ok(
  private.monthly_count_done(tests.location('JBH'), 'stock', public.count_day_today(), now()),
  'cakes and sauces counted = monthly count done'
);

select * from finish();
rollback;
