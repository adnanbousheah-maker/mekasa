-- ملاحظات ميكاسا (25 أكتوبر 2026): مستودع التغليف ودور أمين مستودع التغليف.
-- الفروع بتطلب مواد التغليف من المستودع وبتستلمها (نفس مستندات الطلب والإخراج والاستلام).
-- أمين المستودع بيجرد المستودع وبيطلّع. جرد التغليف بالفروع لاحقاً.

insert into public.locations (name, kind, code, sort_order)
select 'مستودع التغليف', 'packaging', 'PKG', 5
where not exists (select 1 from public.locations l where l.kind = 'packaging');

-- أول مستودع تغليف فعّال
create function private.packaging_store()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.locations l
  where l.kind = 'packaging' and l.is_active
  order by l.sort_order, l.name
  limit 1
$$;

-- نوع الأصناف اللي بتتحرك بموقع: التغليف بمستودع التغليف، والكيك بالباقي
create function private.product_kind_at(loc uuid)
returns public.product_kind
language sql
stable
security definer
set search_path = ''
as $$
  select case when l.kind = 'packaging' then 'packaging' else 'cake' end::public.product_kind
  from public.locations l where l.id = loc
$$;

revoke execute on function private.packaging_store(), private.product_kind_at(uuid) from public, anon;
grant execute on function private.packaging_store(), private.product_kind_at(uuid) to authenticated, service_role;

-- ─── الصنف لازم يناسب المكان ─────────────────────────────────────────
-- الطلب من المصنع كيك بس، ومن مستودع التغليف تغليف بس. نفس الشي للإخراج (حسب المصدر) والجرد والإنتاج.

create function private.check_product_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loc uuid;
begin
  -- كل جدول بفرع لحاله: plpgsql بيفحص حقول new بس للسطر اللي بيتنفذ
  if tg_table_name in ('stock_request_lines', 'stock_request_missing') then
    select r.supplying_location_id into loc from public.stock_requests r where r.id = new.request_id;
  elsif tg_table_name = 'dispatch_lines' then
    select d.from_location_id into loc from public.dispatches d where d.id = new.dispatch_id;
  elsif tg_table_name = 'stock_count_lines' then
    select c.location_id into loc from public.stock_counts c where c.id = new.count_id;
  elsif tg_table_name = 'production_lines' then
    select e.location_id into loc from public.production_entries e where e.id = new.entry_id;
  end if;
  if (select p.kind from public.products p where p.id = new.product_id) is distinct from private.product_kind_at(loc) then
    raise exception 'this item does not belong here (cakes and packaging are kept apart)'
      using errcode = 'check_violation', hint = 'wrong_product_kind';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'stock_request_lines', 'stock_request_missing', 'dispatch_lines', 'stock_count_lines', 'production_lines'
  ] loop
    execute format(
      'create trigger %1$s_product_kind before insert on public.%1$I
         for each row execute function private.check_product_kind()', t);
  end loop;
end;
$$;

-- ─── الدور مش الموقع ─────────────────────────────────────────────────
-- أمين مستودع التغليف دور بينعطى لأي موظف (بأي موقع)، وبيشوف المستودع وبيشتغل فيه.

create or replace function private.can_see_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.locations l
    where l.id = loc
      and (private.my_location_id() in (l.id, l.parent_location_id)
           or (l.kind = 'packaging' and private.has_role('packaging_keeper')))
  )
$$;

create or replace function private.assert_roles_match_location(target_staff uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  bad_role public.app_role;
begin
  select r.role into bad_role
  from public.staff_roles r
  join public.staff s on s.id = r.staff_id
  left join public.locations l on l.id = s.location_id
  where r.staff_id = target_staff
    and case r.role
          when 'admin' then false
          when 'branch_staff' then l.kind is distinct from 'branch'
          -- أي موقع، بس لازم يكون إله موقع
          when 'packaging_keeper' then l.id is null
          else l.kind is distinct from 'factory'
        end
  limit 1;

  if bad_role is not null then
    raise exception 'role % does not match the staff member''s location', bad_role
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ─── مين بيجرد ───────────────────────────────────────────────────────

create or replace function private.can_count_at(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.locations l
    where l.id = loc
      and l.is_active
      and case l.kind
            when 'branch' then l.id = private.my_location_id() and private.has_role('branch_staff')
            when 'factory' then l.id = private.my_location_id() and private.has_role('storekeeper')
            when 'packaging' then private.has_role('packaging_keeper')
            else false
          end
  )
$$;

-- نفس الدالة (20261023101200)، بس المستودع بينجرد، والجرد الكامل بس لأصناف نوع الموقع
create or replace function public.submit_count(
  p_location_id uuid,
  p_lines jsonb,
  p_started_at timestamptz default null,
  p_schedule_id uuid default null,
  p_method public.count_method default 'manual',
  p_photo_path text default null,
  p_form_version_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    select 1 from public.stock_counts c where c.location_id = p_location_id and c.status = 'confirmed'
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
  join public.v_products p on p.id = i.product_id
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
$$;

-- ─── الطلب: المصدر حسب نوع الأصناف ──────────────────────────────────

-- نفس الدالة (20261025100300)، بس الطلب بيروح للمصنع أو لمستودع التغليف
create or replace function public.create_request(p_lines jsonb, p_note text default null, p_missing jsonb default '[]')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  branch uuid := private.my_location_id();
  -- التغليف من مستودع التغليف، والكيك من المصنع (حسب نوع أول سطر، والـ trigger بيمنع الخلط)
  supplier uuid := case
    when (select p.kind from public.products p where p.id = (p_lines -> 0 ->> 'product_id')::uuid) = 'packaging'
    then private.packaging_store() else private.main_factory() end;
  needs_approval boolean := (select s.order_approval_required from public.app_settings s);
  request uuid;
begin
  if not private.has_role('branch_staff')
     or not exists (select 1 from public.locations l where l.id = branch and l.kind = 'branch' and l.is_active) then
    raise exception 'only branch staff can request stock' using errcode = 'insufficient_privilege';
  end if;
  if supplier is null then
    raise exception 'there is no active place to order from' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a request needs at least one line' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(p_missing, '[]')) is distinct from 'array' then
    raise exception 'forgotten items must be a list' using errcode = 'check_violation';
  end if;

  insert into public.stock_requests (requesting_location_id, supplying_location_id, status, requested_by, note)
  values (branch, supplier, case when needs_approval then 'pending_approval' else 'sent' end::public.request_status,
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

  -- صنف ما بيكون منسي إذا انطلب
  insert into public.stock_request_missing (request_id, product_id, suggested_pieces)
  select request, p.id, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(coalesce(p_missing, '[]')) e
  join public.products p on p.id = (e ->> 'product_id')::uuid and p.is_active
  where not exists (
    select 1 from public.stock_request_lines l where l.request_id = request and l.product_id = p.id
  );

  if (select count(*) from public.stock_request_missing m where m.request_id = request)
     <> jsonb_array_length(coalesce(p_missing, '[]')) then
    raise exception 'a forgotten item must be an active product that is not in the request'
      using errcode = 'check_violation';
  end if;
  return request;
end;
$$;

-- ─── الإخراج من مستودع التغليف ──────────────────────────────────────

-- نفس الدالة (20261025100000)، بس أمين مستودع التغليف بيطلّع من المستودع للفروع (بدون دفعات ولا فحص ستوك، متل الفروع)
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

-- ─── عمر الكيك بالفروع: الكيك بس (التغليف ما بيخلص) ───────────────

create or replace view public.v_branch_stock_age with (security_invoker = true) as
with stock as (
  select m.location_id, m.product_id, sum(m.qty_pieces)::int as qty
  from public.stock_movements m
  join public.locations l on l.id = m.location_id and l.kind = 'branch'
  join public.products p on p.id = m.product_id and p.kind = 'cake'
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
