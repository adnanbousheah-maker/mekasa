-- مستودع التغليف: الطلب والإخراج والاستلام والجرد، والدور بأي موقع.
begin;
select no_plan();

select tests.create_staff('adadadad-0000-4000-8000-000000000001', 'أحمد', '962791110001', 'SWF', '{branch_staff}');
-- أمين التغليف موظف بالمصنع: الدور مش الموقع
select tests.create_staff('adadadad-0000-4000-8000-000000000002', 'مازن', '962791110002', 'FAC', '{packaging_keeper}');
select tests.create_staff('adadadad-0000-4000-8000-000000000003', 'سامر', '962791110003', 'FAC', '{dispatcher}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select lives_ok($$ set constraints all immediate $$, 'a packaging keeper can work at any location');
set constraints all deferred;

-- الجرد بالمستودع
select tests.authenticate_as('adadadad-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.submit_count(%L, '[]') $$, tests.location('PKG')),
  '42501', null, 'branch staff cannot count the packaging store'
);

select tests.authenticate_as('adadadad-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "loose_pieces": 100}]') $$,
    tests.location('PKG'), tests.product('Cake Box')),
  'the keeper counts the packaging store from anywhere'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "loose_pieces": 1}]') $$,
    tests.location('PKG'), tests.product('Tiramisu')),
  '23514', null, 'cakes are not counted at the packaging store'
);

-- الطلب
select tests.authenticate_as('adadadad-0000-4000-8000-000000000001');
insert into ids values ('request', public.create_request(
  format('[{"product_id": "%s", "loose_pieces": 20}]', tests.product('Cake Box'))::jsonb));
select is(
  (select supplying_location_id from public.stock_requests where id = (select id from ids where name = 'request')),
  tests.location('PKG'), 'packaging is ordered from the packaging store'
);
select throws_ok(
  format($$ select public.create_request('[{"product_id": "%s", "loose_pieces": 20}, {"product_id": "%s", "whole_cakes": 1}]') $$,
    tests.product('Cake Box'), tests.product('Flan')),
  '23514', null, 'one request does not mix packaging and cakes'
);

-- الإخراج
select tests.authenticate_as('adadadad-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.create_dispatch(%L, '[{"product_id": "%s", "loose_pieces": 5}]') $$,
    tests.location('SWF'), tests.product('Cake Box')),
  '23514', null, 'the factory dispatcher does not send packaging'
);

select tests.authenticate_as('adadadad-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.stock_requests where id = (select id from ids where name = 'request')),
  1, 'the keeper sees requests to the packaging store'
);
insert into ids values ('dispatch', public.create_dispatch(
  tests.location('SWF'),
  format('[{"product_id": "%s", "loose_pieces": 20, "request_line_id": "%s"}]', tests.product('Cake Box'),
    (select l.id from public.stock_request_lines l where l.request_id = (select id from ids where name = 'request')))::jsonb,
  (select id from ids where name = 'request')));
select results_eq(
  $$ select from_location_id = tests.location('PKG'), kind::text from public.dispatches
     where id = (select id from ids where name = 'dispatch') $$,
  $$ values (true, 'replenishment') $$,
  'the keeper sends from the packaging store'
);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('PKG') and product_id = tests.product('Cake Box')),
  80, 'the store stock goes down'
);

-- الاستلام، وجرد الكيك بالفرع ما بيصفّر التغليف
select tests.authenticate_as('adadadad-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.receive_dispatch(%L, '[{"dispatch_line_id": "%s", "loose_pieces": 20}]') $$,
    (select id from ids where name = 'dispatch'),
    (select l.id from public.dispatch_lines l where l.dispatch_id = (select id from ids where name = 'dispatch'))),
  'the branch receives the packaging'
);
select public.submit_count(tests.location('SWF'), format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb);
select is(
  (select sum(qty_pieces)::int from public.stock_movements
   where location_id = tests.location('SWF') and product_id = tests.product('Cake Box')),
  20, 'a cake count at the branch leaves packaging alone'
);
select throws_ok(
  format($$ select public.submit_count(%L, '[{"product_id": "%s", "loose_pieces": 3}]') $$,
    tests.location('SWF'), tests.product('Cake Box')),
  '23514', null, 'branches do not count packaging yet'
);

-- آخر شي، لأن الفحص المؤجل الفاشل بيأثر على اللي بعده
select tests.as_postgres();
update public.staff set location_id = null where id = 'adadadad-0000-4000-8000-000000000002';
select throws_ok($$ set constraints all immediate $$, '23514', null, 'a packaging keeper still needs a location');

select * from finish();
rollback;
