-- 25 نوفمبر 2026: جرد المواد بأكثر من تعبئة لنفس المادة (كيسين + كرتونة + كيلو).
begin;
select no_plan();

select tests.create_staff('f0f0f0f0-0000-4000-8000-000000000001', 'أمين', '962793370001', 'FAC', '{storekeeper}');

insert into public.raw_materials (name, base_unit) values ('اختبار متعدد', 'كيلو');
select id as mat from public.raw_materials where name = 'اختبار متعدد' \gset
insert into public.raw_material_units (material_id, unit_name, factor_to_base) values (:'mat', 'كيس', 25), (:'mat', 'كرتونة', 10);
select id as bag from public.raw_material_units where material_id = :'mat' and unit_name = 'كيس' \gset
select id as box from public.raw_material_units where material_id = :'mat' and unit_name = 'كرتونة' \gset

select tests.authenticate_as('f0f0f0f0-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.submit_raw_count(%L::jsonb) $$, jsonb_build_array(
    jsonb_build_object('material_id', :'mat', 'unit_id', :'bag', 'qty', 2),
    jsonb_build_object('material_id', :'mat', 'unit_id', :'box', 'qty', 1),
    jsonb_build_object('material_id', :'mat', 'unit_id', null, 'qty', 3))),
  'a material counted in bags, a carton and kilos'
);

select tests.as_postgres();
select results_eq(
  format($$ select qty_base, entered_unit_id is null, entered_qty, jsonb_array_length(entered_parts)
     from public.raw_count_lines where material_id = %L $$, :'mat'),
  $$ values (63.000::numeric, true, 63.000::numeric, 3) $$,
  'one line in the base unit (2×25 + 10 + 3 = 63), with the breakdown kept'
);
select is(
  (select sum(qty_base) from public.raw_movements where material_id = :'mat'),
  63.000::numeric, 'the stock follows the total'
);

-- وحدة وحدة: نفس القديم
select tests.authenticate_as('f0f0f0f0-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.submit_raw_count(%L::jsonb) $$, jsonb_build_array(
    jsonb_build_object('material_id', :'mat', 'unit_id', :'bag', 'qty', 1))),
  'one unit still works'
);
select tests.as_postgres();
select results_eq(
  format($$ select l.entered_unit_id = %L, l.entered_qty, l.qty_base
     from public.raw_count_lines l where l.material_id = %L and l.entered_parts is null $$, :'bag', :'mat'),
  $$ values (true, 1.000::numeric, 25.000::numeric) $$,
  'a single unit keeps the unit and the number as typed'
);

select * from finish();
rollback;
