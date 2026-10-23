-- الطلب والإخراج (FEFO) والاستلام والإنتاج والمرتجعات.
begin;
select no_plan();

select tests.create_staff('cccccccc-0000-4000-8000-000000000001', 'أحمد', '962794440001', 'SWF', '{branch_staff}');
select tests.create_staff('cccccccc-0000-4000-8000-000000000002', 'رنا', '962794440002', 'JBH', '{branch_staff}');
select tests.create_staff('cccccccc-0000-4000-8000-000000000003', 'سامر', '962794440003', 'FAC', '{dispatcher,storekeeper}');
select tests.create_staff('cccccccc-0000-4000-8000-000000000004', 'مدير', '962794440004', null, '{admin}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ─── الإنتاج ─────────────────────────────────────────────────────────

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.record_production('[{"product_id": "%s", "whole_cakes": 3}]') $$, tests.product('Flan')),
  '42501', null, 'branch staff cannot record production'
);

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.record_production('[{"product_id": "%s", "whole_cakes": 5}]') $$, tests.product('Flan')),
  'the storekeeper records production'
);
select results_eq(
  $$ select b.production_date, m.qty_pieces from public.stock_movements m join public.batches b on b.id = m.batch_id
     where m.movement_type = 'production' $$,
  $$ values (public.amman_today(), 50) $$,
  'production goes into today''s batch'
);

-- دفعتين أقدم: وحدة عمرها 3 أيام، ووحدة منتهية (7 أيام) — من خلال جرد المصنع
select public.submit_count(tests.location('FAC'), format(
  '[{"product_id": "%1$s", "production_date": "%2$s", "whole_cakes": 2},
    {"product_id": "%1$s", "production_date": "%3$s", "whole_cakes": 1},
    {"product_id": "%1$s", "production_date": "%4$s", "whole_cakes": 5}]',
  tests.product('Flan'), public.amman_today() - 3, public.amman_today() - 7, public.amman_today())::jsonb);

-- ─── الطلب ───────────────────────────────────────────────────────────

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000002');
insert into ids values ('request', public.create_request(
  format('[{"product_id": "%s", "whole_cakes": 3, "suggested_pieces": 30}]', tests.product('Flan'))::jsonb));
select results_eq(
  $$ select status::text, requesting_location_id = tests.location('JBH'), supplying_location_id = tests.location('FAC')
     from public.stock_requests where id = (select id from ids where name = 'request') $$,
  $$ values ('sent', true, true) $$,
  'a branch request goes straight to the factory when approval is off'
);

-- ─── الإخراج ─────────────────────────────────────────────────────────

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 9}]') $$,
         tests.location('JBH'), tests.product('Flan')),
  '23514', null, 'cannot dispatch more than the factory has (expired batch does not count)'
);

-- أحدث دفعة بدل الأقدم: لازم تأكيد
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1, "batches": [{"production_date": "%s", "qty_pieces": 10}]}]') $$,
         tests.location('JBH'), tests.product('Flan'), public.amman_today()),
  '23514', null, 'taking a newer batch while an older one is in stock needs confirmation'
);
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1, "batches": [{"production_date": "%s", "qty_pieces": 10}]}]') $$,
         tests.location('JBH'), tests.product('Flan'), public.amman_today() - 7),
  '23514', null, 'an expired batch cannot be dispatched'
);

insert into ids values ('dispatch', public.create_dispatch(
  tests.location('JBH'),
  format('[{"product_id": "%s", "whole_cakes": 3, "request_line_id": "%s"}]', tests.product('Flan'),
         (select id from public.stock_request_lines where request_id = (select id from ids where name = 'request')))::jsonb,
  (select id from ids where name = 'request')));

select results_eq(
  $$ select b.production_date, d.qty_pieces, d.is_fefo_override
     from public.dispatch_line_batches d join public.batches b on b.id = d.batch_id
     join public.dispatch_lines l on l.id = d.dispatch_line_id
     where l.dispatch_id = (select id from ids where name = 'dispatch') order by b.production_date $$,
  format($$ values (%L::date, 20, false), (%L::date, 10, false) $$, public.amman_today() - 3, public.amman_today()),
  'FEFO takes the oldest non-expired batch first, then the next'
);
select results_eq(
  $$ select status::text from public.stock_requests where id = (select id from ids where name = 'request') $$,
  $$ values ('dispatched') $$,
  'the request moves to dispatched'
);

insert into ids values ('override', public.create_dispatch(
  tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 1, "batches": [{"production_date": "%s", "qty_pieces": 10}]}]',
         tests.product('Flan'), public.amman_today())::jsonb,
  null, null, true));
select results_eq(
  $$ select d.is_fefo_override, d.override_confirmed_by from public.dispatch_line_batches d
     join public.dispatch_lines l on l.id = d.dispatch_line_id where l.dispatch_id = (select id from ids where name = 'override') $$,
  $$ values (false, null::uuid) $$,
  'no override when the older batches are already empty'
);

-- ─── الاستلام ────────────────────────────────────────────────────────

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.receive_dispatch(%L, '[]') $$, (select id from ids where name = 'dispatch')),
  '42501', null, 'another branch cannot receive it'
);

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.receive_dispatch(%L, '[]') $$, (select id from ids where name = 'dispatch')),
  '23514', null, 'every line must be received'
);
select lives_ok(
  format($$ select public.receive_dispatch(%L, '[{"dispatch_line_id": "%s", "whole_cakes": 2, "note": "وحدة مكسورة"}]') $$,
         (select id from ids where name = 'dispatch'),
         (select id from public.dispatch_lines where dispatch_id = (select id from ids where name = 'dispatch'))),
  'the branch receives with a difference and a note'
);
select results_eq(
  $$ select (select sum(qty_pieces)::int from public.stock_movements where location_id = tests.location('JBH')),
            (select status::text from public.stock_requests where id = (select id from ids where name = 'request')),
            (select status::text from public.dispatches where id = (select id from ids where name = 'dispatch')) $$,
  $$ values (20, 'received', 'received') $$,
  'the branch stock grows by what arrived, and the documents close'
);
select throws_ok(
  format($$ select public.receive_dispatch(%L, '[]') $$, (select id from ids where name = 'dispatch')),
  '23514', null, 'a dispatch is received once'
);
select results_eq(
  $$ select qty_pieces, age_days, near_expiry from public.v_branch_stock_age
     where location_id = tests.location('JBH') and product_id = tests.product('Flan') $$,
  $$ values (20, 0, false) $$,
  'the branch stock age is estimated from the receipts'
);

-- ─── التحويل والإرجاع (إعدادات) ──────────────────────────────────────

select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1}]') $$,
         tests.location('RET'), tests.product('Flan')),
  '23514', null, 'returns are off by default'
);
select lives_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 1}]') $$,
         tests.location('SWF'), tests.product('Flan')),
  'a branch transfers to another branch (on by default)'
);

select tests.as_postgres();
update public.app_settings set returns_enabled = true;
select tests.authenticate_as('cccccccc-0000-4000-8000-000000000002');
insert into ids values ('return', public.create_dispatch(tests.location('RET'),
  format('[{"product_id": "%s", "whole_cakes": 1}]', tests.product('Flan'))::jsonb));

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.receive_dispatch(%L, '[{"dispatch_line_id": "%s", "whole_cakes": 1}]') $$,
         (select id from ids where name = 'return'),
         (select id from public.dispatch_lines where dispatch_id = (select id from ids where name = 'return'))),
  'the storekeeper receives the return into the returns bin'
);
select throws_ok(
  format($$ select public.decide_return(%L, 8, 4, %L) $$,
         (select rl.id from public.receipt_lines rl join public.receipts r on r.id = rl.receipt_id where r.dispatch_id = (select id from ids where name = 'return')),
         public.amman_today()),
  '23514', null, 'cannot decide more than what came back'
);
select lives_ok(
  format($$ select public.decide_return(%L, 6, 4, %L) $$,
         (select rl.id from public.receipt_lines rl join public.receipts r on r.id = rl.receipt_id where r.dispatch_id = (select id from ids where name = 'return')),
         public.amman_today()),
  'six pieces back to stock, four as waste'
);
select results_eq(
  $$ select coalesce(sum(qty_pieces), 0)::int from public.stock_movements where location_id = tests.location('RET') $$,
  $$ values (0) $$,
  'the returns bin is empty after the decision'
);

-- ─── موافقة الأدمن ───────────────────────────────────────────────────

select tests.as_postgres();
update public.app_settings set order_approval_required = true;
select tests.authenticate_as('cccccccc-0000-4000-8000-000000000001');
insert into ids values ('pending', public.create_request(
  format('[{"product_id": "%s", "whole_cakes": 1}]', tests.product('Latte'))::jsonb));
select results_eq(
  $$ select status::text from public.stock_requests where id = (select id from ids where name = 'pending') $$,
  $$ values ('pending_approval') $$,
  'with approval on, the request waits for the admin'
);
select throws_ok(
  format($$ select public.admin_decide_request(%L, true) $$, (select id from ids where name = 'pending')),
  '42501', null, 'staff cannot approve'
);
select tests.authenticate_as('cccccccc-0000-4000-8000-000000000004');
select lives_ok(
  format($$ select public.admin_decide_request(%L, true) $$, (select id from ids where name = 'pending')),
  'the admin approves'
);
select results_eq(
  $$ select status::text, approved_by from public.stock_requests where id = (select id from ids where name = 'pending') $$,
  $$ values ('sent', 'cccccccc-0000-4000-8000-000000000004'::uuid) $$,
  'approved requests go to the factory with the approver recorded'
);

select * from finish();
rollback;
