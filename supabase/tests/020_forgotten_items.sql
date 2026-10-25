-- الأصناف المقترحة اللي الفرع بعت طلبه بدونها.
begin;
select no_plan();

select tests.create_staff('abababab-0000-4000-8000-000000000001', 'أحمد', '962798880001', 'SWF', '{branch_staff}');
select tests.create_staff('abababab-0000-4000-8000-000000000002', 'رنا', '962798880002', 'JBH', '{branch_staff}');
select tests.create_staff('abababab-0000-4000-8000-000000000003', 'سامر', '962798880003', 'FAC', '{dispatcher}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('abababab-0000-4000-8000-000000000001');
insert into ids values ('request', public.create_request(
  format('[{"product_id": "%s", "whole_cakes": 2, "suggested_pieces": 20}]', tests.product('Flan'))::jsonb,
  null,
  format('[{"product_id": "%s", "suggested_pieces": 30}, {"product_id": "%s", "suggested_pieces": 5}]',
    tests.product('Latte'), tests.product('Tiramisu'))::jsonb));

select results_eq(
  $$ select p.name_en, m.suggested_pieces from public.stock_request_missing m
     join public.products p on p.id = m.product_id
     where m.request_id = (select id from ids where name = 'request') order by p.name_en $$,
  $$ values ('Latte', 30), ('Tiramisu', 5) $$,
  'the forgotten items are saved with the request'
);

select throws_ok(
  format($$ select public.create_request('[{"product_id": "%1$s", "whole_cakes": 1}]', null,
           '[{"product_id": "%1$s", "suggested_pieces": 10}]') $$, tests.product('Flan')),
  '23514', null, 'an item in the request is not forgotten'
);
select throws_ok(
  format($$ select public.create_request('[{"product_id": "%s", "whole_cakes": 1}]', null,
           '[{"product_id": "%s", "suggested_pieces": 0}]') $$, tests.product('Flan'), tests.product('Latte')),
  '23514', null, 'a forgotten item had a suggestion'
);

select lives_ok(
  format($$ select public.create_request('[{"product_id": "%s", "whole_cakes": 1}]') $$, tests.product('Flan')),
  'a request without forgotten items still works'
);

select throws_ok(
  $$ delete from public.stock_request_missing $$,
  '42501', null, 'staff cannot remove a forgotten item'
);

-- الفرع الثاني ما بيشوفها، والمصنع بيشوفها
select tests.authenticate_as('abababab-0000-4000-8000-000000000002');
select is((select count(*)::int from public.stock_request_missing), 0, 'another branch does not see them');
select tests.authenticate_as('abababab-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from public.stock_request_missing where request_id = (select id from ids where name = 'request')),
  2, 'the factory sees them'
);

select * from finish();
rollback;
