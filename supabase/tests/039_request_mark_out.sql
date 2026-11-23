-- 23 نوفمبر 2026: زر "تم إخراج الطلبية" لمسؤول المصنع (فترة التجربة).
begin;
select no_plan();

select tests.create_staff('c0c0c0c0-0000-4000-8000-000000000001', 'مسؤول المصنع', '962793340001', 'FAC', '{factory_manager}');
select tests.create_staff('c0c0c0c0-0000-4000-8000-000000000002', 'فرع', '962793340002', 'SWF', '{branch_staff}');
select tests.create_staff('c0c0c0c0-0000-4000-8000-000000000003', 'إخراج', '962793340003', 'FAC', '{dispatcher}');
select tests.create_staff('c0c0c0c0-0000-4000-8000-000000000004', 'IT', '962793340004', null, '{admin}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000002');
insert into ids values ('req', public.create_request(format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb));

select throws_ok(
  format($$ select public.mark_request_out(%L) $$, (select id from ids where name = 'req')),
  '42501', null, 'the branch cannot mark its request'
);

select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.mark_request_out(%L) $$, (select id from ids where name = 'req')),
  '42501', null, 'only the factory manager (or the admin), not the dispatcher'
);

select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select public.mark_request_out(%L) $$, (select id from ids where name = 'req')),
  'the factory manager marks the order as out'
);
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'req')),
  'dispatched', 'the request no longer waits for the factory'
);
select is(
  (select count(*)::int from public.request_mark_outs where request_id = (select id from ids where name = 'req')),
  1, 'who marked it is kept'
);
select is(
  (select count(*)::int from public.dispatches where request_id = (select id from ids where name = 'req')),
  0, 'no dispatch and no stock movement'
);
select throws_ok(
  format($$ select public.mark_request_out(%L) $$, (select id from ids where name = 'req')),
  '23514', null, 'a request already out cannot be marked again'
);

-- IT بيطفي الزر
select tests.as_postgres();
update public.app_settings set feature_request_mark_out = false;
select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000002');
insert into ids values ('req2', public.create_request(format('[{"product_id": "%s", "whole_cakes": 1}]', tests.product('Flan'))::jsonb));
select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.mark_request_out(%L) $$, (select id from ids where name = 'req2')),
  '23514', null, 'turned off by IT: the button does nothing'
);

select tests.authenticate_as('c0c0c0c0-0000-4000-8000-000000000004');
select throws_ok(
  $$ update public.app_settings set feature_request_mark_out = true $$,
  '42501', null, 'only IT switches it'
);

select * from finish();
rollback;
