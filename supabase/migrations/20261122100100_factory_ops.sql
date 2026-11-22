-- 22 نوفمبر 2026 (طلب صاحب المشروع). الخطة: docs/plan-2026-11-22.md
-- أ. مسؤول المصنع (factory_manager): كل شغل أمين المستودع والإخراج، وتقرير المصنع.
-- ب. تطليع بدون ستوك من المصنع: إعداد بيغيّره الأدمن أو المدير العام، والناقص من دفعة اليوم.
-- ج. الطلب على دفعتين: اللي ما طلع بيضل مفتوح ('partial') لحد آخر يوم الطلب، أو لحد "سكّر الطلب".
-- الدوال تحت نسخ من آخر نسخة (create_dispatch و dispatch_round من 20261120100400، receive_dispatch من 20261025100000).

-- ─── أ. مسؤول المصنع ─────────────────────────────────────────────────
create or replace function private.has_role(wanted public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.staff s on s.id = r.staff_id
    where r.staff_id = (select auth.uid()) and s.is_active
      and (r.role = wanted
           or (wanted = 'branch_staff' and r.role = 'branch_manager')
           or (wanted in ('storekeeper', 'dispatcher') and r.role = 'factory_manager'))
  )
$$;

-- ─── ب. تطليع بدون ستوك ──────────────────────────────────────────────
alter table public.app_settings add column factory_dispatch_without_stock boolean not null default false;

-- الأدمن أو المدير العام (المدير العام ما بيعدّل الإعدادات الثانية)
create function public.set_factory_dispatch_without_stock(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_admin() or private.has_role('general_manager')) then
    raise exception 'only the admin or the general manager can change this' using errcode = 'insufficient_privilege';
  end if;
  if p_on is null then
    raise exception 'pick on or off' using errcode = 'check_violation';
  end if;
  update public.app_settings set factory_dispatch_without_stock = p_on where id = true;
end;
$$;

revoke execute on function public.set_factory_dispatch_without_stock(boolean) from public, anon;
grant execute on function public.set_factory_dispatch_without_stock(boolean) to authenticated;

-- ─── ج. الطلب على دفعتين ─────────────────────────────────────────────
-- يوم الطلب بتوقيت عمّان (الباقي بيضل مفتوح لآخره)
create function private.request_day(ts timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (ts at time zone 'Asia/Amman')::date
$$;

revoke execute on function private.request_day(timestamptz) from public, anon;
grant execute on function private.request_day(timestamptz) to authenticated, service_role;

-- نفس الدالة (20261023100700) مع حالة 'partial'
create or replace function private.guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.requesting_location_id, new.supplying_location_id, new.requested_by, new.requested_at, new.note)
     is distinct from
     (old.requesting_location_id, old.supplying_location_id, old.requested_by, old.requested_at, old.note)
  then
    raise exception 'only the status and approval of a request can change' using errcode = 'restrict_violation';
  end if;

  if old.approved_at is not null
     and (new.approved_by, new.approved_at) is distinct from (old.approved_by, old.approved_at) then
    raise exception 'an approval cannot be changed' using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending_approval' and new.status in ('sent', 'cancelled'))
    or (old.status = 'sent' and new.status in ('dispatched', 'partial', 'cancelled'))
    or (old.status = 'partial' and new.status in ('dispatched', 'received'))
    or (old.status = 'dispatched' and new.status = 'received')
  ) then
    raise exception 'a request cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- حالة الطلب بعد الإخراج: في باقي (ومش مسكّر) = 'partial'، وإلا 'dispatched'، أو 'received' إذا كل اللي طلع انستلم.
create function private.settle_request(p_request_id uuid, p_close boolean)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_left boolean;
  next_status public.request_status;
begin
  select exists (
    select 1 from public.stock_request_lines rl
    where rl.request_id = p_request_id
      and rl.qty_pieces > coalesce((
        select sum(dl.qty_pieces) from public.dispatch_lines dl
        join public.dispatches d on d.id = dl.dispatch_id
        where dl.request_line_id = rl.id and d.status <> 'cancelled'
      ), 0)
  ) into has_left;

  if has_left and not p_close then
    next_status := 'partial';
  elsif not exists (
    select 1 from public.dispatches d where d.request_id = p_request_id and d.status = 'in_transit'
  ) and exists (select 1 from public.dispatches d where d.request_id = p_request_id and d.status = 'received') then
    next_status := 'received';
  else
    next_status := 'dispatched';
  end if;

  update public.stock_requests r set status = next_status
  where r.id = p_request_id and r.status is distinct from next_status;
  return next_status;
end;
$$;

revoke execute on function private.settle_request(uuid, boolean) from public, anon;
grant execute on function private.settle_request(uuid, boolean) to authenticated, service_role;

-- "سكّر الطلب": الباقي ما رح يطلع. للإخراج بالموقع اللي بيطلّع (أو أمين التغليف للمستودع) والأدمن.
create function public.close_request(p_request_id uuid)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.stock_requests;
  supplier public.locations;
begin
  select * into req from public.stock_requests r where r.id = p_request_id for update;
  select * into supplier from public.locations l where l.id = req.supplying_location_id;
  if req.id is null or not (
       private.is_admin()
    or (supplier.kind = 'factory' and private.has_role('dispatcher') and private.my_location_id() = supplier.id)
    or (supplier.kind = 'packaging' and private.has_role('packaging_keeper'))
  ) then
    raise exception 'you cannot close this request' using errcode = 'insufficient_privilege';
  end if;
  if req.status <> 'partial' then
    raise exception 'only a partly dispatched request can be closed' using errcode = 'check_violation';
  end if;
  return private.settle_request(req.id, true);
end;
$$;

revoke execute on function public.close_request(uuid) from public, anon;
grant execute on function public.close_request(uuid) to authenticated;

-- آخر اليوم: الطلبات اللي ضل منها باقي من أيام قبل بتتسكّر (pg_cron كل ليلة، وبعد كل إخراج)
create function private.close_stale_partial_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select q.id from public.stock_requests q
    where q.status = 'partial' and private.request_day(q.requested_at) < public.amman_today()
  loop
    perform private.settle_request(r.id, true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function private.close_stale_partial_requests() from public, anon, authenticated;
grant execute on function private.close_stale_partial_requests() to service_role;

select cron.schedule('mekasa-close-partial-requests', '7 22 * * *', $$ select private.close_stale_partial_requests() $$);

-- ─── الدوال ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_dispatch(p_to_location_id uuid, p_lines jsonb, p_request_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_confirm_fefo_override boolean DEFAULT false, p_driver_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  short_batch uuid;
begin
  -- التغليف بيطلع من مستودع التغليف، مهما كان موقع أمين المستودع
  select * into from_loc from public.locations l
  where l.id = case
      when private.has_role('packaging_keeper')
       and (select p.kind from public.products p where p.id = (p_lines -> 0 ->> 'product_id')::uuid) = 'packaging'
      then private.packaging_store() else private.my_location_id() end
    and l.is_active;
  select * into to_loc from public.locations l where l.id = p_to_location_id and l.is_active;
  select * into settings from public.app_settings;

  if from_loc.id is null or to_loc.id is null or from_loc.id = to_loc.id then
    raise exception 'pick a valid destination' using errcode = 'check_violation';
  end if;

  if from_loc.kind = 'factory' and private.has_role('dispatcher') and to_loc.kind = 'branch' then
    dispatch_kind := 'replenishment';
  elsif from_loc.kind = 'packaging' and private.has_role('packaging_keeper') and to_loc.kind = 'branch' then
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
    set status = r.status
    where r.id = p_request_id
      and (r.status = 'sent' or (r.status = 'partial' and private.request_day(r.requested_at) = public.amman_today()))
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

    -- الصوصات بتطلع من المصنع بدون دفعات (متل الفروع)
    if from_loc.kind <> 'factory' or (select p.kind from public.products p where p.id = product) = 'sauce' then
      insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, dispatch_line_id, created_by)
      values (now(), from_loc.id, product, -line_qty, 'dispatch_out', line_id, caller);
      continue;
    end if;

    -- ستوك كل دفعة بالمصنع هلا (جدول مؤقت للجلسة، بينفضى لكل سطر)
    create temp table if not exists pg_temp.batch_stock_f (batch_id uuid, production_date date, is_frozen boolean, expires_on date, available int, taken int);
    truncate pg_temp.batch_stock_f;
    insert into pg_temp.batch_stock_f
    select m.batch_id, bt.production_date, bt.is_frozen, private.batch_expires_on(m.batch_id), sum(m.qty_pieces)::int, 0
    from public.stock_movements m
    join public.batches bt on bt.id = m.batch_id
    where m.location_id = from_loc.id and m.product_id = product
    group by m.batch_id, bt.production_date, bt.is_frozen
    having sum(m.qty_pieces) > 0;

    if e ? 'batches' and jsonb_array_length(e -> 'batches') > 0 then
      for b in select * from jsonb_array_elements(e -> 'batches') loop
        update pg_temp.batch_stock_f s
        set taken = s.taken + (b ->> 'qty_pieces')::int
        where s.production_date = (b ->> 'production_date')::date
          and s.is_frozen = coalesce((b ->> 'frozen')::boolean, false);
        if not found then
          raise exception 'no stock in batch %', b ->> 'production_date' using errcode = 'check_violation';
        end if;
      end loop;
    else
      left_qty := line_qty;
      for batch_row in
        select * from pg_temp.batch_stock_f s where s.expires_on > public.amman_today() order by s.expires_on, s.production_date
      loop
        exit when left_qty <= 0;
        take := least(left_qty, batch_row.available);
        update pg_temp.batch_stock_f s set taken = take where s.batch_id = batch_row.batch_id;
        left_qty := left_qty - take;
      end loop;
    end if;

    select coalesce(sum(s.taken), 0) into allocated from pg_temp.batch_stock_f s;
    -- تطليع بدون ستوك (إعداد): الباقي من دفعة اليوم الطازة، وستوكها بيصير سالب لحد الإنتاج أو الجرد
    if allocated < line_qty and settings.factory_dispatch_without_stock then
      short_batch := private.upsert_batch(product, public.amman_today());
      if exists (select 1 from pg_temp.batch_stock_f s where s.batch_id = short_batch) then
        update pg_temp.batch_stock_f s
        set taken = s.taken + (line_qty - allocated), available = greatest(s.available, s.taken + (line_qty - allocated))
        where s.batch_id = short_batch;
      else
        insert into pg_temp.batch_stock_f
        values (short_batch, public.amman_today(), false, private.batch_expires_on(short_batch), line_qty - allocated, line_qty - allocated);
      end if;
      allocated := line_qty;
    end if;
    if allocated <> line_qty then
      raise exception 'factory stock is not enough for this line' using errcode = 'check_violation',
        hint = 'not_enough_stock';
    end if;
    if exists (select 1 from pg_temp.batch_stock_f s where s.taken > s.available or s.taken < 0) then
      raise exception 'a batch does not have that much' using errcode = 'check_violation', hint = 'not_enough_stock';
    end if;
    if exists (select 1 from pg_temp.batch_stock_f s where s.taken > 0 and s.expires_on <= public.amman_today()) then
      raise exception 'an expired batch cannot be dispatched' using errcode = 'check_violation', hint = 'expired_batch';
    end if;

    -- تجاوز FEFO: دفعة أحدث انأخذ منها، وفي دفعة أقدم (مش منتهية) ضل فيها ستوك
    insert into public.dispatch_line_batches (dispatch_line_id, batch_id, qty_pieces, is_fefo_override, override_confirmed_by)
    select line_id, s.batch_id, s.taken, o.is_override,
           case when o.is_override then caller end
    from pg_temp.batch_stock_f s
    cross join lateral (
      select exists (
        select 1 from pg_temp.batch_stock_f older
        where older.expires_on < s.expires_on
          and older.taken < older.available
          and older.expires_on > public.amman_today()
      ) as is_override
    ) o
    where s.taken > 0;

    if exists (select 1 from public.dispatch_line_batches d where d.dispatch_line_id = line_id and d.is_fefo_override) then
      needs_confirmation := true;
    end if;

    insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, dispatch_line_id, created_by)
    select now(), from_loc.id, product, s.batch_id, -s.taken, 'dispatch_out', line_id, caller
    from pg_temp.batch_stock_f s
    where s.taken > 0;
  end loop;

  if p_request_id is not null then
    perform private.settle_request(p_request_id, false);
  end if;

  if needs_confirmation and not p_confirm_fefo_override then
    raise exception 'an older batch is still in stock' using errcode = 'check_violation', hint = 'fefo_override';
  end if;

  return dispatch;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.dispatch_round(p_round jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  factory public.locations;
  entry jsonb;
  e jsonb;
  req public.stock_requests;
  dispatch uuid;
  created uuid[] := '{}';
  product_row record;
  batch_row record;
  total int;
  remaining_total int;
  take int;
  given int;
  leftover int;
  line_row record;
  unit int;
  shortage int;
  short_batch uuid;
  allow_short boolean := coalesce((select s.factory_dispatch_without_stock from public.app_settings s), false);
begin
  select * into factory from public.locations l where l.id = private.my_location_id() and l.is_active;
  if factory.kind is distinct from 'factory' or not private.has_role('dispatcher') then
    raise exception 'only the factory dispatcher can run the daily round' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_round) is distinct from 'array' or jsonb_array_length(p_round) = 0 then
    raise exception 'the round needs at least one request' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:stock:' || factory.id::text));

  create temp table if not exists pg_temp.round_lines (line_id uuid, product_id uuid, qty int, remaining int, ord int);
  truncate pg_temp.round_lines;

  for entry in select * from jsonb_array_elements(p_round) loop
    update public.stock_requests r
    set status = r.status
    where r.id = (entry ->> 'request_id')::uuid and r.supplying_location_id = factory.id
      and (r.status = 'sent' or (r.status = 'partial' and private.request_day(r.requested_at) = public.amman_today()))
    returning * into req;
    if req.id is null then
      raise exception 'a request is not waiting for the factory' using errcode = 'check_violation';
    end if;
    if jsonb_typeof(entry -> 'lines') is distinct from 'array' or jsonb_array_length(entry -> 'lines') = 0 then
      raise exception 'every dispatch needs at least one line' using errcode = 'check_violation';
    end if;

    insert into public.dispatches (from_location_id, to_location_id, request_id, kind, dispatched_by, driver_name)
    values (factory.id, req.requesting_location_id, req.id, 'replenishment', caller,
            nullif(trim(entry ->> 'driver_name'), ''))
    returning id into dispatch;
    created := created || dispatch;

    for e in select * from jsonb_array_elements(entry -> 'lines') loop
      insert into public.dispatch_lines (dispatch_id, product_id, request_line_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
      select dispatch, p.id,
             (select rl.id from public.stock_request_lines rl
              where rl.id = (e ->> 'request_line_id')::uuid and rl.request_id = req.id and rl.product_id = p.id),
             coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0), p.effective_pieces_per_cake
      from public.v_products p
      where p.id = (e ->> 'product_id')::uuid
      returning id, product_id, qty_pieces into line_row;
      if line_row.id is null then
        raise exception 'unknown product' using errcode = 'check_violation';
      end if;
      insert into pg_temp.round_lines
      values (line_row.id, line_row.product_id, line_row.qty_pieces, line_row.qty_pieces,
              (select count(*) from pg_temp.round_lines));
    end loop;
  end loop;

  -- الصوصات: بدون دفعات، كل سطر حركة وحدة
  insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, dispatch_line_id, created_by)
  select now(), factory.id, rl.product_id, -rl.qty, 'dispatch_out', rl.line_id, caller
  from pg_temp.round_lines rl
  join public.products p on p.id = rl.product_id and p.kind = 'sauce'
  where rl.qty > 0;

  for product_row in
    select distinct rl.product_id from pg_temp.round_lines rl
    join public.products p on p.id = rl.product_id and p.kind <> 'sauce'
  loop
    select sum(rl.qty) into total from pg_temp.round_lines rl where rl.product_id = product_row.product_id;

    -- وحدة القسمة: الكيكة إذا كل الأسطر كيكات كاملة والدفعات فيها كيكات كاملة بتكفي، وإلا القطعة
    unit := coalesce((select p.effective_pieces_per_cake from public.v_products p where p.id = product_row.product_id), 1);
    if unit > 1 and (
      exists (select 1 from pg_temp.round_lines rl where rl.product_id = product_row.product_id and rl.qty % unit <> 0)
      or coalesce((
        select sum(floor(st.available::numeric / unit)) * unit
        from (
          select sum(m.qty_pieces) as available
          from public.stock_movements m
          join public.batches bt on bt.id = m.batch_id
          where m.location_id = factory.id and m.product_id = product_row.product_id
            and private.batch_expires_on(bt.id) > public.amman_today()
          group by m.batch_id
          having sum(m.qty_pieces) > 0
        ) st
      ), 0) < total
    ) then
      unit := 1;
    end if;
    -- كل الحساب تحت بالوحدة
    remaining_total := total / unit;

    -- تطليع بدون ستوك (إعداد): الناقص بينحسب على دفعة اليوم الطازة (بتنقسم مع الباقي بالعدل)
    shortage := 0;
    short_batch := null;
    if allow_short then
      shortage := greatest(0, total - coalesce((
        select sum(st.available) from (
          select sum(m.qty_pieces) as available
          from public.stock_movements m
          join public.batches bt on bt.id = m.batch_id
          where m.location_id = factory.id and m.product_id = product_row.product_id
            and private.batch_expires_on(bt.id) > public.amman_today()
          group by m.batch_id
          having sum(m.qty_pieces) > 0
        ) st
      ), 0))::int;
      if shortage > 0 then
        short_batch := private.upsert_batch(product_row.product_id, public.amman_today());
      end if;
    end if;

    for batch_row in
      select x.batch_id, x.production_date, sum(x.available)::int as available
      from (
        select m.batch_id, bt.production_date, sum(m.qty_pieces)::int as available
        from public.stock_movements m
        join public.batches bt on bt.id = m.batch_id
        where m.location_id = factory.id and m.product_id = product_row.product_id
          and private.batch_expires_on(bt.id) > public.amman_today()
        group by m.batch_id, bt.production_date
        having sum(m.qty_pieces) > 0
        union all
        select short_batch, public.amman_today(), shortage where shortage > 0
      ) x
      group by x.batch_id, x.production_date
      order by private.batch_expires_on(x.batch_id), x.production_date
    loop
      exit when remaining_total <= 0;
      take := least(batch_row.available / unit, remaining_total);
      continue when take <= 0;

      -- الحصة حسب اللي ضايل لكل سطر، والباقي واحد واحد للكسر الأكبر
      create temp table if not exists pg_temp.round_share (line_id uuid, share int);
      truncate pg_temp.round_share;
      insert into pg_temp.round_share
      select rl.line_id, (take::bigint * (rl.remaining / unit) / remaining_total)::int
      from pg_temp.round_lines rl
      where rl.product_id = product_row.product_id and rl.remaining > 0;
      select take - coalesce(sum(s.share), 0) into leftover from pg_temp.round_share s;
      update pg_temp.round_share s set share = s.share + 1
      where s.line_id in (
        select rl.line_id from pg_temp.round_lines rl
        join pg_temp.round_share s2 on s2.line_id = rl.line_id
        where rl.remaining / unit - s2.share > 0
        order by (take::bigint * (rl.remaining / unit)) % remaining_total desc, rl.ord
        limit leftover
      );

      insert into public.dispatch_line_batches (dispatch_line_id, batch_id, qty_pieces, is_fefo_override)
      select s.line_id, batch_row.batch_id, s.share * unit, false from pg_temp.round_share s where s.share > 0;
      insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, dispatch_line_id, created_by)
      select now(), factory.id, product_row.product_id, batch_row.batch_id, -s.share * unit, 'dispatch_out', s.line_id, caller
      from pg_temp.round_share s where s.share > 0;
      update pg_temp.round_lines rl set remaining = rl.remaining - s.share * unit
      from pg_temp.round_share s where s.line_id = rl.line_id;

      select coalesce(sum(s.share), 0) into given from pg_temp.round_share s;
      remaining_total := remaining_total - given;
    end loop;

    if remaining_total > 0 then
      raise exception 'factory stock is not enough for this round' using errcode = 'check_violation',
        hint = 'not_enough_stock';
    end if;
  end loop;

  for entry in select * from jsonb_array_elements(p_round) loop
    perform private.settle_request((entry ->> 'request_id')::uuid, false);
  end loop;

  return created;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.receive_dispatch(p_dispatch_id uuid, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- الطلب بينستلم لما ما يضل منه شي بالطريق (ممكن يطلع على دفعتين)
    update public.stock_requests r set status = 'received'
    where r.id = d.request_id and r.status = 'dispatched'
      and not exists (select 1 from public.dispatches x where x.request_id = d.request_id and x.status = 'in_transit');
  end if;
  return receipt;
end;
$function$

;
