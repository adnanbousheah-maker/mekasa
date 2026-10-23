-- تفاصيل الجرد وقائمة الجرودات: المتوقع والاستهلاك والأرقام المستحيلة، وRLS.
begin;
select no_plan();

select tests.create_staff('bbbbbbbb-0000-4000-8000-000000000001', 'أحمد', '962793330001', 'SWF', '{branch_staff}');
select tests.create_staff('bbbbbbbb-0000-4000-8000-000000000002', 'رنا', '962793330002', 'JBH', '{branch_staff}');
select tests.create_staff('bbbbbbbb-0000-4000-8000-000000000004', 'مدير', '962793330004', null, '{admin}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('bbbbbbbb-0000-4000-8000-000000000001');
insert into ids values ('opening', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb, now() - interval '3 hours'));
select public.record_waste(tests.location('SWF'), tests.product('Flan'), 'piece', 4, 'broken');
-- الوقت لازم يكون بعد التالف
insert into ids values ('second', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 1}, {"product_id": "%s", "loose_pieces": 2}]',
         tests.product('Flan'), tests.product('Tiramisu'))::jsonb, now()));

select results_eq(
  $$ select p.name_en, b.prev_qty, b.waste_qty, b.expected_qty, b.counted_qty, b.adjustment_qty
     from public.count_breakdown((select id from ids where name = 'second')) b
     join public.products p on p.id = b.product_id order by p.name_en $$,
  $$ values ('Flan', 30, 4, 26, 10, -16), ('Tiramisu', 0, 0, 0, 2, 2) $$,
  'the breakdown explains expected = previous − waste, and the adjustment'
);
select results_eq(
  $$ select line_count, consumed_pieces, consumed_cakes, consumed_loose_only, impossible_lines
     from public.v_count_list where id = (select id from ids where name = 'second') $$,
  $$ values (2, 14, 1.6, -2, 1) $$,
  'the list sums consumption in pieces and cakes, and counts impossible lines'
);
select results_eq(
  $$ select consumed_pieces, impossible_lines from public.v_count_list where id = (select id from ids where name = 'opening') $$,
  $$ values (0, 0) $$,
  'the opening count has no consumption'
);

select tests.authenticate_as('bbbbbbbb-0000-4000-8000-000000000002');
select is_empty(
  $$ select * from public.count_breakdown((select id from ids where name = 'second')) $$,
  'another branch sees nothing'
);
select is_empty($$ select * from public.v_count_list where location_id = tests.location('SWF') $$, 'nor in the list');

select tests.authenticate_as('bbbbbbbb-0000-4000-8000-000000000004');
select isnt_empty($$ select * from public.count_breakdown((select id from ids where name = 'second')) $$, 'the admin sees it');

select * from finish();
rollback;
