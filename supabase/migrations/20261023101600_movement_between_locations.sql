-- المرحلة 2: الطلب، الإخراج (FEFO بالمصنع)، الاستلام، الإنتاج، والمرتجعات.
-- كل عملية دالة بتفحص الدور والموقع، وبتكتب المستند وحركاته بنفس الـ transaction.

-- ─── مساعدات ─────────────────────────────────────────────────────────

-- المصنع اللي بيمون الفروع (أول مصنع فعّال)
create function private.main_factory()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.locations l where l.kind = 'factory' and l.is_active order by l.sort_order limit 1
$$;

-- دفعة منتهية بالمصنع: عمرها وصل مدة الحياة
create function private.batch_is_expired(production_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.amman_today() - production_date >= (select s.factory_shelf_life_days from public.app_settings s)
$$;

create function private.upsert_batch(product uuid, production_date date)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.batches (product_id, production_date)
  values (product, production_date)
  on conflict (product_id, production_date) do update set production_date = excluded.production_date
  returning id
$$;

-- ─── الطلب ───────────────────────────────────────────────────────────

-- p_lines: [{ "product_id", "whole_cakes", "loose_pieces", "suggested_pieces" }]
create function public.create_request(p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  branch uuid := private.my_location_id();
  factory uuid := private.main_factory();
  needs_approval boolean := (select s.order_approval_required from public.app_settings s);
  request uuid;
begin
  if not private.has_role('branch_staff')
     or not exists (select 1 from public.locations l where l.id = branch and l.kind = 'branch' and l.is_active) then
    raise exception 'only branch staff can request stock' using errcode = 'insufficient_privilege';
  end if;
  if factory is null then
    raise exception 'there is no active factory' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a request needs at least one line' using errcode = 'check_violation';
  end if;

  insert into public.stock_requests (requesting_location_id, supplying_location_id, status, requested_by, note)
  values (branch, factory, case when needs_approval then 'pending_approval' else 'sent' end::public.request_status,
          caller, nullif(trim(p_note), ''))
  returning id into request;

  insert into public.stock_request_lines (request_id, product_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot, suggested_pieces)
  select request, p.id, coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0),
         p.effective_pieces_per_cake, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(p_lines) e
  join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.is_active;

  if (select count(*) from public.stock_request_lines l where l.request_id = request) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs an active product' using errcode = 'check_violation';
  end if;
  return request;
end;
$$;

-- موافقة الأدمن (لما الإعداد مفعّل)، أو رفض
create function public.admin_decide_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an admin can approve requests' using errcode = 'insufficient_privilege';
  end if;
  update public.stock_requests
  set status = case when p_approve then 'sent' else 'cancelled' end::public.request_status,
      approved_by = case when p_approve then (select auth.uid()) end,
      approved_at = case when p_approve then now() end
  where id = p_request_id and status = 'pending_approval';
  if not found then
    raise exception 'the request is not waiting for approval' using errcode = 'check_violation';
  end if;
end;
$$;

-- الفرع بيلغي طلبه قبل ما يطلع
create function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stock_requests r
  set status = 'cancelled'
  where r.id = p_request_id
    and r.status in ('pending_approval', 'sent')
    and (private.is_admin() or (private.has_role('branch_staff') and r.requesting_location_id = private.my_location_id()));
  if not found then
    raise exception 'the request cannot be cancelled' using errcode = 'check_violation';
  end if;
end;
$$;

-- ─── الإخراج ─────────────────────────────────────────────────────────

-- p_lines: [{ "product_id", "whole_cakes", "loose_pieces", "request_line_id",
--             "batches": [{ "production_date", "qty_pieces" }] }]   (الدفعات بالمصنع بس، واختيارية)
-- بدون دفعات: النظام بيوزع من الأقدم (FEFO، بدون المنتهية). دفعة أحدث وفي أقدم إلها ستوك
-- = تجاوز، لازم p_confirm_fefo_override، وبينسجل مين أكّده.
create function public.create_dispatch(
  p_to_location_id uuid,
  p_lines jsonb,
  p_request_id uuid default null,
  p_note text default null,
  p_confirm_fefo_override boolean default false
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

  insert into public.dispatches (from_location_id, to_location_id, request_id, kind, dispatched_by, note)
  values (from_loc.id, to_loc.id, p_request_id, dispatch_kind, caller, nullif(trim(p_note), ''))
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

-- ─── الاستلام ────────────────────────────────────────────────────────

-- p_lines: [{ "dispatch_line_id", "whole_cakes", "loose_pieces", "note" }] لكل أسطر الإخراج
create function public.receive_dispatch(p_dispatch_id uuid, p_lines jsonb)
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

  insert into public.receipt_lines (receipt_id, dispatch_line_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot, note)
  select receipt, l.id, coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0),
         l.pieces_per_cake_snapshot, nullif(trim(e ->> 'note'), '')
  from jsonb_array_elements(p_lines) e
  join public.dispatch_lines l on l.id = (e ->> 'dispatch_line_id')::uuid;

  insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, receipt_line_id, created_by)
  select now(), to_loc.id, dl.product_id, rl.qty_pieces, 'receipt_in', rl.id, caller
  from public.receipt_lines rl
  join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
  where rl.receipt_id = receipt and rl.qty_pieces > 0;

  update public.dispatches set status = 'received' where id = d.id;
  if d.request_id is not null then
    update public.stock_requests set status = 'received' where id = d.request_id and status = 'dispatched';
  end if;
  return receipt;
end;
$$;

-- قرار الأدمن على فرق الاستلام
create function public.admin_resolve_receipt_line(
  p_line_id uuid,
  p_resolution public.discrepancy_resolution,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an admin can resolve a receipt difference' using errcode = 'insufficient_privilege';
  end if;
  update public.receipt_lines
  set resolution = p_resolution, resolved_by = (select auth.uid()), resolved_at = now(),
      resolution_note = nullif(trim(p_note), '')
  where id = p_line_id;
  if not found then
    raise exception 'receipt line not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ─── الإنتاج ─────────────────────────────────────────────────────────

-- p_lines: [{ "product_id", "whole_cakes", "loose_pieces" }]. كله لدفعة اليوم.
create function public.record_production(p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  factory uuid := private.my_location_id();
  entry uuid;
begin
  if not private.has_role('storekeeper')
     or not exists (select 1 from public.locations l where l.id = factory and l.kind = 'factory') then
    raise exception 'only the storekeeper records production' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'production needs at least one line' using errcode = 'check_violation';
  end if;

  insert into public.production_entries (location_id, recorded_by, note)
  values (factory, caller, nullif(trim(p_note), ''))
  returning id into entry;

  insert into public.production_lines (entry_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
  select entry, p.id, private.upsert_batch(p.id, public.amman_today()),
         coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0), p.effective_pieces_per_cake
  from jsonb_array_elements(p_lines) e
  join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.is_active;

  if (select count(*) from public.production_lines l where l.entry_id = entry) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs an active product' using errcode = 'check_violation';
  end if;

  insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, production_line_id, created_by)
  select now(), factory, l.product_id, l.batch_id, l.qty_pieces, 'production', l.id, caller
  from public.production_lines l
  where l.entry_id = entry;

  return entry;
end;
$$;

-- ─── المرتجعات ───────────────────────────────────────────────────────

-- أمين المستودع بيقرر على سطر وصل لخانة المرتجعات: جزء للستوك (على دفعة) وجزء تالف.
create function public.decide_return(
  p_receipt_line_id uuid,
  p_to_stock_pieces int,
  p_to_waste_pieces int,
  p_to_stock_production_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  bin public.locations;
  line record;
  decided int;
  batch uuid;
  waste uuid;
  decision uuid;
begin
  select rl.id, rl.qty_pieces, dl.product_id, rc.location_id, dl.pieces_per_cake_snapshot
    into line
  from public.receipt_lines rl
  join public.receipts rc on rc.id = rl.receipt_id
  join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
  where rl.id = p_receipt_line_id
  for update of rl;

  select * into bin from public.locations where id = line.location_id;
  if line.id is null or bin.kind <> 'returns_bin'
     or bin.parent_location_id is distinct from private.my_location_id() or not private.has_role('storekeeper') then
    raise exception 'you cannot decide on this return' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(d.to_stock_pieces + d.to_waste_pieces), 0) into decided
  from public.return_dispositions d where d.receipt_line_id = line.id;
  if coalesce(p_to_stock_pieces, 0) < 0 or coalesce(p_to_waste_pieces, 0) < 0
     or coalesce(p_to_stock_pieces, 0) + coalesce(p_to_waste_pieces, 0) > line.qty_pieces - decided then
    raise exception 'more than what is left of this return' using errcode = 'check_violation';
  end if;

  if p_to_stock_pieces > 0 then
    if p_to_stock_production_date is null or p_to_stock_production_date > public.amman_today() then
      raise exception 'returning to stock needs the batch date' using errcode = 'check_violation';
    end if;
    batch := private.upsert_batch(line.product_id, p_to_stock_production_date);
  end if;

  if p_to_waste_pieces > 0 then
    insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, pieces_per_cake_snapshot, reason, reason_note, recorded_by)
    values (bin.id, line.product_id, 'piece', p_to_waste_pieces, line.pieces_per_cake_snapshot, 'other', 'مرتجع من فرع', caller)
    returning id into waste;
    insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id, created_by)
    values (now(), bin.id, line.product_id, -p_to_waste_pieces, 'waste', waste, caller);
  end if;

  insert into public.return_dispositions (receipt_line_id, to_stock_pieces, to_stock_batch_id, to_waste_pieces, waste_record_id, decided_by)
  values (line.id, coalesce(p_to_stock_pieces, 0), batch, coalesce(p_to_waste_pieces, 0), waste, caller)
  returning id into decision;

  if p_to_stock_pieces > 0 then
    insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, return_disposition_id, created_by)
    values
      (now(), bin.id, line.product_id, null, -p_to_stock_pieces, 'return_to_stock', decision, caller),
      (now(), bin.parent_location_id, line.product_id, batch, p_to_stock_pieces, 'return_to_stock', decision, caller);
  end if;
  return decision;
end;
$$;

-- ─── عمر الكيك بالفروع (تقدير FIFO من الاستلامات) ───────────────────

-- الموجود بالفرع منفترض إنه من آخر الاستلامات. أقدم استلام لسا "مغطى" بالموجود = عمر أقدم كيك.
create view public.v_branch_stock_age with (security_invoker = true) as
with stock as (
  select m.location_id, m.product_id, sum(m.qty_pieces)::int as qty
  from public.stock_movements m
  join public.locations l on l.id = m.location_id and l.kind = 'branch'
  group by m.location_id, m.product_id
  having sum(m.qty_pieces) > 0
),
receipts as (
  select m.location_id, m.product_id, m.occurred_at, m.qty_pieces,
         sum(m.qty_pieces) over (partition by m.location_id, m.product_id order by m.occurred_at desc, m.id desc) as newer_or_same
  from public.stock_movements m
  where m.movement_type = 'receipt_in'
),
oldest as (
  select s.location_id, s.product_id, s.qty, min(r.occurred_at) as oldest_receipt_at
  from stock s
  join receipts r on r.location_id = s.location_id and r.product_id = s.product_id
  where r.newer_or_same - r.qty_pieces < s.qty
  group by s.location_id, s.product_id, s.qty
)
select
  o.location_id,
  o.product_id,
  o.qty as qty_pieces,
  o.oldest_receipt_at,
  public.amman_today() - (o.oldest_receipt_at at time zone 'Asia/Amman')::date as age_days,
  public.amman_today() - (o.oldest_receipt_at at time zone 'Asia/Amman')::date >= s.branch_shelf_life_days - 1 as near_expiry,
  public.amman_today() - (o.oldest_receipt_at at time zone 'Asia/Amman')::date >= s.branch_shelf_life_days as is_expired
from oldest o
cross join public.app_settings s;

-- ─── الصلاحيات ───────────────────────────────────────────────────────

revoke all on public.v_branch_stock_age from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_branch_stock_age from authenticated;

revoke execute on function private.main_factory(), private.batch_is_expired(date), private.upsert_batch(uuid, date)
from public, anon;
grant execute on function private.main_factory(), private.batch_is_expired(date), private.upsert_batch(uuid, date)
to authenticated, service_role;

revoke execute on function
  public.create_request(jsonb, text),
  public.admin_decide_request(uuid, boolean),
  public.cancel_request(uuid),
  public.create_dispatch(uuid, jsonb, uuid, text, boolean),
  public.receive_dispatch(uuid, jsonb),
  public.admin_resolve_receipt_line(uuid, public.discrepancy_resolution, text),
  public.record_production(jsonb, text),
  public.decide_return(uuid, int, int, date)
from public, anon;
grant execute on function
  public.create_request(jsonb, text),
  public.admin_decide_request(uuid, boolean),
  public.cancel_request(uuid),
  public.create_dispatch(uuid, jsonb, uuid, text, boolean),
  public.receive_dispatch(uuid, jsonb),
  public.admin_resolve_receipt_line(uuid, public.discrepancy_resolution, text),
  public.record_production(jsonb, text),
  public.decide_return(uuid, int, int, date)
to authenticated;
