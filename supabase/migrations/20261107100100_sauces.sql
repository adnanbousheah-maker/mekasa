-- ملاحظات 7 نوفمبر 2026: الصوصات.
-- الفرع بيطلب الصوصات من المصنع بنفس طلب الكيك، والمصنع بيطلّعها مع الطلبية بدون دفعات ولا أرقام أيام.
-- ما بتنعدّ بالجرد اليومي (جرد الكيك الكامل بيصفّر الكيك بس)، وبتنعدّ بجرد الصوصات (آخر الشهر) بـ submit_sauce_count.

-- ─── نوع الجرد ───────────────────────────────────────────────────────
-- stock = جرد الموقع العادي (كيك أو تغليف)، sauce = جرد الصوصات
alter table public.stock_counts add column scope text not null default 'stock' check (scope in ('stock', 'sauce'));

-- ─── وين بينفع كل نوع ────────────────────────────────────────────────

-- المستودع: تغليف. الفروع والمصنع: كيك وصوصات.
create function private.kind_allowed_at(loc uuid, item_kind public.product_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when l.kind = 'packaging' then item_kind = 'packaging'
    else item_kind in ('cake', 'sauce')
  end
  from public.locations l where l.id = loc
$$;

revoke execute on function private.kind_allowed_at(uuid, public.product_kind) from public, anon;
grant execute on function private.kind_allowed_at(uuid, public.product_kind) to authenticated, service_role;

-- نفس الدالة (20261025100510)، بس الصوصات مسموحة مع الكيك، والإنتاج كيك بس
create or replace function private.check_product_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loc uuid;
  item public.product_kind := (select p.kind from public.products p where p.id = new.product_id);
begin
  if tg_table_name in ('stock_request_lines', 'stock_request_missing') then
    select r.supplying_location_id into loc from public.stock_requests r where r.id = new.request_id;
  elsif tg_table_name = 'dispatch_lines' then
    select d.from_location_id into loc from public.dispatches d where d.id = new.dispatch_id;
  elsif tg_table_name = 'stock_count_lines' then
    select c.location_id into loc from public.stock_counts c where c.id = new.count_id;
  elsif tg_table_name = 'production_lines' then
    select e.location_id into loc from public.production_entries e where e.id = new.entry_id;
    if item is distinct from 'cake' then
      raise exception 'only cakes are produced here' using errcode = 'check_violation', hint = 'wrong_product_kind';
    end if;
  end if;
  if not coalesce(private.kind_allowed_at(loc, item), false) then
    raise exception 'this item does not belong here (cakes and packaging are kept apart)'
      using errcode = 'check_violation', hint = 'wrong_product_kind';
  end if;
  return new;
end;
$$;

-- ─── الصوصات بدون دفعات، حتى بالمصنع ──────────────────────────────────

create function private.batch_rule(loc uuid, product uuid, batch uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select p.kind from public.products p where p.id = product) = 'sauce' then
    if batch is not null then
      raise exception 'sauces have no batches' using errcode = 'check_violation';
    end if;
  else
    perform private.batch_required_here(loc, batch);
  end if;
end;
$$;

revoke execute on function private.batch_rule(uuid, uuid, uuid) from public, anon;
grant execute on function private.batch_rule(uuid, uuid, uuid) to authenticated, service_role;

create or replace function private.check_batch_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.batch_rule(new.location_id, new.product_id, new.batch_id);
  return new;
end;
$$;

create or replace function private.check_count_line_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.batch_rule(
    (select c.location_id from public.stock_counts c where c.id = new.count_id),
    new.product_id,
    new.batch_id
  );
  return new;
end;
$$;

-- ─── الإخراج ─────────────────────────────────────────────────────────

-- نفس الدالة (20261025100600)، بس الصوصات من المصنع بدون دفعات
CREATE OR REPLACE FUNCTION public.create_dispatch(p_to_location_id uuid, p_lines jsonb, p_request_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_confirm_fefo_override boolean DEFAULT false, p_driver_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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

    -- الصوصات بتطلع من المصنع بدون دفعات (متل الفروع)
    if from_loc.kind <> 'factory' or (select p.kind from public.products p where p.id = product) = 'sauce' then
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
        select * from pg_temp.batch_stock s where not private.batch_is_expired(product, s.production_date) order by s.production_date
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
    if exists (select 1 from pg_temp.batch_stock s where s.taken > 0 and private.batch_is_expired(product, s.production_date)) then
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
          and not private.batch_is_expired(product, older.production_date)
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

-- نفس الدالة (20261025100600)، بس الصوصات برا توزيع الدفعات
CREATE OR REPLACE FUNCTION public.dispatch_round(p_round jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    set status = 'dispatched'
    where r.id = (entry ->> 'request_id')::uuid and r.status = 'sent' and r.supplying_location_id = factory.id
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
            and not private.batch_is_expired(product_row.product_id, bt.production_date)
          group by m.batch_id
          having sum(m.qty_pieces) > 0
        ) st
      ), 0) < total
    ) then
      unit := 1;
    end if;
    -- كل الحساب تحت بالوحدة
    remaining_total := total / unit;

    for batch_row in
      select m.batch_id, bt.production_date, sum(m.qty_pieces)::int as available
      from public.stock_movements m
      join public.batches bt on bt.id = m.batch_id
      where m.location_id = factory.id and m.product_id = product_row.product_id
        and not private.batch_is_expired(product_row.product_id, bt.production_date)
      group by m.batch_id, bt.production_date
      having sum(m.qty_pieces) > 0
      order by bt.production_date
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

  return created;
end;
$$;

-- ─── جرد الصوصات ─────────────────────────────────────────────────────

-- جرد كامل للصوصات بموقع الموظف (الفرع أو المصنع): اللي ما انعدّ وإله ستوك بينحسب صفر.
-- الكيك ما بيتأثر، وجرد الكيك ما بيأثر عالصوصات.
create function public.submit_sauce_count(p_lines jsonb, p_started_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  loc uuid := private.my_location_id();
  started timestamptz := coalesce(p_started_at, now());
  opening boolean;
  new_count uuid;
  line record;
  delta int;
begin
  if loc is null or not private.can_count_at(loc)
     or (select l.kind from public.locations l where l.id = loc) not in ('branch', 'factory') then
    raise exception 'you cannot count sauces here' using errcode = 'insufficient_privilege';
  end if;
  if started > now() + interval '1 minute' or started < now() - interval '12 hours' then
    raise exception 'the count start time is out of range' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'lines must be an array' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || loc::text));

  -- أول جرد صوصات بالموقع = رصيد افتتاحي
  opening := not exists (
    select 1 from public.stock_count_lines cl
    join public.stock_counts c on c.id = cl.count_id
    where c.location_id = loc and c.status = 'confirmed' and c.scope = 'sauce'
  );

  insert into public.stock_counts (location_id, scope, method, is_opening, started_at, counted_by)
  values (loc, 'sauce', 'manual', opening, started, caller)
  returning id into new_count;

  insert into public.stock_count_lines (count_id, product_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
  select new_count, p.id, 0, greatest(0, coalesce((e ->> 'loose_pieces')::int, 0)), p.effective_pieces_per_cake
  from jsonb_array_elements(p_lines) e
  join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.kind = 'sauce';

  if (select count(*) from public.stock_count_lines l where l.count_id = new_count) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs a known sauce' using errcode = 'check_violation';
  end if;

  -- الصوصات اللي إلها ستوك وما انعدّت: صفر
  insert into public.stock_count_lines (count_id, product_id, pieces_per_cake_snapshot)
  select new_count, st.product_id, p.effective_pieces_per_cake
  from (
    select m.product_id from public.stock_movements m
    where m.location_id = loc and m.occurred_at <= started
    group by m.product_id having sum(m.qty_pieces) <> 0
  ) st
  join public.v_products p on p.id = st.product_id and p.kind = 'sauce'
  where not exists (select 1 from public.stock_count_lines l where l.count_id = new_count and l.product_id = st.product_id);

  update public.stock_counts set status = 'confirmed', confirmed_at = now() where id = new_count;

  for line in select l.id, l.product_id, l.qty_pieces from public.stock_count_lines l where l.count_id = new_count loop
    delta := line.qty_pieces - private.stock_at(loc, line.product_id, null, started);
    if delta <> 0 then
      insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, count_line_id, created_by)
      values (started, loc, line.product_id, delta,
              case when opening then 'opening_balance' else 'count_adjustment' end::public.movement_type, line.id, caller);
    end if;
  end loop;

  return new_count;
end;
$$;

revoke execute on function public.submit_sauce_count(jsonb, timestamptz) from public, anon;
grant execute on function public.submit_sauce_count(jsonb, timestamptz) to authenticated;

-- ─── جرد الكيك وجرد الصوصات منفصلين ──────────────────────────────────

-- نفس الدالة: أول جرد = أول جرد كيك (جرد الصوصات ما بيحسب)، والأسطر من نوع أصناف الموقع بس
CREATE OR REPLACE FUNCTION public.submit_count(p_location_id uuid, p_lines jsonb, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_schedule_id uuid DEFAULT NULL::uuid, p_method count_method DEFAULT 'manual'::count_method, p_photo_path text DEFAULT NULL::text, p_form_version_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  loc public.locations;
  started timestamptz := coalesce(p_started_at, now());
  opening boolean;
  new_count uuid;
  line record;
  delta int;
begin
  if not private.can_count_at(p_location_id) then
    raise exception 'you cannot count at this location' using errcode = 'insufficient_privilege';
  end if;

  select * into loc from public.locations l where l.id = p_location_id;
  if loc.kind not in ('branch', 'factory', 'packaging') then
    raise exception 'only branches, the factory and the packaging store are counted' using errcode = 'check_violation';
  end if;

  -- وقت البداية من الجوال: مش بالمستقبل، ومش أقدم من 12 ساعة
  if started > now() + interval '1 minute' or started < now() - interval '12 hours' then
    raise exception 'the count start time is out of range' using errcode = 'check_violation';
  end if;

  if p_schedule_id is not null and not exists (
    select 1 from public.count_schedules s
    where s.id = p_schedule_id and s.location_id = p_location_id and s.is_active
  ) then
    raise exception 'the schedule does not belong to this location' using errcode = 'check_violation';
  end if;

  if p_form_version_id is not null and not exists (
    select 1 from public.count_form_versions f where f.id = p_form_version_id and f.location_id = p_location_id
  ) then
    raise exception 'the form version does not belong to this location' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'lines must be an array' using errcode = 'check_violation';
  end if;

  -- جرد واحد بكل موقع بنفس اللحظة، مشان "أول جرد" والمتوقع يكونوا صح
  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || p_location_id::text));

  opening := not exists (
    select 1 from public.stock_counts c where c.location_id = p_location_id and c.status = 'confirmed' and c.scope = 'stock'
  );

  insert into public.stock_counts (
    location_id, schedule_id, business_date, method, is_opening, started_at, counted_by, photo_path, form_version_id
  )
  values (
    p_location_id, p_schedule_id, (started at time zone 'Asia/Amman')::date, p_method, opening, started, caller,
    p_photo_path, p_form_version_id
  )
  returning id into new_count;

  -- الأسطر المدخلة. الدفعة بالمصنع من تاريخ الإنتاج (بتنعمل إذا مش موجودة).
  with input as (
    select
      (e ->> 'product_id')::uuid as product_id,
      (e ->> 'production_date')::date as production_date,
      coalesce((e ->> 'whole_cakes')::int, 0) as whole_cakes,
      coalesce((e ->> 'loose_pieces')::int, 0) as loose_pieces,
      (e ->> 'ocr_whole_cakes')::int as ocr_whole_cakes,
      (e ->> 'ocr_loose_pieces')::int as ocr_loose_pieces,
      (e ->> 'ocr_whole_confidence')::numeric as ocr_whole_confidence,
      (e ->> 'ocr_pieces_confidence')::numeric as ocr_pieces_confidence
    from jsonb_array_elements(p_lines) as e
  ),
  new_batches as (
    insert into public.batches (product_id, production_date)
    select distinct i.product_id, i.production_date from input i
    where loc.kind = 'factory' and i.production_date is not null
    on conflict (product_id, production_date) do nothing
    returning id, product_id, production_date
  ),
  all_batches as (
    select id, product_id, production_date from new_batches
    union
    select b.id, b.product_id, b.production_date from public.batches b
    join input i on i.product_id = b.product_id and i.production_date = b.production_date
  )
  insert into public.stock_count_lines (
    count_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot,
    ocr_whole_cakes, ocr_loose_pieces, ocr_whole_confidence, ocr_pieces_confidence
  )
  select
    new_count, i.product_id,
    case when loc.kind = 'factory' then b.id end,
    i.whole_cakes, i.loose_pieces, p.effective_pieces_per_cake,
    i.ocr_whole_cakes, i.ocr_loose_pieces, i.ocr_whole_confidence, i.ocr_pieces_confidence
  from input i
  join public.v_products p on p.id = i.product_id and p.kind = private.product_kind_at(p_location_id)
  left join all_batches b on b.product_id = i.product_id and b.production_date = i.production_date;

  if (select count(*) from public.stock_count_lines l where l.count_id = new_count) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs a known product (and a production date at the factory)'
      using errcode = 'check_violation';
  end if;

  -- اللي إله ستوك وما انعد: سطر صفر (بس من نوع أصناف هالموقع: الكيك بالفروع والمصنع، والتغليف بالمستودع)
  insert into public.stock_count_lines (count_id, product_id, batch_id, pieces_per_cake_snapshot)
  select new_count, st.product_id, st.batch_id, p.effective_pieces_per_cake
  from (
    select m.product_id, m.batch_id
    from public.stock_movements m
    where m.location_id = p_location_id and m.occurred_at <= started
    group by m.product_id, m.batch_id
    having sum(m.qty_pieces) <> 0
  ) st
  join public.v_products p on p.id = st.product_id and p.kind = private.product_kind_at(p_location_id)
  where not exists (
    select 1 from public.stock_count_lines l
    where l.count_id = new_count and l.product_id = st.product_id and l.batch_id is not distinct from st.batch_id
  );

  update public.stock_counts set status = 'confirmed', confirmed_at = now() where id = new_count;

  -- الحركة = العد − المتوقع وقت البداية
  for line in
    select l.id, l.product_id, l.batch_id, l.qty_pieces from public.stock_count_lines l where l.count_id = new_count
  loop
    delta := line.qty_pieces - private.stock_at(p_location_id, line.product_id, line.batch_id, started);
    if delta <> 0 then
      insert into public.stock_movements (
        occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, created_by
      )
      values (
        started, p_location_id, line.product_id, line.batch_id, delta,
        case when opening then 'opening_balance' else 'count_adjustment' end::public.movement_type,
        line.id, caller
      );
    end if;
  end loop;

  return new_count;
end;
$function$;

-- جرد الصوصات وجرد الكيك كل واحد إله ترتيبه
CREATE OR REPLACE FUNCTION private.reject_stale_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.stock_counts c
    where c.location_id = new.location_id and c.id <> new.id and c.status = 'confirmed' and c.scope = new.scope
      and c.started_at > new.started_at
  ) then
    raise exception 'a newer count was already confirmed here' using errcode = 'check_violation', hint = 'stale_count';
  end if;
  return new;
end;
$function$;

-- الجرد اللي قبله من نفس النوع
CREATE OR REPLACE FUNCTION public.count_breakdown(p_count_id uuid)
 RETURNS TABLE(line_id uuid, product_id uuid, batch_id uuid, pieces_per_cake smallint, whole_cakes integer, loose_pieces integer, counted_qty integer, prev_qty integer, in_qty integer, out_qty integer, waste_qty integer, other_qty integer, adjustment_qty integer, expected_qty integer, ocr_whole_cakes integer, ocr_loose_pieces integer, ocr_whole_confidence numeric, ocr_pieces_confidence numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with c as (
    select sc.* from public.stock_counts sc where sc.id = p_count_id and sc.status = 'confirmed'
  ),
  prev as (
    select pc.id, pc.started_at
    from public.stock_counts pc, c
    where pc.location_id = c.location_id and pc.status = 'confirmed' and pc.scope = c.scope and pc.started_at < c.started_at
    order by pc.started_at desc
    limit 1
  ),
  lines as (
    select l.*, c.location_id, c.started_at as count_at from public.stock_count_lines l join c on c.id = l.count_id
  ),
  moves as (
    select
      l.id as line_id,
      coalesce(sum(m.qty_pieces) filter (where m.movement_type in ('production', 'receipt_in', 'return_to_stock')), 0)::int as in_qty,
      coalesce(-sum(m.qty_pieces) filter (where m.movement_type = 'dispatch_out'), 0)::int as out_qty,
      coalesce(-sum(m.qty_pieces) filter (where m.movement_type = 'waste'), 0)::int as waste_qty,
      coalesce(sum(m.qty_pieces) filter (where m.movement_type = 'admin_correction'), 0)::int as other_qty
    from lines l
    left join public.stock_movements m
      on m.location_id = l.location_id
     and m.product_id = l.product_id
     and m.batch_id is not distinct from l.batch_id
     and m.occurred_at > coalesce((select started_at from prev), '-infinity'::timestamptz)
     and m.occurred_at <= l.count_at
    group by l.id
  ),
  adjustments as (
    select m.count_line_id as line_id, sum(m.qty_pieces)::int as adjustment_qty
    from public.stock_movements m
    where m.count_line_id in (select id from lines) and m.movement_type in ('count_adjustment', 'opening_balance')
    group by m.count_line_id
  )
  select
    l.id, l.product_id, l.batch_id, l.pieces_per_cake_snapshot, l.whole_cakes, l.loose_pieces, l.qty_pieces,
    case when (select id from prev) is null then null
         else coalesce((
           select pl.qty_pieces from public.stock_count_lines pl
           where pl.count_id = (select id from prev) and pl.product_id = l.product_id
             and pl.batch_id is not distinct from l.batch_id
         ), 0)
    end,
    mv.in_qty, mv.out_qty, mv.waste_qty, mv.other_qty,
    coalesce(a.adjustment_qty, 0),
    l.qty_pieces - coalesce(a.adjustment_qty, 0),
    l.ocr_whole_cakes, l.ocr_loose_pieces, l.ocr_whole_confidence, l.ocr_pieces_confidence
  from lines l
  join moves mv on mv.line_id = l.id
  left join adjustments a on a.line_id = l.id
  join public.products p on p.id = l.product_id
  order by p.sort_order, l.batch_id
$function$;

-- أول جرد بعده من نفس النوع
CREATE OR REPLACE FUNCTION public.admin_correct_count_line(p_line_id uuid, p_whole_cakes integer, p_loose_pieces integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  old_line public.stock_count_lines;
  cnt public.stock_counts;
  new_qty int;
  delta int;
  audit_id bigint;
  next_line uuid;
  next_started timestamptz;
  later_count timestamptz;
begin
  if not private.is_admin() then
    raise exception 'only an admin can correct a confirmed count' using errcode = 'insufficient_privilege';
  end if;

  select * into old_line from public.stock_count_lines l where l.id = p_line_id for update;
  if not found then
    raise exception 'count line not found' using errcode = 'no_data_found';
  end if;
  select * into cnt from public.stock_counts c where c.id = old_line.count_id;
  if cnt.status <> 'confirmed' then
    raise exception 'only confirmed counts are corrected' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || cnt.location_id::text));
  perform set_config('mekasa.change_reason', coalesce(p_reason, ''), true);

  update public.stock_count_lines
  set whole_cakes = p_whole_cakes, loose_pieces = p_loose_pieces
  where id = p_line_id
  returning qty_pieces into new_qty;

  delta := new_qty - old_line.qty_pieces;
  if delta = 0 then
    return;
  end if;

  select a.id into audit_id
  from public.audit_log a
  where a.table_name = 'stock_count_lines' and a.row_id = p_line_id::text
  order by a.id desc
  limit 1;

  insert into public.stock_movements (
    occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
  )
  values (
    cnt.started_at, cnt.location_id, old_line.product_id, old_line.batch_id, delta, 'count_adjustment',
    p_line_id, audit_id, caller
  );

  select l.id, c.started_at into next_line, next_started
  from public.stock_count_lines l
  join public.stock_counts c on c.id = l.count_id
  where c.location_id = cnt.location_id
    and c.status = 'confirmed'
    and c.started_at > cnt.started_at
    and l.product_id = old_line.product_id
    and l.batch_id is not distinct from old_line.batch_id
  order by c.started_at
  limit 1;

  -- أول جرد بعده (أي جرد، حتى لو ما فيه هالصنف)
  select min(c.started_at) into later_count
  from public.stock_counts c
  where c.location_id = cnt.location_id and c.status = 'confirmed' and c.scope = cnt.scope and c.started_at > cnt.started_at;

  if next_line is not null and next_started = later_count then
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
    )
    values (
      next_started, cnt.location_id, old_line.product_id, old_line.batch_id, -delta, 'count_adjustment',
      next_line, audit_id, caller
    );
  elsif later_count is not null then
    -- الجرد اللي بعده ما فيه هالصنف (كان صفر)، فالعكس حركة تصحيح بوقته
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, correction_audit_id, created_by
    )
    values (
      later_count, cnt.location_id, old_line.product_id, old_line.batch_id, -delta, 'admin_correction', audit_id, caller
    );
  end if;
end;
$function$;

-- الجرد الشهري بالفروع والمصنع = جرد الكيك + جرد الصوصات
CREATE OR REPLACE FUNCTION private.monthly_count_done(p_location_id uuid, p_scope text, p_day date, p_slot_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p_scope = 'raw' then
      exists (
        select 1 from public.raw_counts c
        where c.location_id = p_location_id and c.business_date = p_day and c.status = 'confirmed'
          and c.started_at >= p_slot_at - interval '3 hours')
      and not exists (
        select 1 from public.raw_materials m
        where m.is_active and not exists (
          select 1 from public.raw_count_lines l
          join public.raw_counts c on c.id = l.count_id
          where l.material_id = m.id and c.location_id = p_location_id and c.business_date = p_day
            and c.status = 'confirmed' and c.started_at >= p_slot_at - interval '3 hours'))
    else exists (
      select 1 from public.stock_counts c
      where c.location_id = p_location_id and c.business_date = p_day and c.status = 'confirmed'
        and c.scope = 'stock' and c.started_at >= p_slot_at - interval '3 hours')
      -- بالفروع والمصنع: الصوصات كمان (إذا في صوصات)
      and (
        (select l.kind from public.locations l where l.id = p_location_id) not in ('branch', 'factory')
        or not exists (select 1 from public.products p where p.kind = 'sauce' and p.is_active)
        or exists (
          select 1 from public.stock_counts c
          where c.location_id = p_location_id and c.business_date = p_day and c.status = 'confirmed'
            and c.scope = 'sauce' and c.started_at >= p_slot_at - interval '3 hours'))
  end
$function$;

-- نوع الجرد بآخر الأعمدة
create or replace view public.v_count_list with (security_invoker = true) as
SELECT c.id,
    c.location_id,
    c.business_date,
    c.started_at,
    c.confirmed_at,
    c.method,
    c.is_opening,
    c.counted_by,
    c.photo_path,
    s.time_of_day AS schedule_time,
    (count(l.id))::integer AS line_count,
    (COALESCE(sum((- adj.qty)) FILTER (WHERE (NOT c.is_opening)), (0)::bigint))::integer AS consumed_pieces,
    round(COALESCE(sum(((- (adj.qty)::numeric) / (l.pieces_per_cake_snapshot)::numeric)) FILTER (WHERE ((NOT c.is_opening) AND (l.pieces_per_cake_snapshot IS NOT NULL))), (0)::numeric), 1) AS consumed_cakes,
    (COALESCE(sum((- adj.qty)) FILTER (WHERE ((NOT c.is_opening) AND (l.pieces_per_cake_snapshot IS NULL))), (0)::bigint))::integer AS consumed_loose_only,
    (count(*) FILTER (WHERE ((NOT c.is_opening) AND (adj.qty > 0))))::integer AS impossible_lines,
    (count(*) FILTER (WHERE (((l.ocr_loose_pieces IS NOT NULL) AND (l.ocr_loose_pieces <> l.loose_pieces)) OR ((l.ocr_whole_cakes IS NOT NULL) AND (l.ocr_whole_cakes <> l.whole_cakes)))))::integer AS staff_corrected_lines,
    c.scope
   FROM (((stock_counts c
     LEFT JOIN count_schedules s ON ((s.id = c.schedule_id)))
     LEFT JOIN stock_count_lines l ON ((l.count_id = c.id)))
     LEFT JOIN LATERAL ( SELECT (COALESCE(sum(m.qty_pieces), (0)::bigint))::integer AS qty
           FROM stock_movements m
          WHERE ((m.count_line_id = l.id) AND (m.movement_type = ANY (ARRAY['count_adjustment'::movement_type, 'opening_balance'::movement_type])))) adj ON (true))
  WHERE (c.status = 'confirmed'::count_status)
  GROUP BY c.id, s.time_of_day;
