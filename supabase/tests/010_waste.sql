-- التالف: الصلاحيات، القطع، الدفعة بالمصنع، والحركة.
begin;
select no_plan();

select tests.create_staff('aaaaaaaa-0000-4000-8000-000000000001', 'أحمد', '962792220001', 'SWF', '{branch_staff}');
select tests.create_staff('aaaaaaaa-0000-4000-8000-000000000003', 'سامر', '962792220003', 'FAC', '{storekeeper}');

select tests.location('SWF') as swf \gset
select tests.product('Flan') as flan \gset

select tests.as_anon();
select throws_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'broken') $$, :'swf', :'flan'),
  '42501', null, 'anon cannot record waste'
);

select tests.authenticate_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'broken') $$, tests.location('JBH'), :'flan'),
  '42501', null, 'staff cannot record waste at another branch'
);
select throws_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'other') $$, :'swf', :'flan'),
  '23514', null, '"other" needs a note'
);
select throws_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'expired') $$, :'swf', tests.product('Tiramisu')),
  '23514', null, 'a pieces-only product cannot be wasted as a whole cake'
);
select throws_ok(
  format($$ select public.record_waste(%L, %L, 'piece', 0, 'expired') $$, :'swf', :'flan'),
  '23514', null, 'the quantity must be positive'
);

select lives_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 2, 'broken') $$, :'swf', :'flan'),
  'a branch employee records two broken cakes'
);
select results_eq(
  $$ select w.qty_pieces, m.qty_pieces, m.movement_type::text, w.recorded_by
     from public.waste_records w join public.stock_movements m on m.waste_record_id = w.id
     where w.location_id = tests.location('SWF') $$,
  $$ values (20, -20, 'waste', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'waste is stored in pieces and moves stock down by the same amount'
);
select lives_ok(
  format($$ select public.record_waste(%L, %L, 'piece', 3, 'other', '  وقعت  ') $$, :'swf', :'flan'),
  'loose pieces with a note'
);
select results_eq(
  $$ select reason_note from public.waste_records where reason = 'other' $$,
  $$ values ('وقعت') $$,
  'the note is trimmed'
);

select tests.authenticate_as('aaaaaaaa-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'expired') $$, tests.location('FAC'), :'flan'),
  '23514', null, 'factory waste needs a batch'
);
select lives_ok(
  format($$ select public.record_waste(%L, %L, 'cake', 1, 'expired', null, %L) $$,
         tests.location('FAC'), :'flan', public.amman_today() - 6),
  'factory waste on a batch'
);
select results_eq(
  $$ select b.production_date, m.qty_pieces from public.stock_movements m join public.batches b on b.id = m.batch_id
     where m.movement_type = 'waste' and m.location_id = tests.location('FAC') $$,
  format($$ values (%L::date, -10) $$, public.amman_today() - 6),
  'the factory waste movement is on that batch'
);

select * from finish();
rollback;
