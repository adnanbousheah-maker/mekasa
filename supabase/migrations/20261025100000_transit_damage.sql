-- ملاحظات ميكاسا (25 أكتوبر 2026): اسم السائق مع الإخراج، والتوالف وقت الاستلام.
-- اللي وصل تالف بينحسب مستلم (الفرق مع الإخراج بيضل متل ما هو)، وبعدين بيتسجل تالف بالفرع
-- مع سبب "انكسرت" وملاحظة فيها اسم السائق، فبيطلع بتقرير التالف وعند الأدمن.

alter table public.dispatches
  add column driver_name text check (driver_name is null or length(trim(driver_name)) between 1 and 60);

alter table public.receipt_lines
  add column damaged_pieces int not null default 0 check (damaged_pieces >= 0),
  add column damage_waste_id uuid references public.waste_records (id),
  add constraint damage_within_received check (damaged_pieces <= qty_pieces),
  add constraint damage_has_waste check ((damaged_pieces = 0) = (damage_waste_id is null));

-- الإخراج ما بيتغير بعد ما ينكتب، واسم السائق جزء منه
create or replace function private.guard_dispatch_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.from_location_id, new.to_location_id, new.request_id, new.kind, new.dispatched_by, new.dispatched_at, new.note,
      new.driver_name)
     is distinct from
     (old.from_location_id, old.to_location_id, old.request_id, old.kind, old.dispatched_by, old.dispatched_at, old.note,
      old.driver_name)
  then
    raise exception 'only the status of a dispatch can change' using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'in_transit' and new.status in ('received', 'cancelled')) then
    raise exception 'a dispatch cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- التالف بالتوصيل جزء من الكمية المستلمة، فما بيتغير كمان
create or replace function private.freeze_receipt_quantities()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.receipt_id, new.dispatch_line_id, new.whole_cakes, new.loose_pieces, new.pieces_per_cake_snapshot, new.note,
      new.damaged_pieces, new.damage_waste_id)
     is distinct from
     (old.receipt_id, old.dispatch_line_id, old.whole_cakes, old.loose_pieces, old.pieces_per_cake_snapshot, old.note,
      old.damaged_pieces, old.damage_waste_id)
  then
    raise exception 'received quantities are read-only' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

-- ─── الإخراج مع اسم السائق ───────────────────────────────────────────

-- الحذف بيطلب موافقة بالسحابة، فالنسخة القديمة بتنحفظ باسم ثاني ومسكّرة على الكل
alter function public.create_dispatch(uuid, jsonb, uuid, text, boolean) rename to create_dispatch_before_driver;
revoke execute on function public.create_dispatch_before_driver(uuid, jsonb, uuid, text, boolean) from public, anon, authenticated;

-- نفس الدالة السابقة (20261023101600)، بس مع p_driver_name
create function public.create_dispatch(
  p_to_location_id uuid,
  p_lines jsonb,
  p_request_id uuid default null,
  p_note text default null,
  p_confirm_fefo_override boolean default false,
  p_driver_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  from_loc public.locations;
  to_loc public.locations;
  settings public.app_settings;
  dispatch_kind public.dispatch_kind;
  dispatch uuid;
  e jsonb;
  b jsonb;
  line_id uuid;
  line_qty int;
  product uuid;
  left_qty int;
  take int;
  batch_row record;
  allocated int;
  needs_confirmation boolean := false;
begin
  select * into from_loc from public.locations l where l.id = private.my_location_id() and l.is_active;
  select * into to_loc from public.locations l where l.id = p_to_location_id and l.is_active;
  select * into settings from public.app_settings;

  if from_loc.id is null or to_loc.id is null or from_loc.id = to_loc.id then
    raise exception 'pick a valid destination' using errcode = 'check_violation';
  end if;

  if from_loc.kind = 'factory' and private.has_role('dispatcher') and to_loc.kind = 'branch' then
    dispatch_kind := 'replenishment';
  elsif from_loc.kind = 'branch' and private.has_role('branch_staff') and to_loc.kind = 'branch' then
    if not settings.branch_transfers_enabled then
      raise exception 'transfers between branches are turned off' using errcode = 'check_violation';
    end if;
    dispatch_kind := 'transfer';
  elsif from_loc.kind = 'branch' and private.has_role('branch_staff') and to_loc.kind = 'returns_bin' then
    if not settings.returns_enabled then
      raise exception 'returns to the factory are turned off' using errcode = 'check_violation';
    end if;
    dispatch_kind := 'return';
  else
    raise exception 'you cannot send stock from here to there' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a dispatch needs at least one line' using errcode = 'check_violation';
  end if;

  if p_request_id is not null then
    update public.stock_requests r
    set status = 'dispatched'
    where r.id = p_request_id and r.status = 'sent'
      and r.supplying_location_id = from_loc.id and r.requesting_location_id = to_loc.id;
    if not found then
      raise exception 'the request is not waiting for this dispatch' using errcode = 'check_violation';
    end if;
  end if;

  -- إخراجين من نفس المصنع بنفس اللحظة ما بياخذوا نفس الدفعة مرتين
  perform pg_advisory_xact_lock(hashtext('mekasa:stock:' || from_loc.id::text));

  insert into public.dispatches (from_location_id, to_location_id, request_id, kind, dispatched_by, note, driver_name)
  values (from_loc.id, to_loc.id, p_request_id, dispatch_kind, caller, nullif(trim(p_note), ''),
          nullif(trim(p_driver_name), ''))
  returning id into dispatch;

  for e in select * from jsonb_array_elements(p_lines) loop
    product := (e ->> 'product_id')::uuid;
    insert into public.dispatch_lines (dispatch_id, product_id, request_line_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
    select dispatch, p.id,
           (select rl.id from public.stock_request_lines rl
            where rl.id = (e ->> 'request_line_id')::uuid and rl.request_id = p_request_id and rl.product_id = p.id),
           coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0), p.effective_pieces_per_cake
    from public.v_products p
    where p.id = product
    returning id, qty_pieces into line_id, line_qty;
    if line_id is null then
      raise exception 'unknown product' using errcode = 'check_violation';
    end if;

    if from_loc.kind <> 'factory' then
      insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, dispatch_line_id, created_by)
      values (now(), from_loc.id, product, -line_qty, 'dispatch_out', line_id, caller);
      continue;
    end if;

    -- ستوك كل دفعة بالمصنع هلا (جدول مؤقت للجلسة، بينفضى لكل سطر)
    create temp table if not exists pg_temp.batch_stock (batch_id uuid, production_date date, available int, taken int);
    truncate pg_temp.batch_stock;
    insert into pg_temp.batch_stock
    select m.batch_id, bt.production_date, sum(m.qty_pieces)::int, 0
    from public.stock_movements m
    join public.batches bt on bt.id = m.batch_id
    where m.location_id = from_loc.id and m.product_id = product
    group by m.batch_id, bt.production_date
    having sum(m.qty_pieces) > 0;

    if e ? 'batches' and jsonb_array_length(e -> 'batches') > 0 then
      for b in select * from jsonb_array_elements(e -> 'batches') loop
        update pg_temp.batch_stock s
        set taken = s.taken + (b ->> 'qty_pieces')::int
        where s.production_date = (b ->> 'production_date')::date;
        if not found then
          raise exception 'no stock in batch %', b ->> 'production_date' using errcode = 'check_violation';
        end if;
      end loop;
    else
      left_qty := line_qty;
      for batch_row in
        select * from pg_temp.batch_stock s where not private.batch_is_expired(s.production_date) order by s.production_date
      loop
        exit when left_qty <= 0;
        take := least(left_qty, batch_row.available);
        update pg_temp.batch_stock s set taken = take where s.batch_id = batch_row.batch_id;
        left_qty := left_qty - take;
      end loop;
    end if;

    select coalesce(sum(s.taken), 0) into allocated from pg_temp.batch_stock s;
    if allocated <> line_qty then
      raise exception 'factory stock is not enough for this line' using errcode = 'check_violation',
        hint = 'not_enough_stock';
    end if;
    if exists (select 1 from pg_temp.batch_stock s where s.taken > s.available or s.taken < 0) then
      raise exception 'a batch does not have that much' using errcode = 'check_violation', hint = 'not_enough_stock';
    end if;
    if exists (select 1 from pg_temp.batch_stock s where s.taken > 0 and private.batch_is_expired(s.production_date)) then
      raise exception 'an expired batch cannot be dispatched' using errcode = 'check_violation', hint = 'expired_batch';
    end if;

    -- تجاوز FEFO: دفعة أحدث انأخذ منها، وفي دفعة أقدم (مش منتهية) ضل فيها ستوك
    insert into public.dispatch_line_batches (dispatch_line_id, batch_id, qty_pieces, is_fefo_override, override_confirmed_by)
    select line_id, s.batch_id, s.taken, o.is_override,
           case when o.is_override then caller end
    from pg_temp.batch_stock s
    cross join lateral (
      select exists (
        select 1 from pg_temp.batch_stock older
        where older.production_date < s.production_date
          and older.taken < older.available
          and not private.batch_is_expired(older.production_date)
      ) as is_override
    ) o
    where s.taken > 0;

    if exists (select 1 from public.dispatch_line_batches d where d.dispatch_line_id = line_id and d.is_fefo_override) then
      needs_confirmation := true;
    end if;

    insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, dispatch_line_id, created_by)
    select now(), from_loc.id, product, s.batch_id, -s.taken, 'dispatch_out', line_id, caller
    from pg_temp.batch_stock s
    where s.taken > 0;
  end loop;

  if needs_confirmation and not p_confirm_fefo_override then
    raise exception 'an older batch is still in stock' using errcode = 'check_violation', hint = 'fefo_override';
  end if;

  return dispatch;
end;
$$;

-- ─── الاستلام مع التوالف ─────────────────────────────────────────────

-- p_lines: [{ "dispatch_line_id", "whole_cakes", "loose_pieces", "note",
--             "damaged_whole", "damaged_loose" }]  (التالف من اللي وصل)
create or replace function public.receive_dispatch(p_dispatch_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  d public.dispatches;
  to_loc public.locations;
  receipt uuid;
  item jsonb;
  line public.dispatch_lines;
  damaged int;
  waste uuid;
  receipt_line uuid;
  received int;
begin
  select * into d from public.dispatches where id = p_dispatch_id for update;
  select * into to_loc from public.locations where id = d.to_location_id;
  if d.id is null or d.status <> 'in_transit' then
    raise exception 'this dispatch is not waiting to be received' using errcode = 'check_violation';
  end if;

  if not (
    (to_loc.kind = 'branch' and to_loc.id = private.my_location_id() and private.has_role('branch_staff'))
    or (to_loc.kind = 'returns_bin' and to_loc.parent_location_id = private.my_location_id() and private.has_role('storekeeper'))
  ) then
    raise exception 'you cannot receive this dispatch' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array'
     or (select count(distinct (e ->> 'dispatch_line_id')::uuid) from jsonb_array_elements(p_lines) e)
        <> (select count(*) from public.dispatch_lines l where l.dispatch_id = d.id)
     or exists (
       select 1 from jsonb_array_elements(p_lines) e
       where not exists (
         select 1 from public.dispatch_lines l where l.id = (e ->> 'dispatch_line_id')::uuid and l.dispatch_id = d.id
       )
     ) then
    raise exception 'every dispatched line must be received once' using errcode = 'check_violation';
  end if;

  insert into public.receipts (dispatch_id, location_id, received_by)
  values (d.id, to_loc.id, caller)
  returning id into receipt;

  -- سطر سطر: التالف بالقطع (بعدد القطع بالكيكة تبع الإخراج)، وسجل التالف قبل سطر الاستلام
  -- مشان يرتبط فيه. القيد damage_within_received بيمنع تالف أكثر من اللي وصل.
  for item in select * from jsonb_array_elements(p_lines) loop
    select * into line from public.dispatch_lines l where l.id = (item ->> 'dispatch_line_id')::uuid;
    damaged := coalesce((item ->> 'damaged_whole')::int, 0) * coalesce(line.pieces_per_cake_snapshot, 0)
               + coalesce((item ->> 'damaged_loose')::int, 0);
    if damaged < 0 then
      raise exception 'damaged quantity cannot be negative' using errcode = 'check_violation';
    end if;
    waste := null;
    if damaged > 0 then
      insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, pieces_per_cake_snapshot,
                                        reason, reason_note, recorded_by)
      values (to_loc.id, line.product_id, 'piece', damaged, line.pieces_per_cake_snapshot, 'broken',
              left('وصل تالف بالتوصيل' || coalesce(' · السائق: ' || d.driver_name, ''), 200), caller)
      returning id into waste;
    end if;

    insert into public.receipt_lines (receipt_id, dispatch_line_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot,
                                      note, damaged_pieces, damage_waste_id)
    values (receipt, line.id, coalesce((item ->> 'whole_cakes')::int, 0), coalesce((item ->> 'loose_pieces')::int, 0),
            line.pieces_per_cake_snapshot, nullif(trim(item ->> 'note'), ''), damaged, waste)
    returning id, qty_pieces into receipt_line, received;

    if received > 0 then
      insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, receipt_line_id, created_by)
      values (now(), to_loc.id, line.product_id, received, 'receipt_in', receipt_line, caller);
    end if;
    if waste is not null then
      insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id, created_by)
      values (now(), to_loc.id, line.product_id, -damaged, 'waste', waste, caller);
    end if;
  end loop;

  update public.dispatches set status = 'received' where id = d.id;
  if d.request_id is not null then
    update public.stock_requests set status = 'received' where id = d.request_id and status = 'dispatched';
  end if;
  return receipt;
end;
$$;

revoke execute on function public.create_dispatch(uuid, jsonb, uuid, text, boolean, text) from public, anon;
grant execute on function public.create_dispatch(uuid, jsonb, uuid, text, boolean, text) to authenticated;
