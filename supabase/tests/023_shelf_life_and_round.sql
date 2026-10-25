-- مدة الحياة لكل صنف، وتوزيع اليوم العادل للقديم.
begin;
select no_plan();

select tests.create_staff('aeaeaeae-0000-4000-8000-000000000001', 'أحمد', '962792220001', 'SWF', '{branch_staff}');
select tests.create_staff('aeaeaeae-0000-4000-8000-000000000002', 'رنا', '962792220002', 'JBH', '{branch_staff}');
select tests.create_staff('aeaeaeae-0000-4000-8000-000000000003', 'سامر', '962792220003', 'FAC', '{dispatcher,storekeeper}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.as_postgres();
update public.products set shelf_life_days = 14 where name_en = 'Pecan';

-- المصنع: Flan قديم (3 أيام) 3 كيكات وجديد 10، وFlan عمره 7 أيام (منتهي)، وPecan عمره 10 أيام (لسا)
select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000003');
select public.submit_count(tests.location('FAC'), format(
  '[{"product_id": "%1$s", "production_date": "%2$s", "whole_cakes": 3},
    {"product_id": "%1$s", "production_date": "%3$s", "whole_cakes": 10},
    {"product_id": "%1$s", "production_date": "%4$s", "whole_cakes": 1},
    {"product_id": "%5$s", "production_date": "%6$s", "whole_cakes": 2}]',
  tests.product('Flan'), public.amman_today() - 3, public.amman_today(), public.amman_today() - 7,
  tests.product('Pecan'), public.amman_today() - 10)::jsonb);

select results_eq(
  $$ select p.name_en, b.age_days, b.is_expired, b.shelf_life_days from public.v_factory_batches b
     join public.products p on p.id = b.product_id
     where b.location_id = tests.location('FAC') and b.age_days in (7, 10) order by p.name_en $$,
  $$ values ('Flan', 7, true, 7), ('Pecan', 10, false, 14) $$,
  'each product expires after its own shelf life'
);

-- طلبين: الصويفية 4 كيكات، والجبيهة 2
select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000001');
insert into ids values ('swf', public.create_request(format('[{"product_id": "%s", "whole_cakes": 4}]', tests.product('Flan'))::jsonb));
select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000002');
insert into ids values ('jbh', public.create_request(format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb));

select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.dispatch_round('[{"request_id": "%s", "lines": []}]') $$, (select id from ids where name = 'swf')),
  '42501', null, 'only the dispatcher runs the round'
);

select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.dispatch_round(%L) $$, jsonb_build_array(
    jsonb_build_object('request_id', (select id from ids where name = 'swf'), 'driver_name', 'أبو محمد',
      'lines', jsonb_build_array(jsonb_build_object('product_id', tests.product('Flan'), 'whole_cakes', 4,
        'request_line_id', (select l.id from public.stock_request_lines l where l.request_id = (select id from ids where name = 'swf'))))),
    jsonb_build_object('request_id', (select id from ids where name = 'jbh'),
      'lines', jsonb_build_array(jsonb_build_object('product_id', tests.product('Flan'), 'whole_cakes', 2))))),
  'the dispatcher sends both requests in one round'
);

select results_eq(
  $$ select l.code, public.amman_today() - b.production_date, sum(x.qty_pieces)::int
     from public.dispatch_line_batches x
     join public.batches b on b.id = x.batch_id
     join public.dispatch_lines dl on dl.id = x.dispatch_line_id
     join public.dispatches d on d.id = dl.dispatch_id
     join public.locations l on l.id = d.to_location_id
     where d.request_id in (select id from ids)
     group by 1, 2 order by 1, 2 $$,
  $$ values ('JBH', 0, 10), ('JBH', 3, 10), ('SWF', 0, 20), ('SWF', 3, 20) $$,
  'the old batch is shared by need, and nothing comes from the expired one'
);
select is(
  (select count(*)::int from public.dispatch_line_batches x
   join public.dispatch_lines dl on dl.id = x.dispatch_line_id
   join public.dispatches d on d.id = dl.dispatch_id
   where d.request_id in (select id from ids) and x.is_fefo_override),
  0, 'a fair round is not a FEFO override'
);
select results_eq(
  $$ select status::text from public.stock_requests where id in (select id from ids) $$,
  $$ values ('dispatched'), ('dispatched') $$,
  'both requests are dispatched'
);
select is(
  (select driver_name from public.dispatches where request_id = (select id from ids where name = 'swf')),
  'أبو محمد', 'the driver is saved'
);

-- ستوك ما بيكفي
select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000001');
insert into ids values ('big', public.create_request(format('[{"product_id": "%s", "whole_cakes": 50}]', tests.product('Flan'))::jsonb));
select tests.authenticate_as('aeaeaeae-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.dispatch_round(%L) $$, jsonb_build_array(
    jsonb_build_object('request_id', (select id from ids where name = 'big'),
      'lines', jsonb_build_array(jsonb_build_object('product_id', tests.product('Flan'), 'whole_cakes', 50))))),
  '23514', null, 'the round stops when stock is short'
);

select * from finish();
rollback;
