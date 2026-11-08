-- المرحلة ج (8 نوفمبر 2026): تقارير الإدارة بالكميات بس (بدون أسعار لهلا).
-- كلها security invoker: الأدمن والمدير العام بيشوفوا الكل، وأي حدا ثاني بيشوف اللي بتسمحله RLS.
-- الكيك بس (kind = 'cake'). الكيكات = القطع ÷ قطع الكيكة الحالية، والأصناف اللي قطع بس لحالها (loose).
-- الفترة بأيام عمّان، من p_from لـ p_to (مع الطرفين)، وأقصى سنة.

create function private.report_range_ok(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'pick a period of up to a year' using errcode = 'check_violation';
  end if;
end;
$$;

revoke execute on function private.report_range_ok(date, date) from public, anon;
grant execute on function private.report_range_ok(date, date) to authenticated, service_role;

-- لكل موقع: الاستهلاك، التالف، المستلم، الإنتاج، اللي طلع، انضباط الجرد، فروقات الاستلام، والأرقام المستحيلة
create function public.report_locations(p_from date, p_to date)
returns table (
  location_id uuid,
  consumed_cakes numeric,
  consumed_loose int,
  waste_cakes numeric,
  waste_loose int,
  received_cakes numeric,
  received_loose int,
  produced_cakes numeric,
  produced_loose int,
  dispatched_cakes numeric,
  dispatched_loose int,
  counts_expected int,
  counts_done int,
  counts_on_time int,
  receipt_lines int,
  receipt_diffs int,
  impossible_lines int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  since timestamptz := (p_from::timestamp at time zone 'Asia/Amman');
  until timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Amman');
  today date := public.count_day_today();
begin
  perform private.report_range_ok(p_from, p_to);
  return query
  with cake as (
    select p.id, p.effective_pieces_per_cake as ppc from public.v_products p where p.kind = 'cake'
  ),
  moves as (
    select m.location_id, m.movement_type, m.qty_pieces, c.ppc
    from public.stock_movements m
    join cake c on c.id = m.product_id
    where m.occurred_at >= since and m.occurred_at < until
      and m.movement_type in ('receipt_in', 'production', 'dispatch_out')
  ),
  move_sums as (
    select
      m.location_id,
      sum(case when m.movement_type = 'receipt_in' and m.ppc is not null then m.qty_pieces::numeric / m.ppc else 0 end) as received_cakes,
      sum(case when m.movement_type = 'receipt_in' and m.ppc is null then m.qty_pieces else 0 end)::int as received_loose,
      sum(case when m.movement_type = 'production' and m.ppc is not null then m.qty_pieces::numeric / m.ppc else 0 end) as produced_cakes,
      sum(case when m.movement_type = 'production' and m.ppc is null then m.qty_pieces else 0 end)::int as produced_loose,
      sum(case when m.movement_type = 'dispatch_out' and m.ppc is not null then -m.qty_pieces::numeric / m.ppc else 0 end) as dispatched_cakes,
      sum(case when m.movement_type = 'dispatch_out' and m.ppc is null then -m.qty_pieces else 0 end)::int as dispatched_loose
    from moves m
    group by m.location_id
  ),
  consumed as (
    select v.location_id,
      sum(case when c.ppc is not null then v.consumed_pieces::numeric / c.ppc else 0 end) as cakes,
      sum(case when c.ppc is null then v.consumed_pieces else 0 end)::int as loose
    from public.v_count_consumption v
    join cake c on c.id = v.product_id
    where v.business_date between p_from and p_to
    group by v.location_id
  ),
  waste as (
    select w.location_id,
      sum(case when c.ppc is not null then w.qty_pieces::numeric / c.ppc else 0 end) as cakes,
      sum(case when c.ppc is null then w.qty_pieces else 0 end)::int as loose
    from public.waste_records w
    join cake c on c.id = w.product_id
    where w.occurred_at >= since and w.occurred_at < until
    group by w.location_id
  ),
  -- المواعيد المتوقعة: كل موعد فعّال × كل يوم بالفترة من يوم ما انعمل لحد اليوم
  expected as (
    select s.location_id, count(*)::int as n
    from public.count_schedules s
    cross join generate_series(p_from, least(p_to, today), interval '1 day') d
    where s.is_active and d::date >= private.count_day(s.created_at)
      -- الموعد لسا ما إجا (اليوم) ما بينحسب
      and private.slot_at(d::date, s.time_of_day) <= now()
    group by s.location_id
  ),
  counts as (
    select c.location_id,
      count(*)::int as done,
      count(*) filter (
        where c.started_at <= private.slot_at(c.business_date, s.time_of_day)
          + make_interval(mins => (select a.count_late_after_minutes from public.app_settings a))
      )::int as on_time
    from public.stock_counts c
    join public.count_schedules s on s.id = c.schedule_id
    where c.status = 'confirmed' and c.scope = 'stock' and c.business_date between p_from and p_to
    group by c.location_id
  ),
  receipts as (
    select r.location_id,
      count(*)::int as lines,
      count(*) filter (where rl.qty_pieces <> dl.qty_pieces)::int as diffs
    from public.receipt_lines rl
    join public.receipts r on r.id = rl.receipt_id
    join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
    where r.received_at >= since and r.received_at < until
    group by r.location_id
  ),
  impossible as (
    select v.location_id, sum(v.impossible_lines)::int as n
    from public.v_count_list v
    where v.business_date between p_from and p_to and v.scope = 'stock'
    group by v.location_id
  )
  select
    l.id,
    round(coalesce(co.cakes, 0), 1), coalesce(co.loose, 0),
    round(coalesce(w.cakes, 0), 1), coalesce(w.loose, 0),
    round(coalesce(ms.received_cakes, 0), 1), coalesce(ms.received_loose, 0),
    round(coalesce(ms.produced_cakes, 0), 1), coalesce(ms.produced_loose, 0),
    round(coalesce(ms.dispatched_cakes, 0), 1), coalesce(ms.dispatched_loose, 0),
    coalesce(e.n, 0), coalesce(ct.done, 0), coalesce(ct.on_time, 0),
    coalesce(rc.lines, 0), coalesce(rc.diffs, 0),
    coalesce(i.n, 0)
  from public.locations l
  left join move_sums ms on ms.location_id = l.id
  left join consumed co on co.location_id = l.id
  left join waste w on w.location_id = l.id
  left join expected e on e.location_id = l.id
  left join counts ct on ct.location_id = l.id
  left join receipts rc on rc.location_id = l.id
  left join impossible i on i.location_id = l.id
  where l.is_active and l.kind in ('branch', 'factory') and private.can_see_location(l.id)
  order by l.kind desc, l.name;
end;
$$;

-- لكل صنف كيك: الاستهلاك (الفروع)، التالف (كل المواقع)، الإنتاج، والمستلم (الفروع)، بالقطع
create function public.report_products(p_from date, p_to date)
returns table (product_id uuid, consumed_pieces int, waste_pieces int, produced_pieces int, received_pieces int)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  since timestamptz := (p_from::timestamp at time zone 'Asia/Amman');
  until timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Amman');
begin
  perform private.report_range_ok(p_from, p_to);
  return query
  select
    p.id,
    coalesce((select sum(v.consumed_pieces) from public.v_count_consumption v
              where v.product_id = p.id and v.business_date between p_from and p_to), 0)::int,
    coalesce((select sum(w.qty_pieces) from public.waste_records w
              where w.product_id = p.id and w.occurred_at >= since and w.occurred_at < until), 0)::int,
    coalesce((select sum(m.qty_pieces) from public.stock_movements m
              where m.product_id = p.id and m.movement_type = 'production'
                and m.occurred_at >= since and m.occurred_at < until), 0)::int,
    coalesce((select sum(m.qty_pieces) from public.stock_movements m
              where m.product_id = p.id and m.movement_type = 'receipt_in'
                and m.occurred_at >= since and m.occurred_at < until), 0)::int
  from public.products p
  where p.kind = 'cake';
end;
$$;

-- الاستهلاك اليومي لكل فرع (بالكيكات، والقطع بس لحالها)
create function public.report_daily(p_from date, p_to date)
returns table (day date, location_id uuid, consumed_cakes numeric, consumed_loose int, waste_cakes numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.report_range_ok(p_from, p_to);
  return query
  with cake as (
    select p.id, p.effective_pieces_per_cake as ppc from public.v_products p where p.kind = 'cake'
  ),
  used as (
    select v.business_date as d, v.location_id as loc,
      sum(case when c.ppc is not null then v.consumed_pieces::numeric / c.ppc else 0 end) as cakes,
      sum(case when c.ppc is null then v.consumed_pieces else 0 end)::int as loose
    from public.v_count_consumption v
    join cake c on c.id = v.product_id
    where v.business_date between p_from and p_to
    group by 1, 2
  ),
  wasted as (
    select (w.occurred_at at time zone 'Asia/Amman')::date as d, w.location_id as loc,
      sum(case when c.ppc is not null then w.qty_pieces::numeric / c.ppc else 0 end) as cakes
    from public.waste_records w
    join cake c on c.id = w.product_id
    where (w.occurred_at at time zone 'Asia/Amman')::date between p_from and p_to
    group by 1, 2
  )
  select coalesce(u.d, x.d), coalesce(u.loc, x.loc),
    round(coalesce(u.cakes, 0), 1), coalesce(u.loose, 0), round(coalesce(x.cakes, 0), 1)
  from used u
  full join wasted x on x.d = u.d and x.loc = u.loc
  order by 1, 2;
end;
$$;

revoke execute on function
  public.report_locations(date, date), public.report_products(date, date), public.report_daily(date, date)
from public, anon;
grant execute on function
  public.report_locations(date, date), public.report_products(date, date), public.report_daily(date, date)
to authenticated;
