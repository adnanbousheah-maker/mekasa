-- 20 نوفمبر 2026: الموظف بيعدّل جرده خلال ربع ساعة (آخر جرد بالموقع بس).
begin;
select no_plan();

select tests.create_staff('cececece-0000-4000-8000-000000000001', 'جارد', '962796660001', 'SWF', '{branch_staff}');
select tests.create_staff('cececece-0000-4000-8000-000000000002', 'فرع ثاني', '962796660002', 'JBH', '{branch_staff}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('cececece-0000-4000-8000-000000000001');
insert into ids values ('count', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb, now() - interval '10 minutes'));
insert into ids
select 'line', l.id from public.stock_count_lines l
where l.count_id = (select id from ids where name = 'count') and l.product_id = tests.product('Flan');

create temp table before_stock as
select coalesce(sum(qty_pieces), 0)::int as qty from public.stock_movements
where location_id = tests.location('SWF') and product_id = tests.product('Flan');
grant all on before_stock to authenticated;

select lives_ok(
  format($$ select public.staff_edit_count(%L, '[{"line_id": "%s", "whole_cakes": 3, "loose_pieces": 0}]'::jsonb) $$,
    (select id from ids where name = 'count'), (select id from ids where name = 'line')),
  'the counter fixes the count within 15 minutes'
);
select is(
  (select coalesce(sum(qty_pieces), 0)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  (select qty + 10 from before_stock), 'the stock moves by the difference'
);
select is(
  (select qty_pieces from public.stock_count_lines where id = (select id from ids where name = 'line')),
  30, 'the line holds the new number'
);
select tests.as_postgres();
select ok(
  exists (select 1 from public.audit_log where table_name = 'stock_count_lines'
          and row_id = (select id from ids where name = 'line')::text
          and reason = 'تعديل الموظف خلال ربع ساعة من الجرد'),
  'the edit is in the audit log with its reason'
);
select tests.authenticate_as('cececece-0000-4000-8000-000000000001');

-- تعديل مباشر على السطر (مش عن طريق الدالة) ما بيعمل شي (RLS)
update public.stock_count_lines set whole_cakes = 9 where id = (select id from ids where name = 'line');
select is(
  (select qty_pieces from public.stock_count_lines where id = (select id from ids where name = 'line')),
  30, 'the line cannot be updated directly'
);

select tests.authenticate_as('cececece-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.staff_edit_count(%L, '[]'::jsonb) $$, (select id from ids where name = 'count')),
  '42501', null, 'another branch cannot edit it'
);

-- بعد جرد ثاني، القديم ما بيتعدّل
select tests.authenticate_as('cececece-0000-4000-8000-000000000001');
select public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb, now() - interval '1 minute');
select throws_ok(
  format($$ select public.staff_edit_count(%L, '[{"line_id": "%s", "whole_cakes": 1, "loose_pieces": 0}]'::jsonb) $$,
    (select id from ids where name = 'count'), (select id from ids where name = 'line')),
  '23514', null, 'an older count cannot be edited once a newer one exists'
);

select * from finish();
rollback;
