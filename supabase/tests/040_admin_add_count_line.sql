-- 23 نوفمبر 2026: الأدمن بيضيف صنف ما انعدّ لجرد مؤكد.
begin;
select no_plan();

select tests.create_staff('d0d0d0d0-0000-4000-8000-000000000001', 'أمين', '962793350001', 'FAC', '{storekeeper}');
select tests.create_staff('d0d0d0d0-0000-4000-8000-000000000002', 'أدمن', '962793350002', null, '{admin}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- جرد المصنع الأول (افتتاحي) بدون Latte
select tests.authenticate_as('d0d0d0d0-0000-4000-8000-000000000001');
insert into ids values ('c1', public.submit_count(tests.location('FAC'),
  format('[{"product_id": "%s", "production_date": "%s", "whole_cakes": 2}]', tests.product('Flan'), public.amman_today())::jsonb,
  now() - interval '2 hours'));

select throws_ok(
  format($$ select public.admin_add_count_line(%L, %L, public.amman_today(), false, 3, 0, 'كان موقوف') $$,
    (select id from ids where name = 'c1'), tests.product('Latte')),
  '42501', null, 'only the admin adds to a confirmed count'
);

select tests.authenticate_as('d0d0d0d0-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.admin_add_count_line(%L, %L, public.amman_today(), false, 3, 0, '') $$,
    (select id from ids where name = 'c1'), tests.product('Latte')),
  '23514', null, 'a reason is required'
);
select lives_ok(
  format($$ select public.admin_add_count_line(%L, %L, public.amman_today(), false, 3, 0, 'كان موقوف وقت الجرد') $$,
    (select id from ids where name = 'c1'), tests.product('Latte')),
  'the admin adds a product that was not counted'
);
select tests.as_postgres();
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Latte')),
  30, 'the stock follows the added line'
);
select is(
  (select movement_type::text from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Latte') limit 1),
  'opening_balance', 'on an opening count it is opening stock (not consumption)'
);
select ok(
  exists (select 1 from public.audit_log where table_name = 'stock_count_lines' and action = 'insert'
          and reason = 'كان موقوف وقت الجرد'),
  'the addition is in the audit log with its reason'
);

select tests.authenticate_as('d0d0d0d0-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.admin_add_count_line(%L, %L, public.amman_today(), false, 1, 0, 'مرة ثانية') $$,
    (select id from ids where name = 'c1'), tests.product('Latte')),
  '23514', null, 'the same product and batch cannot be added twice'
);

-- جرد ثاني بعده: إضافة صنف للجرد الأول بتنعكس على الثاني، فالستوك الحالي ما بيتغير
select tests.authenticate_as('d0d0d0d0-0000-4000-8000-000000000001');
insert into ids values ('c2', public.submit_count(tests.location('FAC'),
  format('[{"product_id": "%s", "production_date": "%s", "whole_cakes": 2}, {"product_id": "%s", "production_date": "%s", "whole_cakes": 3}]',
    tests.product('Flan'), public.amman_today(), tests.product('Latte'), public.amman_today())::jsonb,
  now() - interval '1 hour'));
select tests.authenticate_as('d0d0d0d0-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.admin_add_count_line(%L, %L, public.amman_today(), false, 1, 0, 'كان موقوف وقت الجرد') $$,
    (select id from ids where name = 'c1'), tests.product('Carrot')),
  'adding to an older count'
);
select tests.as_postgres();
select is(
  (select coalesce(sum(qty_pieces), 0)::int from public.stock_movements
   where location_id = tests.location('FAC') and product_id = tests.product('Carrot')),
  0, 'the next count (where it was zero) gets the opposite, so the stock now stays as counted'
);

select * from finish();
rollback;
