-- اسم السائق مع الإخراج، والتوالف وقت الاستلام.
begin;
select no_plan();

select tests.create_staff('dddddddd-0000-4000-8000-000000000001', 'أحمد', '962795550001', 'SWF', '{branch_staff}');
select tests.create_staff('dddddddd-0000-4000-8000-000000000002', 'سامر', '962795550002', 'FAC', '{dispatcher,storekeeper}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000002');
select public.record_production(format('[{"product_id": "%s", "whole_cakes": 6}]', tests.product('Pecan'))::jsonb);

insert into ids values ('dispatch', public.create_dispatch(
  tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Pecan'))::jsonb,
  p_driver_name => '  أبو محمد  '));
select results_eq(
  $$ select driver_name from public.dispatches where id = (select id from ids where name = 'dispatch') $$,
  $$ values ('أبو محمد') $$,
  'the driver name is saved with the dispatch, trimmed'
);

select tests.as_postgres();
select throws_ok(
  $$ update public.dispatches set driver_name = 'غيره' where id = (select id from ids where name = 'dispatch') $$,
  '23001', null, 'the driver name cannot change after the dispatch'
);

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.receive_dispatch(%L, '[{"dispatch_line_id": "%s", "whole_cakes": 2, "damaged_whole": 3}]') $$,
         (select id from ids where name = 'dispatch'),
         (select id from public.dispatch_lines where dispatch_id = (select id from ids where name = 'dispatch'))),
  '23514', null, 'more damaged than arrived is refused'
);
select lives_ok(
  format($$ select public.receive_dispatch(%L, '[{"dispatch_line_id": "%s", "whole_cakes": 3, "damaged_whole": 1, "damaged_loose": 2}]') $$,
         (select id from ids where name = 'dispatch'),
         (select id from public.dispatch_lines where dispatch_id = (select id from ids where name = 'dispatch'))),
  'the branch receives three cakes, one and two pieces damaged'
);
select results_eq(
  $$ select rl.qty_pieces, rl.damaged_pieces, w.qty_pieces, w.reason::text, w.reason_note
     from public.receipt_lines rl join public.waste_records w on w.id = rl.damage_waste_id
     join public.receipts r on r.id = rl.receipt_id
     where r.dispatch_id = (select id from ids where name = 'dispatch') $$,
  $$ values (30, 12, 12, 'broken', 'وصل تالف بالتوصيل · السائق: أبو محمد') $$,
  'what arrived counts as received, and the damage becomes waste with the driver''s name'
);
select results_eq(
  $$ select movement_type::text, qty_pieces from public.stock_movements
     where location_id = tests.location('SWF') and product_id = tests.product('Pecan') order by id $$,
  $$ values ('receipt_in', 30), ('waste', -12) $$,
  'the branch stock grows by what arrived, minus the damage'
);

select tests.as_postgres();
select throws_ok(
  $$ update public.receipt_lines set damaged_pieces = 0
     where receipt_id = (select r.id from public.receipts r where r.dispatch_id = (select id from ids where name = 'dispatch')) $$,
  '23001', null, 'the recorded damage cannot change'
);

select * from finish();
rollback;
