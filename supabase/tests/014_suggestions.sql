-- الكمية المقترحة: الفرع نفسه والإخراج والأدمن بس.
begin;
select no_plan();

select tests.create_staff('dddddddd-0000-4000-8000-000000000001', 'أحمد', '962795550001', 'SWF', '{branch_staff}');
select tests.create_staff('dddddddd-0000-4000-8000-000000000002', 'رنا', '962795550002', 'JBH', '{branch_staff}');
select tests.create_staff('dddddddd-0000-4000-8000-000000000003', 'سامر', '962795550003', 'FAC', '{dispatcher}');

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');
select public.submit_count(tests.location('SWF'), format('[{"product_id": "%s", "whole_cakes": 5}]', tests.product('Flan'))::jsonb);

select results_eq(
  $$ select stock_pieces, par_pieces from public.branch_suggestions(tests.location('SWF')) where product_id = tests.product('Flan') $$,
  $$ values (50, 200) $$,
  'the branch sees its stock and par'
);

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000003');
select results_eq(
  $$ select stock_pieces from public.branch_suggestions(tests.location('SWF')) where product_id = tests.product('Flan') $$,
  $$ values (50) $$,
  'the dispatcher sees it too'
);

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select * from public.branch_suggestions(%L) $$, tests.location('SWF')),
  '42501', null, 'another branch cannot'
);

select * from finish();
rollback;
