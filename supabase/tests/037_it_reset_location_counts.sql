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
  format($$ select public.it_reset_location_counts(%L, 'stock', 'صفّر') $$, tests.location('SWF')),
  '42501', null, 'only IT can reset a location''s counts'
);

select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.it_reset_location_counts(%L, 'stock', 'لا') $$, tests.location('SWF')),
  '23514', null, 'the confirmation word is needed'
);
select is(
  public.it_reset_location_counts(tests.location('SWF'), 'stock', 'صفّر') ->> 'counts',
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

-- المواد الأولية بس بالمصنع: جرودات الكيك بالمصنع بتضل
select tests.create_staff('9f9f9f9f-0000-4000-8000-000000000005', 'أمين', '962791190005', 'FAC', '{storekeeper}');
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000005');
select public.submit_count(tests.location('FAC'),
  format('[{"product_id": "%s", "production_date": "%s", "whole_cakes": 1}]', tests.product('Flan'), public.amman_today())::jsonb);
select public.submit_raw_count(
  (select jsonb_agg(jsonb_build_object('material_id', m.id, 'qty', 5)) from (select id from public.raw_materials limit 1) m));
select tests.authenticate_as('9f9f9f9f-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.it_reset_location_counts(%L, 'all', 'صفّر') $$, tests.location('FAC')),
  '23514', null, 'the scope must be stock, raw or both'
);
select is(
  public.it_reset_location_counts(tests.location('FAC'), 'raw', 'صفّر') ->> 'raw_counts',
  '1', 'only the raw counts are cleared'
);
select tests.as_postgres();
select is((select count(*)::int from public.raw_counts where location_id = tests.location('FAC')), 0, 'no raw counts left');
select is(
  (select coalesce(sum(qty_base), 0)::int from public.raw_movements where location_id = tests.location('FAC')),
  0, 'the raw stock from the count is gone'
);
select is((select count(*)::int from public.stock_counts where location_id = tests.location('FAC')), 1, 'the cake count stays');

select * from finish();
rollback;
