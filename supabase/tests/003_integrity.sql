-- القواعد اللي ما بتنكسر: الدفاتر، الجرد المؤكد، سجل التعديلات، الأدوار والمواقع، الدفعات.
begin;
select no_plan();

select tests.create_staff('22222222-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select tests.create_staff('22222222-0000-4000-8000-000000000004', 'عدنان', '962794444444', null, '{admin}');

create temp table fixture as
select tests.confirmed_count('SWF', '22222222-0000-4000-8000-000000000001', 'Classic Choco', 3, 5, is_opening => true) as line_id;
grant select on fixture to authenticated;
select tests.count_movement((select line_id from fixture), 35, 'opening_balance');

-- ─── دفتر الحركات وسجل التعديلات: إضافة بس ───────────────────────────

select throws_ok(
  $$ update public.stock_movements set qty_pieces = 1 $$,
  '23001', null, 'stock movements cannot be updated, even by postgres'
);
select throws_ok(
  $$ delete from public.stock_movements $$,
  '23001', null, 'stock movements cannot be deleted, even by postgres'
);
select throws_ok(
  $$ truncate public.stock_movements cascade $$,
  '23001', null, 'stock movements cannot be truncated'
);
select throws_ok(
  $$ update public.audit_log set reason = 'تغيير التاريخ' $$,
  '23001', null, 'the audit log cannot be rewritten'
);

-- ─── الجرد المؤكد ────────────────────────────────────────────────────

select throws_ok(
  $$ update public.stock_counts set is_opening = false $$,
  '23001', null, 'a confirmed count cannot be edited'
);
select throws_ok(
  $$ delete from public.stock_counts $$,
  '23001', null, 'a confirmed count cannot be deleted'
);
select throws_ok(
  $$ insert into public.stock_count_lines (count_id, product_id, loose_pieces)
     select count_id, tests.product('Tiramisu'), 4 from public.stock_count_lines where id = (select line_id from fixture) $$,
  '23001', null, 'no lines can be added after a count is confirmed'
);
select throws_ok(
  $$ delete from public.stock_count_lines $$,
  '23001', null, 'confirmed count lines cannot be deleted'
);

-- الموظف ما بيصحح
select set_config('request.jwt.claims', '{"sub":"22222222-0000-4000-8000-000000000001"}', true);
select set_config('mekasa.change_reason', 'غلطت بالعد', true);
select throws_ok(
  $$ update public.stock_count_lines set whole_cakes = 4 where id = (select line_id from fixture) $$,
  '42501', null, 'staff cannot correct a confirmed count, even with a reason'
);

-- الأدمن بدون سبب
select set_config('request.jwt.claims', '{"sub":"22222222-0000-4000-8000-000000000004"}', true);
select set_config('mekasa.change_reason', '', true);
select throws_ok(
  $$ update public.stock_count_lines set whole_cakes = 4 where id = (select line_id from fixture) $$,
  '23514', null, 'an admin correction needs a reason'
);

-- سبب فاضي فعلياً
select set_config('mekasa.change_reason', '  .  ', true);
select throws_ok(
  $$ update public.stock_count_lines set whole_cakes = 4 where id = (select line_id from fixture) $$,
  '23514', null, 'a one-character reason is not a reason'
);

-- السطر ما بينقل لجرد ثاني (مسودة) مشان يتعدل هناك
insert into public.stock_counts (location_id, method, counted_by)
values (tests.location('SWF'), 'manual', '22222222-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.stock_count_lines
     set count_id = (select id from public.stock_counts where status = 'draft'), whole_cakes = 9
     where id = (select line_id from fixture) $$,
  '23001', null, 'a confirmed line cannot be moved into a draft count to edit it there'
);

-- الأدمن مع سبب
select set_config('mekasa.change_reason', 'الصورة بتبين 4 مش 3', true);
select lives_ok(
  $$ update public.stock_count_lines set whole_cakes = 4 where id = (select line_id from fixture) $$,
  'an admin corrects a confirmed count with a reason'
);
select is(
  (select qty_pieces from public.stock_count_lines where id = (select line_id from fixture)),
  45, 'the corrected line recomputes its pieces'
);
select results_eq(
  $$ select reason, changed_by, (old_values ->> 'whole_cakes')::int, (new_values ->> 'whole_cakes')::int
     from public.audit_log
     where table_name = 'stock_count_lines' and row_id = (select line_id from fixture)::text $$,
  $$ values ('الصورة بتبين 4 مش 3', '22222222-0000-4000-8000-000000000004'::uuid, 3, 4) $$,
  'the correction keeps the original value, the reason and who made it'
);
select throws_ok(
  $$ update public.stock_count_lines set product_id = tests.product('Flan') where id = (select line_id from fixture) $$,
  '23001', null, 'a correction can change the counted quantities only'
);
select set_config('request.jwt.claims', '', true);
select set_config('mekasa.change_reason', '', true);

-- ─── التالف ثابت ─────────────────────────────────────────────────────

insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, reason, recorded_by)
values (tests.location('SWF'), tests.product('Tiramisu'), 'piece', 3, 'expired', '22222222-0000-4000-8000-000000000001');

select is(
  (select qty_pieces from public.waste_records where product_id = tests.product('Tiramisu')),
  3, 'piece waste is stored in pieces'
);
select throws_ok(
  $$ update public.waste_records set entered_qty = 1 $$,
  '23001', null, 'waste records cannot be edited'
);
select throws_ok(
  $$ insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, reason, recorded_by)
     values (tests.location('SWF'), tests.product('Flan'), 'cake', 1, 'other', '22222222-0000-4000-8000-000000000001') $$,
  '23514', null, '"other" waste needs a note (and cake waste needs a cake size)'
);

-- ─── الاستلام: الكمية ثابتة، والقرار على الفرق بيتعبى ─────────────────

with d as (
  insert into public.dispatches (from_location_id, to_location_id, kind, dispatched_by)
  values (tests.location('FAC'), tests.location('SWF'), 'replenishment', '22222222-0000-4000-8000-000000000004')
  returning id
), dl as (
  insert into public.dispatch_lines (dispatch_id, product_id, whole_cakes, pieces_per_cake_snapshot)
  select id, tests.product('Flan'), 3, 10 from d
  returning id, dispatch_id
), r as (
  insert into public.receipts (dispatch_id, location_id, received_by)
  select dispatch_id, tests.location('SWF'), '22222222-0000-4000-8000-000000000001' from dl
  returning id
)
insert into public.receipt_lines (receipt_id, dispatch_line_id, whole_cakes, pieces_per_cake_snapshot, note)
select r.id, dl.id, 2, 10, 'وحدة وصلت مكسورة' from r, dl;

select throws_ok(
  $$ update public.receipt_lines set whole_cakes = 3 $$,
  '23001', null, 'received quantities cannot be changed'
);
select lives_ok(
  $$ update public.receipt_lines
     set resolution = 'waste', resolved_at = now(), resolved_by = '22222222-0000-4000-8000-000000000004' $$,
  'the admin can record a decision on a receipt difference'
);
select throws_ok(
  $$ delete from public.dispatches $$,
  '23001', null, 'dispatches cannot be deleted'
);

select throws_ok(
  $$ update public.dispatches set to_location_id = tests.location('JBH') $$,
  '23001', null, 'a dispatch cannot be redirected to another location'
);
select lives_ok(
  $$ update public.dispatches set status = 'received' $$,
  'a dispatch moves from in transit to received'
);
select throws_ok(
  $$ update public.dispatches set status = 'in_transit' $$,
  '23514', null, 'a received dispatch cannot go back in transit'
);
select throws_ok(
  $$ update public.receipts set received_at = now() - interval '1 day' $$,
  '23001', null, 'receipts cannot be edited'
);

insert into public.stock_requests (requesting_location_id, supplying_location_id, requested_by)
values (tests.location('SWF'), tests.location('FAC'), '22222222-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.stock_requests set status = 'received' $$,
  '23514', null, 'a request cannot jump from sent to received'
);
select throws_ok(
  $$ update public.stock_requests set requesting_location_id = tests.location('JBH') $$,
  '23001', null, 'a request cannot change branch'
);

-- ─── شكل الحركات ─────────────────────────────────────────────────────

select throws_ok(
  $$ select tests.count_movement((select line_id from fixture), 35, 'opening_balance') $$,
  '23505', null, 'the same count line cannot be posted to the ledger twice'
);

select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select now(), location_id, tests.product('Flan'), -qty_pieces, 'waste', id from public.waste_records limit 1 $$,
  '23514', null, 'a waste movement must be for the wasted product'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select now(), tests.location('JBH'), product_id, -qty_pieces, 'waste', id from public.waste_records limit 1 $$,
  '23514', null, 'a waste movement must be at the waste''s location'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select now(), location_id, product_id, -1000, 'waste', id from public.waste_records limit 1 $$,
  '23514', null, 'a waste movement must be for the wasted quantity'
);
select lives_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select occurred_at, location_id, product_id, -qty_pieces, 'waste', id from public.waste_records limit 1 $$,
  'a waste movement that matches its record is accepted'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select occurred_at, location_id, product_id, -qty_pieces, 'waste', id from public.waste_records limit 1 $$,
  '23505', null, 'the same waste cannot be posted twice'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id)
     select now() + interval '1 day', c.location_id, l.product_id, -5, 'count_adjustment', l.id
     from public.stock_count_lines l join public.stock_counts c on c.id = l.count_id
     where l.id = (select line_id from fixture) $$,
  '23514', null, 'movements cannot be dated in the future'
);

-- حركة لجرد لسا مسودة
insert into public.stock_count_lines (count_id, product_id, loose_pieces)
select id, tests.product('Tiramisu'), 4 from public.stock_counts where status = 'draft';
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id)
     select now(), c.location_id, l.product_id, 4, 'opening_balance', l.id
     from public.stock_count_lines l join public.stock_counts c on c.id = l.count_id
     where c.status = 'draft' $$,
  '23514', null, 'stock does not move for a count that is still a draft'
);

select throws_ok(
  $$ insert into public.stock_counts (location_id, method, counted_by, photo_path)
     values (tests.location('SWF'), 'photo', '22222222-0000-4000-8000-000000000001', tests.location('JBH') || '/count.jpg') $$,
  '23514', null, 'a count photo must be in its own location''s folder'
);

-- ─── جرد المواد الأولية المؤكد ───────────────────────────────────────

insert into public.raw_materials (name, base_unit) values ('سكر', 'كيلو');
insert into public.raw_counts (location_id, counted_by)
values (tests.location('FAC'), '22222222-0000-4000-8000-000000000004');
insert into public.raw_count_lines (count_id, material_id, entered_qty, qty_base)
select c.id, m.id, 50, 50 from public.raw_counts c, public.raw_materials m;
update public.raw_counts set status = 'confirmed', confirmed_at = now();

select throws_ok(
  $$ update public.raw_counts set confirmed_at = now() - interval '1 day' $$,
  '23001', null, 'a confirmed raw material count cannot be edited'
);
select set_config('request.jwt.claims', '{"sub":"22222222-0000-4000-8000-000000000001"}', true);
select set_config('mekasa.change_reason', 'غلطت', true);
select throws_ok(
  $$ update public.raw_count_lines set qty_base = 40 $$,
  '42501', null, 'staff cannot correct a confirmed raw material count'
);
select set_config('request.jwt.claims', '{"sub":"22222222-0000-4000-8000-000000000004"}', true);
select lives_ok(
  $$ update public.raw_count_lines set entered_qty = 48, qty_base = 48 $$,
  'an admin corrects a confirmed raw material count with a reason'
);
select isnt_empty(
  $$ select 1 from public.audit_log where table_name = 'raw_count_lines' and reason = 'غلطت' $$,
  'the raw material correction is audited'
);
select set_config('request.jwt.claims', '', true);
select set_config('mekasa.change_reason', '', true);

select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type)
     values (now(), tests.location('SWF'), tests.product('Flan'), 10, 'admin_correction') $$,
  '23514', null, 'an admin correction must point at its audit entry'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id)
     select now(), location_id, product_id, 3, 'waste', id from public.waste_records limit 1 $$,
  '23514', null, 'waste always reduces stock'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id)
     values (now(), tests.location('FAC'), tests.product('Flan'), 10, 'count_adjustment', (select line_id from fixture)) $$,
  '23514', null, 'factory stock must name a batch'
);
select throws_ok(
  $$ insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id)
     values (now(), tests.location('SWF'), tests.product('Flan'), tests.batch('Flan', public.amman_today()),
             10, 'count_adjustment', (select line_id from fixture)) $$,
  '23514', null, 'branches do not track batches'
);

-- ─── الأدوار متوافقة مع المواقع ──────────────────────────────────────

select tests.create_staff('22222222-0000-4000-8000-000000000009', 'غلط', '962799999999', 'SWF', '{storekeeper}');
select throws_ok(
  $$ set constraints all immediate $$,
  '23514', null, 'a storekeeper cannot be placed at a branch'
);

select * from finish();
rollback;
