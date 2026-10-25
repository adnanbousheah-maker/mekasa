-- الكمية المقترحة من معدل استهلاك آخر 4 أيام من نفس يوم بكرا.
begin;
select no_plan();

select tests.create_staff('acacacac-0000-4000-8000-000000000001', 'أحمد', '962799990001', 'SWF', '{branch_staff}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- افتتاحي 5 كيكات، بعدين 3 (راح 20 قطعة)، بعدين 2 (راح 10)
select tests.authenticate_as('acacacac-0000-4000-8000-000000000001');
insert into ids values ('opening', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 5}]', tests.product('Flan'))::jsonb, now() - interval '3 hours'));
insert into ids values ('week1', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb, now() - interval '2 hours'));
insert into ids values ('week2', public.submit_count(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb, now() - interval '1 hour'));

select results_eq(
  $$ select stock_pieces, avg_pieces, days_used from public.branch_suggestions(tests.location('SWF'))
     where product_id = tests.product('Flan') $$,
  $$ values (20, null::int, 0) $$,
  'without counts on the same weekday there is no average (the screen falls back to par)'
);

-- ننقل الجردين لنفس يوم بكرا قبل أسبوع وقبل أسبوعين
select tests.as_postgres();
set local session_replication_role = replica;
update public.stock_counts set business_date = public.amman_today() + 1 - 7 where id = (select id from ids where name = 'week1');
update public.stock_counts set business_date = public.amman_today() + 1 - 14 where id = (select id from ids where name = 'week2');
set local session_replication_role = origin;

select tests.authenticate_as('acacacac-0000-4000-8000-000000000001');
select results_eq(
  $$ select stock_pieces, avg_pieces, days_used from public.branch_suggestions(tests.location('SWF'))
     where product_id = tests.product('Flan') $$,
  $$ values (20, 15, 2) $$,
  'the average is over the counted same weekdays'
);
select results_eq(
  $$ select avg_pieces from public.branch_suggestions(tests.location('SWF')) where product_id = tests.product('Latte') $$,
  $$ values (0) $$,
  'an item with no consumption on counted days averages zero'
);

-- يوم مش نفس يوم بكرا ما بيدخل
select tests.as_postgres();
set local session_replication_role = replica;
update public.stock_counts set business_date = public.amman_today() + 1 - 10 where id = (select id from ids where name = 'week2');
set local session_replication_role = origin;
select tests.authenticate_as('acacacac-0000-4000-8000-000000000001');
select results_eq(
  $$ select avg_pieces, days_used from public.branch_suggestions(tests.location('SWF'))
     where product_id = tests.product('Flan') $$,
  $$ values (20, 1) $$,
  'other weekdays are left out'
);

select * from finish();
rollback;
