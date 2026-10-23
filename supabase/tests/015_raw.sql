-- المواد الأولية: الصلاحيات، تحويل الوحدات، الجرد، والأيام المتبقية.
begin;
select no_plan();

select tests.create_staff('eeeeeeee-0000-4000-8000-000000000001', 'أحمد', '962796660001', 'SWF', '{branch_staff}');
select tests.create_staff('eeeeeeee-0000-4000-8000-000000000003', 'سامر', '962796660003', 'FAC', '{storekeeper}');

insert into public.raw_materials (name, base_unit, min_qty) values ('اختبار طحين', 'كيلو', 100);
insert into public.raw_material_units (material_id, unit_name, factor_to_base)
select id, 'كيس', 25 from public.raw_materials where name = 'اختبار طحين';
insert into public.raw_materials (name, base_unit) values ('اختبار سكر', 'كيلو');

select id as flour from public.raw_materials where name = 'اختبار طحين' \gset
select id as bag from public.raw_material_units where material_id = :'flour' \gset
select id as sugar from public.raw_materials where name = 'اختبار سكر' \gset

select tests.authenticate_as('eeeeeeee-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.record_raw_movement(%L, 'receipt', 4) $$, :'flour'),
  '42501', null, 'branch staff cannot touch raw materials'
);

select tests.authenticate_as('eeeeeeee-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.record_raw_movement(%L, 'receipt', 4, %L, '  مطاحن  ') $$, :'flour', :'bag'),
  'the storekeeper receives 4 bags'
);
select results_eq(
  format($$ select qty_base, entered_qty, supplier_name from public.raw_movements where material_id = %L $$, :'flour'),
  $$ values (100.000::numeric, 4.000::numeric, 'مطاحن') $$,
  '4 bags of 25 kilos are stored as 100 kilos, with what was typed'
);
select throws_ok(
  format($$ select public.record_raw_movement(%L, 'issue', 1, %L) $$, :'sugar', :'bag'),
  '23514', null, 'a unit of another material is rejected'
);
select lives_ok(
  format($$ select public.record_raw_movement(%L, 'issue', 20) $$, :'flour'),
  'issue 20 kilos to production'
);
select results_eq(
  format($$ select qty_base, below_min, days_left from public.v_raw_stock where material_id = %L $$, :'flour'),
  $$ values (80.000::numeric, true, floor(80 / (20 / 14.0))::int) $$,
  'stock, below minimum and days left from the 14-day issue rate'
);

select lives_ok(
  format($$ select public.submit_raw_count(format('[{"material_id": "%%s", "unit_id": "%%s", "qty": 3}]', %L, %L)::jsonb) $$, :'flour', :'bag'),
  'raw count in bags'
);
select results_eq(
  format($$ select movement_type::text, qty_base from public.raw_movements where material_id = %L and raw_count_line_id is not null $$, :'flour'),
  $$ values ('opening_balance', -5.000::numeric) $$,
  'the first count of a material adjusts to what was counted (75 kilos)'
);
select throws_ok(
  format($$ select public.record_raw_movement(%L, 'count_adjustment', 1) $$, :'flour'),
  '23514', null, 'adjustments only come from counts'
);

select * from finish();
rollback;
