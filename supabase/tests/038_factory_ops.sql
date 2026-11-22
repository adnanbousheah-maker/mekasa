-- 22 نوفمبر 2026: مسؤول المصنع، التطليع بدون ستوك، والطلب على دفعتين.
begin;
select no_plan();

select tests.create_staff('b0b0b0b0-0000-4000-8000-000000000001', 'مسؤول المصنع', '962793330001', 'FAC', '{factory_manager}');
select tests.create_staff('b0b0b0b0-0000-4000-8000-000000000002', 'فرع', '962793330002', 'SWF', '{branch_staff}');
select tests.create_staff('b0b0b0b0-0000-4000-8000-000000000003', 'مدير عام', '962793330003', null, '{general_manager}');
select tests.create_staff('b0b0b0b0-0000-4000-8000-000000000004', 'أدمن', '962793330004', null, '{admin}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ─── مسؤول المصنع ───
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
select ok(private.has_role('storekeeper') and private.has_role('dispatcher'), 'the factory manager does the storekeeper and dispatch work');
select ok(not private.has_role('branch_staff'), 'but not branch work');
select lives_ok(
  format($$ select public.record_production('[{"product_id": "%s", "whole_cakes": 2}]') $$, tests.product('Flan')),
  'the factory manager records production'
);

-- ─── الطلب على دفعتين ───
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
insert into ids values ('req', public.create_request(format('[{"product_id": "%s", "whole_cakes": 5}]', tests.product('Flan'))::jsonb));
insert into ids select 'line', l.id from public.stock_request_lines l where l.request_id = (select id from ids where name = 'req');

select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
-- بدون ستوك كافي ومع الإعداد موقوف: بينرفض
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "whole_cakes": 5, "request_line_id": "%s"}]', %L) $$,
    tests.location('SWF'), tests.product('Flan'), (select id from ids where name = 'line'), (select id from ids where name = 'req')),
  '23514', null, 'without the setting, the factory cannot send more than it has'
);
insert into ids values ('d1', public.create_dispatch(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 2, "request_line_id": "%s"}]', tests.product('Flan'), (select id from ids where name = 'line'))::jsonb,
  (select id from ids where name = 'req')));
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req')),
  'partial', 'two of five cakes went out: the request stays open'
);

-- الفرع بيستلم الدفعة الأولى: الطلب لسا مفتوح
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
select public.receive_dispatch((select id from ids where name = 'd1'),
  (select jsonb_agg(jsonb_build_object('dispatch_line_id', dl.id, 'whole_cakes', dl.whole_cakes, 'loose_pieces', dl.loose_pieces))
   from public.dispatch_lines dl where dl.dispatch_id = (select id from ids where name = 'd1')));
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req')),
  'partial', 'receiving the first part keeps the request open'
);

-- ─── التطليع بدون ستوك ───
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.set_factory_dispatch_without_stock(true) $$,
  '42501', null, 'branch staff cannot turn it on'
);
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000003');
select lives_ok($$ select public.set_factory_dispatch_without_stock(true) $$, 'the general manager turns it on');

-- الدفعة الثانية: 3 كيكات والمصنع فاضي، فبتطلع من دفعة اليوم وستوكها سالب
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
insert into ids values ('d2', public.create_dispatch(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 3, "request_line_id": "%s"}]', tests.product('Flan'), (select id from ids where name = 'line'))::jsonb,
  (select id from ids where name = 'req')));
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req')),
  'dispatched', 'the rest went out: the request is dispatched'
);
select tests.as_postgres();
select is(
  (select sum(qty_pieces)::int from public.stock_movements m join public.batches b on b.id = m.batch_id
   where m.location_id = tests.location('FAC') and m.product_id = tests.product('Flan') and b.production_date = public.amman_today()
     and not b.is_frozen),
  -30, 'the shortage is on today''s batch (negative until production or a count)'
);

-- الفرع بيستلم الثانية: الطلب صار مستلم
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
select public.receive_dispatch((select id from ids where name = 'd2'),
  (select jsonb_agg(jsonb_build_object('dispatch_line_id', dl.id, 'whole_cakes', dl.whole_cakes, 'loose_pieces', dl.loose_pieces))
   from public.dispatch_lines dl where dl.dispatch_id = (select id from ids where name = 'd2')));
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req')),
  'received', 'both parts received: the request is received'
);

-- ─── سكّر الطلب ───
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
insert into ids values ('req2', public.create_request(format('[{"product_id": "%s", "whole_cakes": 4}]', tests.product('Flan'))::jsonb));
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
select public.create_dispatch(tests.location('SWF'),
  format('[{"product_id": "%s", "whole_cakes": 1, "request_line_id": "%s"}]', tests.product('Flan'),
    (select l.id from public.stock_request_lines l where l.request_id = (select id from ids where name = 'req2')))::jsonb,
  (select id from ids where name = 'req2'));
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.close_request(%L) $$, (select id from ids where name = 'req2')),
  '42501', null, 'the branch cannot close the request'
);
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
select is(
  public.close_request((select id from ids where name = 'req2'))::text,
  'dispatched', 'the dispatcher closes it: the rest will not go out'
);

-- ─── آخر اليوم ───
select tests.as_postgres();
set local session_replication_role = replica;
insert into public.stock_requests (id, requesting_location_id, supplying_location_id, status, requested_by, requested_at)
values ('b0b0b0b0-0000-4000-8000-0000000000aa', tests.location('SWF'), tests.location('FAC'), 'partial',
        'b0b0b0b0-0000-4000-8000-000000000002', now() - interval '2 days');
set local session_replication_role = origin;
select is(private.close_stale_partial_requests(), 1, 'an open request from an earlier day is closed at night');
select is(
  (select status::text from public.stock_requests where id = 'b0b0b0b0-0000-4000-8000-0000000000aa'),
  'dispatched', 'and it is no longer waiting'
);
-- توزيع اليوم بدون ستوك: الناقص من دفعة اليوم
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000002');
insert into ids values ('req3', public.create_request(format('[{"product_id": "%s", "loose_pieces": 6}]', tests.product('Tiramisu'))::jsonb));
select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.dispatch_round(%L) $$, jsonb_build_array(jsonb_build_object(
    'request_id', (select id from ids where name = 'req3'),
    'lines', jsonb_build_array(jsonb_build_object('product_id', tests.product('Tiramisu'), 'loose_pieces',
      (select qty_pieces from public.stock_request_lines where request_id = (select id from ids where name = 'req3')),
      'request_line_id', (select id from public.stock_request_lines where request_id = (select id from ids where name = 'req3'))))))),
  'the round sends what the factory does not have yet'
);
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req3')),
  'dispatched', 'and the request is dispatched'
);

select tests.authenticate_as('b0b0b0b0-0000-4000-8000-000000000004');
select lives_ok($$ select public.set_factory_dispatch_without_stock(false) $$, 'the admin turns it off');

select * from finish();
rollback;
