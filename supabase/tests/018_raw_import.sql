-- جرد المواد الأولية من Excel (الأدمن)، والكود.
begin;
select no_plan();

select tests.create_staff('eeeeeeee-0000-4000-8000-000000000001', 'مدير', '962796660001', null, '{admin}');
select tests.create_staff('eeeeeeee-0000-4000-8000-000000000002', 'ليث', '962796660002', 'FAC', '{storekeeper}');

select tests.authenticate_as('eeeeeeee-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.admin_import_raw_count('[{"name": "طحين", "qty": 1}]') $$,
  '42501', null, 'only an admin imports a count'
);

select tests.authenticate_as('eeeeeeee-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.admin_import_raw_count('[{"name": "طحين", "unit_name": "كيس", "factor": 20, "qty": 1}]') $$,
  '23514', null, 'a known packaging with another size is refused'
);
select throws_ok(
  $$ select public.admin_import_raw_count('[{"name": "طحين", "qty": 1}, {"code": "FL01", "name": "طحين", "qty": 2}]') $$,
  '23514', null, 'the same material twice is refused'
);
select throws_ok(
  $$ select public.admin_import_raw_count('[{"name": "مادة بلا وحدة", "qty": 1}]') $$,
  '23514', null, 'a new material needs a base unit'
);

select lives_ok(
  $$ select public.admin_import_raw_count('[
       {"code": "FL01", "name": "طحين", "base_unit": "كيلو", "unit_name": "كيس", "factor": 25, "qty": 4},
       {"code": "VAN1", "name": "فانيلا تجربة", "base_unit": "لتر", "unit_name": "قنينة", "factor": 0.5, "qty": 6},
       {"name": "سكر", "base_unit": "كيلو", "qty": 12.5}
     ]') $$,
  'the admin imports a count with a new material and a new packaging'
);

select results_eq(
  $$ select m.name, m.code, rm.movement_type::text, rm.qty_base
     from public.raw_movements rm join public.raw_materials m on m.id = rm.material_id
     where m.name in ('طحين', 'فانيلا تجربة', 'سكر') order by m.name $$,
  $$ values ('سكر', null, 'opening_balance', 12.5::numeric),
            ('طحين', 'FL01', 'opening_balance', 100::numeric),
            ('فانيلا تجربة', 'VAN1', 'opening_balance', 3::numeric) $$,
  'every material gets its opening balance in the base unit; the code is saved'
);
select results_eq(
  $$ select u.unit_name, u.factor_to_base from public.raw_material_units u
     join public.raw_materials m on m.id = u.material_id where m.code = 'VAN1' $$,
  $$ values ('قنينة', 0.5::numeric) $$,
  'the new packaging is saved with its size'
);

select lives_ok(
  $$ select public.admin_import_raw_count('[{"code": "fl01x", "name": "طحين", "unit_name": "كيس", "factor": 25, "qty": 3}]') $$,
  'a second import finds the material by name'
);
select results_eq(
  $$ select rm.movement_type::text, rm.qty_base from public.raw_movements rm
     join public.raw_materials m on m.id = rm.material_id where m.code = 'FL01' order by rm.id $$,
  $$ values ('opening_balance', 100::numeric), ('count_adjustment', -25::numeric) $$,
  'the second count is an adjustment, and a known code is not replaced'
);

select throws_ok(
  $$ insert into public.raw_materials (name, base_unit, code) values ('غلط', 'كيلو', 'فيه مسافة') $$,
  '23514', null, 'codes are latin letters and digits'
);

select * from finish();
rollback;
