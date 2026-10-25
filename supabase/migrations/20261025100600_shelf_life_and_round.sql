-- ملاحظات ميكاسا (25 أكتوبر 2026):
-- 1) مدة حياة لكل صنف بالمصنع (فراغ = الإعداد العام). الأصناف اللي عمرها أكثر من 7 أيام
--    بتنكتب عليها التاريخ بدل رقم اليوم (لأن الرقم بيتكرر كل أسبوع).
-- 2) توزيع اليوم: الإخراج بيطلّع كل طلبات الفروع مرة وحدة، والقديم بيتوزع على الكل بالعدل
--    (كل دفعة، من الأقدم، بتنقسم حسب اللي ضايل لكل فرع) بدل ما أول فرع ياخذ كل القديم.

alter table public.products
  add column shelf_life_days smallint check (shelf_life_days between 1 and 60);

-- p.* بينحسب وقت إنشاء الـ view، فلازم ينعمل من جديد مشان يبين shelf_life_days
-- الحذف بيطلب موافقة بالسحابة، فالنسخة القديمة بتنحفظ باسم ثاني ومسكّرة على الكل
alter view public.v_products rename to v_products_before_shelf_life;
revoke all on public.v_products_before_shelf_life from anon, authenticated;
create view public.v_products with (security_invoker = true) as
select
  p.*,
  case when p.sell_mode = 'pieces_only' then null
       else coalesce(p.pieces_per_cake, s.default_pieces_per_cake)
  end as effective_pieces_per_cake,
  coalesce(p.shelf_life_days, s.factory_shelf_life_days)::int as effective_shelf_life_days
from public.products p
cross join public.app_settings s;

revoke all on public.v_products from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_products from authenticated;

-- مدة حياة الصنف بالمصنع
create function private.shelf_life_of(product uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.shelf_life_days, s.factory_shelf_life_days)::int
  from public.products p cross join public.app_settings s
  where p.id = product
$$;

create function private.batch_is_expired(product uuid, production_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.amman_today() - production_date >= private.shelf_life_of(product)
$$;

revoke execute on function private.shelf_life_of(uuid), private.batch_is_expired(uuid, date) from public, anon;
grant execute on function private.shelf_life_of(uuid), private.batch_is_expired(uuid, date) to authenticated, service_role;

-- نفس الـ view، بس بمدة حياة الصنف، ومع المدة نفسها بالآخر
create or replace view public.v_factory_batches with (security_invoker = true) as
select
  b.id as batch_id,
  b.product_id,
  b.production_date,
  b.day_number,
  st.location_id,
  st.qty_pieces,
  public.amman_today() - b.production_date as age_days,
  b.production_date + coalesce(p.shelf_life_days, s.factory_shelf_life_days) as expires_on,
  public.amman_today() - b.production_date = coalesce(p.shelf_life_days, s.factory_shelf_life_days) - 1 as is_last_day,
  public.amman_today() - b.production_date >= coalesce(p.shelf_life_days, s.factory_shelf_life_days) as is_expired,
  coalesce(p.shelf_life_days, s.factory_shelf_life_days)::int as shelf_life_days
from public.batches b
join public.products p on p.id = b.product_id
join public.v_stock_current st on st.batch_id = b.id
cross join public.app_settings s;

-- نفس الدالة (20261025100510)، بس الانتهاء حسب مدة حياة الصنف
create or replace function public.create_dispatch(
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

-- ─── توزيع اليوم ─────────────────────────────────────────────────────

-- p_round: [{ "request_id", "driver_name",
--              "lines": [{ "product_id", "request_line_id", "whole_cakes", "loose_pieces" }] }]
-- كل طلب بيصير إخراج. الدفعات بتختارها الدالة: لكل صنف، المجموع من الأقدم (FEFO، بدون المنتهي)،
-- وكل دفعة بتنقسم على الأسطر حسب اللي ضايل لكل سطر (الباقي للكسر الأكبر، وبعدين بالترتيب).
-- إذا كل الأسطر كيكات كاملة والستوك بيكفي كيكات كاملة، القسمة بالكيكة (ما بتنقسم كيكة على دفعتين).
-- نفس الحساب بالواجهة (fairAllocate بـ src/features/orders/logic.ts).
create function public.dispatch_round(p_round jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
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

  for product_row in select distinct rl.product_id from pg_temp.round_lines rl loop
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

revoke execute on function public.dispatch_round(jsonb) from public, anon;
grant execute on function public.dispatch_round(jsonb) to authenticated;
