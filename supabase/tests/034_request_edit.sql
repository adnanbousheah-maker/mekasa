-- 20 نوفمبر 2026: تعديل الطلب خلال ربع ساعة، والإلغاء للأدمن والمدير العام، والقطع لحد 99.
begin;
select no_plan();

select tests.create_staff('cdcdcdcd-0000-4000-8000-000000000001', 'فرع التعديل', '962797770001', 'SWF', '{branch_staff}');
select tests.create_staff('cdcdcdcd-0000-4000-8000-000000000002', 'فرع ثاني', '962797770002', 'JBH', '{branch_staff}');
select tests.create_staff('cdcdcdcd-0000-4000-8000-000000000003', 'مدير عام', '962797770003', null, '{general_manager}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select tests.authenticate_as('cdcdcdcd-0000-4000-8000-000000000001');
insert into ids values ('first', public.create_request(
  format('[{"product_id": "%s", "whole_cakes": 2}]', tests.product('Flan'))::jsonb));

select throws_ok(
  format($$ select public.create_request('[{"product_id": "%s", "loose_pieces": 100}]'::jsonb) $$, tests.product('Tiramisu')),
  '23514', null, 'pieces in a request go up to 99'
);

-- التعديل خلال ربع ساعة
insert into ids values ('edited', public.edit_request(
  (select id from ids where name = 'first'),
  format('[{"product_id": "%s", "whole_cakes": 3}, {"product_id": "%s", "loose_pieces": 5}]',
    tests.product('Flan'), tests.product('Tiramisu'))::jsonb));

select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'first')),
  'cancelled', 'the old request is cancelled'
);
select results_eq(
  format($$ select r.replaces_request_id, r.requested_at = o.requested_at, r.status::text
            from public.stock_requests r, public.stock_requests o
            where r.id = %L and o.id = %L $$,
    (select id from ids where name = 'edited'), (select id from ids where name = 'first')),
  format($$ values (%L::uuid, true, 'sent') $$, (select id from ids where name = 'first')),
  'the new request points to the old one and keeps its time, so the 15 minutes do not restart'
);
select is(
  (select sum(qty_pieces)::int from public.stock_request_lines where request_id = (select id from ids where name = 'edited')),
  35, 'the new request has the edited lines'
);
select throws_ok(
  format($$ select public.edit_request(%L, '[{"product_id": "%s", "whole_cakes": 1}]'::jsonb) $$,
    (select id from ids where name = 'first'), tests.product('Flan')),
  '23514', null, 'a cancelled request cannot be edited again'
);

select tests.authenticate_as('cdcdcdcd-0000-4000-8000-000000000002');
select throws_ok(
  format($$ select public.edit_request(%L, '[{"product_id": "%s", "whole_cakes": 1}]'::jsonb) $$,
    (select id from ids where name = 'edited'), tests.product('Flan')),
  '42501', null, 'another branch cannot edit it'
);

-- بعد ربع ساعة: الفرع ما بيعدّل ولا بيلغي
select tests.as_postgres();
with x as (
  insert into public.stock_requests (requesting_location_id, supplying_location_id, status, requested_by, requested_at)
  values (tests.location('SWF'), tests.location('FAC'), 'sent', 'cdcdcdcd-0000-4000-8000-000000000001', now() - interval '20 minutes')
  returning id
)
insert into ids select 'old', id from x;
insert into public.stock_request_lines (request_id, product_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
values ((select id from ids where name = 'old'), tests.product('Flan'), 1, 0, 10);

select tests.authenticate_as('cdcdcdcd-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.edit_request(%L, '[{"product_id": "%s", "whole_cakes": 4}]'::jsonb) $$,
    (select id from ids where name = 'old'), tests.product('Flan')),
  '23514', null, 'after 15 minutes the branch cannot edit'
);
select throws_ok(
  format($$ select public.cancel_request(%L) $$, (select id from ids where name = 'old')),
  '23514', null, 'after 15 minutes the branch cannot cancel'
);

-- المدير العام (والأدمن) بيلغي بأي وقت قبل ما يطلع
select tests.authenticate_as('cdcdcdcd-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.cancel_request(%L) $$, (select id from ids where name = 'old')),
  'the general manager can delete (cancel) a request'
);
select is(
  (select status::text from public.stock_requests where id = (select id from ids where name = 'old')),
  'cancelled', 'and it is cancelled, not removed'
);

select * from finish();
rollback;
