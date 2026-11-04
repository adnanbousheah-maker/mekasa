-- مراجعة 4 نوفمبر: جرد بوقت بداية قديم، التحويل بدون ستوك، الرمز الجديد بيطلّع من الأجهزة.
begin;
select no_plan();

select tests.create_staff('dddddddd-0000-4000-8000-000000000001', 'أحمد', '962795550001', 'SWF', '{branch_staff}');
select tests.create_staff('dddddddd-0000-4000-8000-000000000002', 'مدير', '962795550002', null, '{admin}');

-- ─── جرد بدأ قبل آخر جرد مؤكد ────────────────────────────────────────

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "whole_cakes": 3}]', now() - interval '10 minutes') $$,
         tests.location('SWF'), tests.product('Flan')),
  'a count is saved'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "whole_cakes": 3}]', now() - interval '20 minutes') $$,
         tests.location('SWF'), tests.product('Flan')),
  '23514', null,
  'a screen opened before the last confirmed count cannot count again'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Flan')),
  30,
  'the stock is counted once'
);

-- ─── التحويل من فرع بدون ستوك ────────────────────────────────────────

select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 4}]') $$,
         tests.location('JBH'), tests.product('Flan')),
  '23514', null,
  'a branch cannot send more than it has'
);
select lives_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 2}]') $$,
         tests.location('JBH'), tests.product('Flan')),
  'a branch sends what it has'
);

-- ─── رمز جديد بيمسح الجلسات ──────────────────────────────────────────

select tests.as_postgres();
insert into auth.sessions (id, user_id, created_at, updated_at)
values (gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', now(), now());
select tests.authenticate_as('dddddddd-0000-4000-8000-000000000002');
select public.admin_record_pin_reset('dddddddd-0000-4000-8000-000000000001');
select tests.as_postgres();
select is(
  (select count(*)::int from auth.sessions where user_id = 'dddddddd-0000-4000-8000-000000000001'),
  0,
  'a new PIN signs the staff member out everywhere'
);

select * from finish();
rollback;
