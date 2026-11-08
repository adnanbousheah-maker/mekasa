-- القوائم: الأدمن بيديرها، الموظف بيقرأها، والسجلات مربوطة بالخيار مش بالنص.
begin;
select no_plan();

select tests.create_staff('8b8b8b8b-0000-4000-8000-000000000001', 'أدمن', '962791150001', null, '{admin}');
select tests.create_staff('8b8b8b8b-0000-4000-8000-000000000002', 'أحمد', '962791150002', 'SWF', '{branch_staff}');
select tests.create_staff('8b8b8b8b-0000-4000-8000-000000000003', 'سامر', '962791150003', 'FAC', '{storekeeper}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select results_eq(
  $$ select key from public.lookup_lists order by sort_order $$,
  $$ values ('waste_reasons'), ('product_categories'), ('raw_categories'), ('suppliers') $$,
  'four managed lists'
);
select results_eq(
  $$ select code, name, requires_note from public.lookup_options where list_key = 'waste_reasons' order by sort_order $$,
  $$ values ('expired', 'انتهت', false), ('broken', 'انكسرت', false), ('other', 'غيره', true) $$,
  'the three waste reasons are there, "other" needs a note'
);

-- الموظف بيقرأ بس
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000002');
select ok((select count(*) from public.lookup_options) >= 3, 'staff read the options');
select throws_ok(
  $$ insert into public.lookup_options (list_key, name) values ('suppliers', 'مورد') $$,
  '42501', null, 'staff cannot add options'
);

-- الأدمن
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000001');
insert into public.lookup_options (list_key, name, color, icon, allowed_roles, sort_order)
values ('waste_reasons', 'حرارة الثلاجة', 'blue', '🌡', '{branch_staff}', 3);
insert into ids select 'heat', id from public.lookup_options where name = 'حرارة الثلاجة';
insert into public.lookup_options (list_key, name) values ('waste_reasons', 'للمصنع بس');
update public.lookup_options set allowed_roles = '{storekeeper}' where name = 'للمصنع بس';
select throws_ok(
  $$ insert into public.lookup_options (list_key, name) values ('waste_reasons', ' حرارة الثلاجة ') $$,
  '23505', null, 'names do not repeat in a list'
);
select throws_ok(
  $$ insert into public.lookup_options (list_key, name, color) values ('suppliers', 'لون غلط', 'pink') $$,
  '23514', null, 'colors come from the palette'
);

-- تصنيفات رئيسية وفرعية
insert into public.lookup_options (list_key, name) values ('product_categories', 'كيك');
insert into ids select 'cakes', id from public.lookup_options where name = 'كيك';
select lives_ok(
  format($$ insert into public.lookup_options (list_key, name, parent_id) values ('product_categories', 'شوكولا', %L) $$,
    (select id from ids where name = 'cakes')),
  'a sub-category under a main one'
);
select throws_ok(
  format($$ insert into public.lookup_options (list_key, name, parent_id) values ('product_categories', 'أعمق', %L) $$,
    (select id from public.lookup_options where name = 'شوكولا')),
  '23514', null, 'one level of sub-categories only'
);
select throws_ok(
  format($$ insert into public.lookup_options (list_key, name, parent_id) values ('suppliers', 'فرعي', %L) $$,
    (select id from ids where name = 'cakes')),
  '23514', null, 'suppliers have no sub-options'
);
update public.lookup_options set allowed_roles = '{admin}' where name = 'كيك';
select is(
  (select allowed_roles from public.lookup_options where name = 'كيك'), null,
  'roles are ignored on lists without roles'
);

select lives_ok(
  format($$ update public.products set category_id = %L where name_en = 'Flan' $$, (select id from ids where name = 'cakes')),
  'a product gets a category'
);
select throws_ok(
  format($$ update public.products set category_id = %L where name_en = 'Flan' $$, (select id from ids where name = 'heat')),
  '23514', null, 'a category must come from the category list'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'lookup_options' and action = 'insert'
   and new_values ->> 'name' = 'حرارة الثلاجة'),
  1, 'every option change is in the audit log'
);

-- التالف بسبب من القائمة
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000002');
insert into ids values ('waste', public.log_waste(
  tests.location('SWF'), tests.product('Flan'), 'cake', 1, (select id from ids where name = 'heat'), null));
select results_eq(
  format($$ select reason::text, reason_option_id from public.waste_records where id = %L $$, (select id from ids where name = 'waste')),
  format($$ values ('other', %L::uuid) $$, (select id from ids where name = 'heat')),
  'the waste keeps the chosen reason'
);
select throws_ok(
  format($$ select public.log_waste(%L, %L, 'cake', 1, %L) $$, tests.location('SWF'), tests.product('Flan'),
    (select id from public.lookup_options where name = 'للمصنع بس')),
  '42501', null, 'a reason for another role is refused'
);
select throws_ok(
  format($$ select public.log_waste(%L, %L, 'cake', 1, %L) $$, tests.location('SWF'), tests.product('Flan'),
    (select id from public.lookup_options where code = 'other')),
  '23514', null, '"other" needs a note'
);
select lives_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'broken') $$, tests.location('SWF'), tests.product('Flan')),
  'the old way still works'
);
select is(
  (select count(*)::int from public.waste_records w join public.lookup_options o on o.id = w.reason_option_id
   where o.code = 'broken' and w.location_id = tests.location('SWF')),
  1, 'and is linked to its option'
);

-- الإيقاف والحذف
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000001');
update public.lookup_options set is_active = false where id = (select id from ids where name = 'heat');
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.log_waste(%L, %L, 'cake', 1, %L) $$, tests.location('SWF'), tests.product('Flan'),
    (select id from ids where name = 'heat')),
  '23514', null, 'a switched-off reason cannot be picked'
);
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000001');
select is(
  (select usage_count from public.v_lookup_options where id = (select id from ids where name = 'heat')), 1,
  'the usage is counted'
);
select throws_ok(
  format($$ select public.admin_delete_option(%L) $$, (select id from ids where name = 'heat')),
  '23514', null, 'a used option cannot be deleted'
);
select throws_ok(
  format($$ select public.admin_delete_option(%L) $$, (select id from public.lookup_options where code = 'expired')),
  '23514', null, 'built-in options are switched off, not deleted'
);
select lives_ok(
  format($$ select public.admin_delete_option(%L) $$, (select id from public.lookup_options where name = 'للمصنع بس')),
  'an unused option is deleted'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'lookup_options' and action = 'delete'), 1,
  'and the delete is in the audit log'
);
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.admin_delete_option(%L) $$, (select id from ids where name = 'cakes')),
  '42501', null, 'staff cannot delete'
);

-- الموردين بالاستلام
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000001');
insert into public.lookup_options (list_key, name) values ('suppliers', 'مطاحن الأردن');
select tests.authenticate_as('8b8b8b8b-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.record_raw_movement(%L, 'receipt', 4, null, '  مطاحن الأردن ') $$,
    (select id from public.raw_materials order by name limit 1)),
  'a receipt from a listed supplier'
);
reset role;
select is(
  (select o.name from public.raw_movements m join public.lookup_options o on o.id = m.supplier_option_id
   order by m.id desc limit 1),
  'مطاحن الأردن', 'the receipt is linked to the supplier'
);

select * from finish();
rollback;
