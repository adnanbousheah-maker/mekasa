-- 20 نوفمبر 2026 (اجتماع): التفريز بالإنتاج. الخطة docs/plan-2026-11-20.md (د).
-- الدفعة المفرّزة دفعة لحالها (is_frozen) بنفس تاريخ الإنتاج، صلاحيتها 30 يوم من الإنتاج.
-- الإخراج وتوزيع اليوم بيطلّعوا اللي بتخلص صلاحيته أول (الطازة قبل المفرّز). الجرد والتالف والإنتاج
-- بيعرفوا الدفعة المفرّزة بعلامة frozen. الدوال تحت نسخ من آخر نسخة، والتغيير بالدفعات بس.

-- ─── الدفعات ──────────────────────────────────────────────────────────
alter table public.batches add column is_frozen boolean not null default false;
alter table public.batches drop constraint batches_product_id_production_date_key;
alter table public.batches add constraint batches_product_date_frozen_key unique (product_id, production_date, is_frozen);

-- صلاحية المفرّز (يوم من تاريخ الإنتاج)
create function private.frozen_shelf_life()
returns int
language sql
immutable
set search_path = ''
as $$
  select 30
$$;

-- آخر يوم صلاحية للدفعة (بعده منتهية): المفرّز 30 يوم، والطازة مدة الصنف
create function private.batch_expires_on(p_batch uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select b.production_date + case when b.is_frozen then private.frozen_shelf_life() else private.shelf_life_of(b.product_id) end
  from public.batches b where b.id = p_batch
$$;

revoke execute on function private.frozen_shelf_life(), private.batch_expires_on(uuid) from public, anon;
grant execute on function private.frozen_shelf_life(), private.batch_expires_on(uuid) to authenticated, service_role;

-- نفس الدالة (20261023101600)، بس الطازة بس (المفرّز بيتسجل بالإنتاج والجرد والتالف)
create or replace function private.upsert_batch(product uuid, production_date date)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.batches (product_id, production_date)
  values (product, production_date)
  on conflict (product_id, production_date, is_frozen) do update set production_date = excluded.production_date
  returning id
$$;

create function private.upsert_batch_frozen(product uuid, production_date date, frozen boolean)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.batches (product_id, production_date, is_frozen)
  values (product, production_date, frozen)
  on conflict (product_id, production_date, is_frozen) do update set production_date = excluded.production_date
  returning id
$$;

revoke execute on function private.upsert_batch_frozen(uuid, date, boolean) from public, anon;
grant execute on function private.upsert_batch_frozen(uuid, date, boolean) to authenticated, service_role;

-- نفس الـ view (20261025100600) بصلاحية كل دفعة (المفرّز 30 يوم)، و is_frozen بالآخر
create or replace view public.v_factory_batches with (security_invoker = true) as
select
  b.id as batch_id,
  b.product_id,
  b.production_date,
  b.day_number,
  st.location_id,
  st.qty_pieces,
  public.amman_today() - b.production_date as age_days,
  b.production_date + l.days as expires_on,
  public.amman_today() - b.production_date = l.days - 1 as is_last_day,
  public.amman_today() - b.production_date >= l.days as is_expired,
  l.days as shelf_life_days,
  b.is_frozen
from public.batches b
join public.products p on p.id = b.product_id
join public.v_stock_current st on st.batch_id = b.id
cross join public.app_settings s
cross join lateral (
  select (case when b.is_frozen then private.frozen_shelf_life()
               else coalesce(p.shelf_life_days, s.factory_shelf_life_days) end)::int as days
) l;

-- ─── الإنتاج: جزء مفرّز ───────────────────────────────────────────────
-- p_lines: [{ "product_id", "whole_cakes", "loose_pieces", "frozen" }]. المفرّز تسجيل لحاله
-- (production_lines فيها صنف مرة وحدة لكل تسجيل)، بنفس الملاحظة.
create or replace function public.record_production(p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  factory uuid := private.my_location_id();
  entry uuid;
  first_entry uuid;
  frozen boolean;
  part jsonb;
begin
  if not private.has_role('storekeeper')
     or not exists (select 1 from public.locations l where l.id = factory and l.kind = 'factory') then
    raise exception 'only the storekeeper records production' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'production needs at least one line' using errcode = 'check_violation';
  end if;

  foreach frozen in array array[false, true] loop
    select coalesce(jsonb_agg(e), '[]'::jsonb) into part
    from jsonb_array_elements(p_lines) e
    where coalesce((e ->> 'frozen')::boolean, false) = frozen;
    continue when jsonb_array_length(part) = 0;

    insert into public.production_entries (location_id, recorded_by, note)
    values (factory, caller, nullif(trim(p_note), ''))
    returning id into entry;
    first_entry := coalesce(first_entry, entry);

    insert into public.production_lines (entry_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
    select entry, p.id, private.upsert_batch_frozen(p.id, public.amman_today(), frozen),
           coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0), p.effective_pieces_per_cake
    from jsonb_array_elements(part) e
    join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.is_active;

    if (select count(*) from public.production_lines l where l.entry_id = entry) <> jsonb_array_length(part) then
      raise exception 'every line needs an active product (once per fresh or frozen)' using errcode = 'check_violation';
    end if;

    insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, production_line_id, created_by)
    select now(), factory, l.product_id, l.batch_id, l.qty_pieces, 'production', l.id, caller
    from public.production_lines l
    where l.entry_id = entry;
  end loop;

  return first_entry;
end;
$$;

-- ─── الإخراج وتوزيع اليوم والجرد والتالف ─────────────────────────────

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

  if needs_confirmation and not p_confirm_fefo_override then
    raise exception 'an older batch is still in stock' using errcode = 'check_violation', hint = 'fefo_override';
  end if;

  return dispatch;
end;
$$;

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

    for batch_row in
      select m.batch_id, bt.production_date, sum(m.qty_pieces)::int as available
      from public.stock_movements m
      join public.batches bt on bt.id = m.batch_id
      where m.location_id = factory.id and m.product_id = product_row.product_id
        and private.batch_expires_on(bt.id) > public.amman_today()
      group by m.batch_id, bt.production_date
      having sum(m.qty_pieces) > 0
      order by private.batch_expires_on(m.batch_id), bt.production_date
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
      coalesce((e ->> 'frozen')::boolean, false) as is_frozen,
      coalesce((e ->> 'whole_cakes')::int, 0) as whole_cakes,
      coalesce((e ->> 'loose_pieces')::int, 0) as loose_pieces,
      (e ->> 'ocr_whole_cakes')::int as ocr_whole_cakes,
      (e ->> 'ocr_loose_pieces')::int as ocr_loose_pieces,
      (e ->> 'ocr_whole_confidence')::numeric as ocr_whole_confidence,
      (e ->> 'ocr_pieces_confidence')::numeric as ocr_pieces_confidence
    from jsonb_array_elements(p_lines) as e
  ),
  new_batches as (
    insert into public.batches (product_id, production_date, is_frozen)
    select distinct i.product_id, i.production_date, i.is_frozen from input i
    where loc.kind = 'factory' and i.production_date is not null
    on conflict (product_id, production_date, is_frozen) do nothing
    returning id, product_id, production_date, is_frozen
  ),
  all_batches as (
    select id, product_id, production_date, is_frozen from new_batches
    union
    select b.id, b.product_id, b.production_date, b.is_frozen from public.batches b
    join input i on i.product_id = b.product_id and i.production_date = b.production_date and i.is_frozen = b.is_frozen
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
  left join all_batches b on b.product_id = i.product_id and b.production_date = i.production_date
    and b.is_frozen = i.is_frozen;

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

create or replace function public.record_waste(
  p_location_id uuid,
  p_product_id uuid,
  p_unit public.entry_unit,
  p_qty int,
  p_reason public.waste_reason,
  p_note text default null,
  -- المصنع بس: تاريخ إنتاج الدفعة
  p_production_date date default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  loc_kind public.location_kind;
  batch uuid;
  record_id uuid;
  pieces int;
begin
  if not private.can_record_waste_at(p_location_id) then
    raise exception 'you cannot record waste at this location' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'product not found' using errcode = 'foreign_key_violation';
  end if;

  select l.kind into loc_kind from public.locations l where l.id = p_location_id;
  if loc_kind = 'factory' then
    if p_production_date is null or p_production_date > public.amman_today() then
      raise exception 'factory waste needs the batch production date' using errcode = 'check_violation';
    end if;
    -- الدفعة المفرّزة: log_waste بتحط mekasa.waste_frozen (التوقيع ما تغيّر)
    insert into public.batches (product_id, production_date, is_frozen)
    values (p_product_id, p_production_date, coalesce(current_setting('mekasa.waste_frozen', true), '') = 'on')
    on conflict (product_id, production_date, is_frozen) do update set production_date = excluded.production_date
    returning id into batch;
  end if;

  insert into public.waste_records (
    location_id, product_id, batch_id, entered_unit, entered_qty, pieces_per_cake_snapshot,
    reason, reason_note, photo_path, recorded_by
  )
  select
    p_location_id, p_product_id, batch, p_unit, p_qty, p.effective_pieces_per_cake,
    p_reason, nullif(trim(p_note), ''), p_photo_path, caller
  from public.v_products p
  where p.id = p_product_id
  returning id, qty_pieces into record_id, pieces;

  insert into public.stock_movements (
    occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, waste_record_id, created_by
  )
  values (now(), p_location_id, p_product_id, batch, -pieces, 'waste', record_id, caller);

  return record_id;
end;
$$;

-- ─── التالف من دفعة مفرّزة ───────────────────────────────────────────
-- log_waste بتاخذ p_frozen وبتمرره لـ record_waste بإعداد محلي. القديمة بتتسمّى وبتتسكّر (بدون drop).
alter function public.log_waste(uuid, uuid, public.entry_unit, int, uuid, text, date, text) rename to log_waste_before_freeze;
revoke execute on function public.log_waste_before_freeze(uuid, uuid, public.entry_unit, int, uuid, text, date, text) from public, anon, authenticated;

create function public.log_waste(
  p_location_id uuid,
  p_product_id uuid,
  p_unit public.entry_unit,
  p_qty int,
  p_reason_id uuid,
  p_note text default null,
  p_production_date date default null,
  p_photo_path text default null,
  p_frozen boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  opt public.lookup_options;
  record_id uuid;
begin
  if coalesce(trim(p_photo_path), '') = '' then
    raise exception 'waste needs a photo' using errcode = 'check_violation', hint = 'photo_required';
  end if;

  select * into opt from public.lookup_options o
  where o.id = p_reason_id and o.list_key = 'waste_reasons' and o.is_active;
  if opt.id is null then
    raise exception 'pick a waste reason from the list' using errcode = 'check_violation';
  end if;
  if opt.allowed_roles is not null and not private.is_admin() and not exists (
    select 1 from unnest(opt.allowed_roles) r where private.has_role(r)
  ) then
    raise exception 'this reason is not for your role' using errcode = 'insufficient_privilege';
  end if;
  if opt.requires_note and coalesce(trim(p_note), '') = '' then
    raise exception 'this reason needs a note' using errcode = 'check_violation', hint = 'note_required';
  end if;

  perform set_config('mekasa.waste_reason_option', opt.id::text, true);
  perform set_config('mekasa.waste_frozen', case when p_frozen then 'on' else '' end, true);
  record_id := public.record_waste(
    p_location_id, p_product_id, p_unit, p_qty,
    case when opt.code in ('expired', 'broken') then opt.code else 'other' end::public.waste_reason,
    case
      when opt.code in ('expired', 'broken') then p_note
      else coalesce(nullif(trim(p_note), ''), '[سبب] ' || opt.name)
    end,
    p_production_date, p_photo_path
  );
  perform set_config('mekasa.waste_reason_option', '', true);
  perform set_config('mekasa.waste_frozen', '', true);
  return record_id;
end;
$$;

revoke execute on function public.log_waste(uuid, uuid, public.entry_unit, int, uuid, text, date, text, boolean) from public, anon;
grant execute on function public.log_waste(uuid, uuid, public.entry_unit, int, uuid, text, date, text, boolean) to authenticated;
