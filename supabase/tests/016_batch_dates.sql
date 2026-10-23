-- تاريخ إنتاج الدفعة: مش بالمستقبل، ومش أقدم من 60 يوم.
begin;
select plan(3);

select tests.create_staff('ffffffff-0000-4000-8000-000000000003', 'سامر', '962797770003', 'FAC', '{storekeeper}');
select tests.authenticate_as('ffffffff-0000-4000-8000-000000000003');

select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "production_date": "%s", "whole_cakes": 1}]') $$,
         tests.location('FAC'), tests.product('Flan'), public.amman_today() + 3),
  '23514', null, 'a count cannot create a batch in the future'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "production_date": "%s", "whole_cakes": 1}]') $$,
         tests.location('FAC'), tests.product('Flan'), public.amman_today() - 400),
  '23514', null, 'nor a batch from more than 60 days ago'
);
select lives_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "production_date": "%s", "whole_cakes": 1}]') $$,
         tests.location('FAC'), tests.product('Flan'), public.amman_today() - 2),
  'a recent batch is fine'
);

select * from finish();
rollback;
