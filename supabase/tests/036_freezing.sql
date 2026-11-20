-- 20 نوفمبر 2026: التفريز. المفرّز دفعة لحالها، صلاحيتها 30 يوم، والإخراج بيطلّع اللي بيخلص أول.
begin;
select no_plan();

select tests.create_staff('fefefefe-0000-4000-8000-000000000001', 'أمين التفريز', '962796660001', 'FAC', '{storekeeper,dispatcher}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('fefefefe-0000-4000-8000-000000000001');

-- دفعة مفرّزة عمرها 10 أيام (الطازة كانت تكون منتهية)
select lives_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "production_date": "%s", "frozen": true, "whole_cakes": 4}]') $$,
    tests.location('FAC'), tests.product('Flan'), public.amman_today() - 10),
  'the factory counts a frozen batch'
);
select results_eq(
  format($$ select is_frozen, is_expired, expires_on from public.v_factory_batches
            where product_id = %L and location_id = %L $$, tests.product('Flan'), tests.location('FAC')),
  format($$ values (true, false, %L::date) $$, public.amman_today() + 20),
  'a frozen batch lasts 30 days from production'
);

-- إنتاج اليوم: 2 طازة و3 مفرّزة
insert into ids values ('production', public.record_production(
  format('[{"product_id": "%s", "whole_cakes": 2}, {"product_id": "%s", "whole_cakes": 3, "frozen": true}]',
    tests.product('Flan'), tests.product('Flan'))::jsonb));
select results_eq(
  format($$ select b.is_frozen, sum(l.whole_cakes)::int from public.production_lines l
            join public.batches b on b.id = l.batch_id
            join public.production_entries e on e.id = l.entry_id
            where l.product_id = %L and e.recorded_by = 'fefefefe-0000-4000-8000-000000000001'
            group by b.is_frozen order by b.is_frozen $$, tests.product('Flan')),
  $$ values (false, 2), (true, 3) $$,
  'production splits fresh and frozen into two batches of the same day'
);
select is(
  (select count(*)::int from public.batches where product_id = tests.product('Flan') and production_date = public.amman_today()),
  2, 'same product and day, one fresh and one frozen batch'
);

-- الإخراج: الطازة أول، بعدين المفرّز الأقدم صلاحية
insert into ids values ('dispatch', public.create_dispatch(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3}]', tests.product('Flan'))::jsonb));
select results_eq(
  format($$ select b.is_frozen, b.production_date, -sum(m.qty_pieces)::int from public.stock_movements m
            join public.batches b on b.id = m.batch_id
            join public.dispatch_lines dl on dl.id = m.dispatch_line_id
            where dl.dispatch_id = %L and m.location_id = %L
            group by 1, 2 order by 1, 2 $$, (select id from ids where name = 'dispatch'), tests.location('FAC')),
  format($$ values (false, %L::date, 20), (true, %L::date, 10) $$, public.amman_today(), public.amman_today() - 10),
  'FEFO by expiry: fresh first, then the frozen batch that ends first'
);

-- اختيار المفرّز الجديد وفي مفرّز بيخلص قبله = تجاوز
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1, "batches": [{"production_date": "%s", "frozen": true, "qty_pieces": 10}]}]') $$,
    tests.location('SWF'), tests.product('Flan'), public.amman_today()),
  '23514', null, 'taking the later frozen batch while an earlier one is left needs confirming'
);
select lives_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1, "batches": [{"production_date": "%s", "frozen": true, "qty_pieces": 10}]}]', null, null, true) $$,
    tests.location('SWF'), tests.product('Flan'), public.amman_today()),
  'with confirmation the chosen frozen batch goes out'
);
select is(
  (select v.qty_pieces::int from public.v_factory_batches v join public.batches b on b.id = v.batch_id
   where b.product_id = tests.product('Flan') and b.production_date = public.amman_today() and b.is_frozen),
  20, 'the frozen batch of today has 2 cakes left'
);

-- التالف من الدفعة المفرّزة
select tests.as_postgres();
insert into ids select 'broken', id from public.lookup_options where list_key = 'waste_reasons' and code = 'broken';
select tests.authenticate_as('fefefefe-0000-4000-8000-000000000001');
insert into ids values ('waste', public.log_waste(
  tests.location('FAC'), tests.product('Flan'), 'cake', 1, (select id from ids where name = 'broken'), null,
  public.amman_today(), tests.location('FAC') || '/2026-11-20/w.jpg', true));
select is(
  (select b.is_frozen from public.waste_records w join public.batches b on b.id = w.batch_id
   where w.id = (select id from ids where name = 'waste')),
  true, 'waste can come from the frozen batch'
);
select is(
  current_setting('mekasa.waste_frozen', true), '', 'the frozen flag does not stay on after the waste'
);

select * from finish();
rollback;
