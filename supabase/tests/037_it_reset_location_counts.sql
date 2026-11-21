-- 21 نوفمبر 2026: IT بيصفّر جرودات موقع واحد، والباقي بيضل.
begin;
select no_plan();

select tests.create_staff('9f9f9f9f-0000-4000-8000-000000000001', 'IT', '962791190001', null, '{admin,it_admin}');
select tests.create_staff('9f9f9f9f-0000-4000-8000-000000000002', 'أدمن', '962791190002', null, '{admin}');
select tests.create_staff('9f9f9f9f-0000-4000-8000-000000000003', 'فرع الصويفية', '962791190003', 'SWF', '{branch_staff}');
select tests.create_staff('9f9f9f9f-0000-4000-8000-000000000004', 'فرع الجبيهة', '962791190004', 'JBH', '{branch_staff}');

-- جردين بالصويفية (الأول افتتاحي) وجرد بالجبيهة
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000003');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb, now() - interval '2 hours');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb, now() - interval '1 hour');
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000004');
select public.submit_count(tests.location('JBH'),
  format('[{"product_id": "%s", "whole_cakes": 4}]', tests.product('Flan'))::jsonb);

-- الأدمن العادي ما بيقدر
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.it_reset_location_counts(%L, false, 'صفّر') $$, tests.location('SWF')),
  '42501', null, 'only IT can reset a location''s counts'
);

select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.it_reset_location_counts(%L, false, 'لا') $$, tests.location('SWF')),
  '23514', null, 'the confirmation word is needed'
);
select is(
  public.it_reset_location_counts(tests.location('SWF'), false, 'صفّر') ->> 'counts',
  '2', 'it says how many counts were cleared'
);

select tests.as_postgres();
select is(
  (select count(*)::int from public.stock_counts where location_id = tests.location('SWF')),
  0, 'the location has no counts left'
);
select is(
  (select coalesce(sum(qty_pieces), 0)::int from public.stock_movements where location_id = tests.location('SWF')),
  0, 'its count movements are gone, so the stock starts again'
);
select is(
  (select count(*)::int from public.stock_counts where location_id = tests.location('JBH')),
  1, 'other locations keep their counts'
);
select is(
  (select coalesce(sum(qty_pieces), 0)::int from public.stock_movements where location_id = tests.location('JBH')),
  40, 'and their stock'
);
select ok(
  exists (select 1 from public.audit_log where table_name = 'stock_counts' and row_id = tests.location('SWF')::text
          and action = 'delete' and changed_by = '9f9f9f9f-0000-4000-8000-000000000001'),
  'the reset is in the audit log'
);

-- الجرد الجاي بالموقع بيصير أول جرد (افتتاحي)
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000003');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 5}]', tests.product('Flan'))::jsonb);
select tests.as_postgres();
select ok(
  (select is_opening from public.stock_counts where location_id = tests.location('SWF')),
  'the next count is an opening count'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements where location_id = tests.location('SWF')),
  50, 'and sets the stock'
);

select * from finish();
rollback;
