-- تأكيد الجرد: الصلاحيات، الرصيد الافتتاحي، الحركات، المصنع بالدفعات، وتصحيح الأدمن.
begin;
select no_plan();

select tests.create_staff('99999999-0000-4000-8000-000000000001', 'أحمد', '962791110001', 'SWF', '{branch_staff}');
select tests.create_staff('99999999-0000-4000-8000-000000000002', 'رنا', '962791110002', 'JBH', '{branch_staff}');
select tests.create_staff('99999999-0000-4000-8000-000000000003', 'سامر', '962791110003', 'FAC', '{storekeeper}');
select tests.create_staff('99999999-0000-4000-8000-000000000004', 'مدير', '962791110004', null, '{admin}');
select tests.create_staff('99999999-0000-4000-8000-000000000005', 'إخراج', '962791110005', 'FAC', '{dispatcher}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ─── مين بيجرد ───────────────────────────────────────────────────────

select tests.authenticate_as('99999999-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb) $$, tests.location('SWF')),
  '42501', null, 'a branch employee cannot count another branch'
);

select tests.authenticate_as('99999999-0000-4000-8000-000000000005');
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb) $$, tests.location('FAC')),
  '42501', null, 'a dispatcher does not count the factory'
);

select tests.location('SWF') as swf \gset
select tests.as_anon();
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb) $$, :'swf'),
  '42501', null, 'anon cannot call submit_count'
);

-- ─── أول جرد بالفرع: رصيد افتتاحي ────────────────────────────────────

select tests.authenticate_as('99999999-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb, now() + interval '1 hour') $$, tests.location('SWF')),
  '23514', null, 'a count cannot start in the future'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "whole_cakes": 2}]'::jsonb) $$,
         tests.location('SWF'), tests.product('Tiramisu')),
  '23514', null, 'a pieces-only product has no whole cakes'
);

insert into ids values ('opening', public.submit_count(
  tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3, "loose_pieces": 5}, {"product_id": "%s", "loose_pieces": 7}]',
         tests.product('Classic Choco'), tests.product('Tiramisu'))::jsonb,
  now() - interval '2 hours'
));

select results_eq(
  $$ select c.is_opening, c.status::text, c.counted_by from public.stock_counts c where c.id = (select id from ids where name = 'opening') $$,
  $$ values (true, 'confirmed', '99999999-0000-4000-8000-000000000001'::uuid) $$,
  'the first count at a branch is an opening balance, confirmed, by the caller'
);
select results_eq(
  $$ select p.name_en, m.movement_type::text, m.qty_pieces
     from public.stock_movements m join public.products p on p.id = m.product_id
     join public.stock_count_lines l on l.id = m.count_line_id
     where l.count_id = (select id from ids where name = 'opening') order by p.name_en $$,
  $$ values ('Classic Choco', 'opening_balance', 35), ('Tiramisu', 'opening_balance', 7) $$,
  'the opening count writes opening balance movements in pieces'
);

-- ─── الجرد الثاني: الفرق = تعديل، والاستهلاك = سالبه ─────────────────

insert into ids values ('second', public.submit_count(
  tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2, "loose_pieces": 0}]', tests.product('Classic Choco'))::jsonb,
  now() - interval '1 hour'
));

select results_eq(
  $$ select p.name_en, m.qty_pieces
     from public.stock_movements m join public.products p on p.id = m.product_id
     join public.stock_count_lines l on l.id = m.count_line_id
     where l.count_id = (select id from ids where name = 'second') order by p.name_en $$,
  $$ values ('Classic Choco', -15), ('Tiramisu', -7) $$,
  'the next count adjusts by the difference, and an uncounted product with stock counts as zero'
);
select results_eq(
  $$ select coalesce(sum(qty_pieces), 0)::int from public.v_stock_by_product
     where location_id = tests.location('SWF') and product_id = tests.product('Classic Choco') $$,
  $$ values (20) $$,
  'current stock equals the latest count'
);
select results_eq(
  $$ select p.name_en, v.consumed_pieces from public.v_count_consumption v join public.products p on p.id = v.product_id
     where v.count_id = (select id from ids where name = 'second') order by p.name_en $$,
  $$ values ('Classic Choco', 15), ('Tiramisu', 7) $$,
  'consumption is the negative of the adjustment'
);

-- ─── الموظف ما بيصحح ─────────────────────────────────────────────────

select throws_ok(
  $$ select public.admin_correct_count_line(
       (select l.id from public.stock_count_lines l where l.count_id = (select id from ids where name = 'opening')
          and l.product_id = tests.product('Classic Choco')), 9, 0, 'غلط بالعد') $$,
  '42501', null, 'staff cannot correct a confirmed count'
);

-- ─── تصحيح الأدمن للجرد الأول ────────────────────────────────────────

select tests.authenticate_as('99999999-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.admin_correct_count_line(
       (select l.id from public.stock_count_lines l where l.count_id = (select id from ids where name = 'opening')
          and l.product_id = tests.product('Classic Choco')), 4, 0, '') $$,
  '23514', null, 'a correction needs a reason'
);
select lives_ok(
  $$ select public.admin_correct_count_line(
       (select l.id from public.stock_count_lines l where l.count_id = (select id from ids where name = 'opening')
          and l.product_id = tests.product('Classic Choco')), 4, 0, 'غلط بالعد') $$,
  'the admin corrects an old count with a reason'
);
select results_eq(
  $$ select coalesce(sum(qty_pieces), 0)::int from public.v_stock_by_product
     where location_id = tests.location('SWF') and product_id = tests.product('Classic Choco') $$,
  $$ values (20) $$,
  'current stock still equals the latest count after correcting an older one'
);
select results_eq(
  $$ select v.consumed_pieces from public.v_count_consumption v
     where v.count_id = (select id from ids where name = 'second') and v.product_id = tests.product('Classic Choco') $$,
  $$ values (20) $$,
  'the next period consumption follows the corrected number (40 → 20)'
);
select results_eq(
  $$ select a.reason, (a.old_values ->> 'whole_cakes')::int, (a.new_values ->> 'whole_cakes')::int
     from public.audit_log a where a.table_name = 'stock_count_lines' order by a.id desc limit 1 $$,
  $$ values ('غلط بالعد', 3, 4) $$,
  'the correction keeps the old value and the reason in the audit log'
);

-- ─── المصنع: جرد بالدفعات ────────────────────────────────────────────

select tests.authenticate_as('99999999-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "whole_cakes": 2}]'::jsonb) $$,
         tests.location('FAC'), tests.product('Flan')),
  '23514', null, 'a factory line needs a production date'
);

insert into ids values ('factory', public.submit_count(
  tests.location('FAC'),
  format('[{"product_id": "%1$s", "production_date": "%2$s", "whole_cakes": 4},
           {"product_id": "%1$s", "production_date": "%3$s", "whole_cakes": 6}]',
         tests.product('Flan'), public.amman_today() - 1, public.amman_today())::jsonb
));

select results_eq(
  $$ select b.production_date, m.qty_pieces
     from public.stock_movements m join public.batches b on b.id = m.batch_id
     join public.stock_count_lines l on l.id = m.count_line_id
     where l.count_id = (select id from ids where name = 'factory') order by b.production_date $$,
  format($$ values (%L::date, 40), (%L::date, 60) $$, public.amman_today() - 1, public.amman_today()),
  'the factory counts by batch, and missing batches are created'
);

select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb) $$, tests.location('SWF')),
  '42501', null, 'the storekeeper cannot count a branch'
);

-- ─── جرد واحد لكل موعد باليوم ────────────────────────────────────────

select tests.authenticate_as('99999999-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb, null,
            (select id from public.count_schedules where location_id = tests.location('JBH') order by time_of_day limit 1)) $$,
         tests.location('JBH')),
  'a count for a schedule slot is saved'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb, null,
            (select id from public.count_schedules where location_id = tests.location('JBH') order by time_of_day limit 1)) $$,
         tests.location('JBH')),
  '23505', null, 'the same slot cannot be counted twice on the same day'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[]'::jsonb, null,
            (select id from public.count_schedules where location_id = tests.location('SWF') limit 1)) $$,
         tests.location('JBH')),
  '23514', null, 'a schedule of another branch is rejected'
);

select * from finish();
rollback;
