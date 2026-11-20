-- 20 نوفمبر 2026 (اجتماع): صرف المواد انسكّر، وجرد يومي لكل المواد بالمصنع، والاستلام من المورد كذا مادة بمرة.
-- الخطة: docs/plan-2026-11-20.md (ب، ج)

-- ─── الصرف مسكّر، والاستلام بس ─────────────────────────────────────────
-- نفس الدالة (20261023101800)، بس الصرف بيترفض: المصروف بينحسب من الجرد اليومي.
create or replace function public.record_raw_movement(
  p_material_id uuid,
  p_kind public.raw_movement_type,
  p_qty numeric,
  p_unit_id uuid default null,
  p_supplier_name text default null,
  p_invoice_photo_path text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  factory uuid := private.raw_staff_factory();
  base numeric;
  movement bigint;
begin
  if p_kind is distinct from 'receipt' then
    raise exception 'only receipts are recorded here (usage comes from the daily count)'
      using errcode = 'check_violation', hint = 'issue_closed';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'the quantity must be positive' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.raw_materials m where m.id = p_material_id and m.is_active) then
    raise exception 'material not found' using errcode = 'check_violation';
  end if;

  base := private.raw_to_base(p_material_id, p_unit_id, p_qty);
  insert into public.raw_movements (
    occurred_at, location_id, material_id, qty_base, movement_type, entered_unit_id, entered_qty,
    supplier_name, invoice_photo_path, created_by
  )
  values (
    now(), factory, p_material_id, base, 'receipt', p_unit_id, p_qty,
    nullif(trim(p_supplier_name), ''), p_invoice_photo_path, (select auth.uid())
  )
  returning id into movement;
  return movement;
end;
$$;

-- استلام كذا مادة من نفس المورد ونفس الفاتورة، كلهم مع بعض أو ولا وحدة.
-- p_lines: [{ "material_id", "unit_id" (أو null = الوحدة الأساسية), "qty" }]
create function public.record_raw_receipt(
  p_lines jsonb,
  p_supplier_name text default null,
  p_invoice_photo_path text default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'add at least one material' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    perform public.record_raw_movement(
      (e ->> 'material_id')::uuid, 'receipt', (e ->> 'qty')::numeric, (e ->> 'unit_id')::uuid,
      p_supplier_name, p_invoice_photo_path
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.record_raw_receipt(jsonb, text, text) from public, anon;
grant execute on function public.record_raw_receipt(jsonb, text, text) to authenticated;

-- ─── المصروف من الجرد ─────────────────────────────────────────────────
-- نفس الأعمدة (create or replace). المصروف اليومي = الصرف القديم + نقص الجرد (تعديل الجرد بالسالب
-- ناقص الزيادة) بآخر 14 يوم، وبيكفي كم يوم منه.
create or replace view public.v_raw_stock with (security_invoker = true) as
with stock as (
  select m.location_id, m.material_id, sum(m.qty_base) as qty_base
  from public.raw_movements m
  group by m.location_id, m.material_id
),
usage as (
  select m.location_id, m.material_id, greatest(0, -sum(m.qty_base)) / 14.0 as avg_daily_issue
  from public.raw_movements m
  where m.movement_type in ('issue', 'count_adjustment') and m.occurred_at >= now() - interval '14 days'
  group by m.location_id, m.material_id
)
select
  rm.id as material_id,
  stock.location_id,
  coalesce(stock.qty_base, 0) as qty_base,
  rm.min_qty,
  rm.base_unit,
  round(coalesce(usage.avg_daily_issue, 0), 3) as avg_daily_issue,
  case when coalesce(usage.avg_daily_issue, 0) > 0
       then floor(coalesce(stock.qty_base, 0) / usage.avg_daily_issue)::int
  end as days_left,
  coalesce(stock.qty_base, 0) < rm.min_qty as below_min
from public.raw_materials rm
left join stock on stock.material_id = rm.id
left join usage on usage.material_id = rm.id and usage.location_id = stock.location_id
where rm.is_active;

-- ─── جرد المواد اليومي ────────────────────────────────────────────────
-- نفس آلية جرد آخر الشهر (التذكير و"متأخر" والبانر)، بس كل يوم.
alter table public.monthly_counts add column every_day boolean not null default false;

-- نفس الـ view (20261104100000) مع every_day بالآخر: الجرد اليومي مستحق كل يوم.
create or replace view public.v_monthly_counts_today with (security_invoker = true) as
with due as (
  select mc.id, mc.location_id, mc.scope, mc.time_of_day, t.day, mc.every_day,
         private.slot_at(t.day, mc.time_of_day) as slot_at
  from public.monthly_counts mc
  cross join (select public.count_day_today() as day) t
  join public.locations l on l.id = mc.location_id and l.is_active
  where mc.is_active
    and private.can_see_location(mc.location_id)
    and (mc.every_day or t.day = (date_trunc('month', t.day) + interval '1 month - 1 day')::date)
),
checked as (
  select d.*, private.monthly_count_done(d.location_id, d.scope, d.day, d.slot_at) as done from due d
)
select
  c.id,
  c.location_id,
  c.scope,
  c.time_of_day,
  c.slot_at,
  c.done,
  case
    when c.done then 'done'
    when now() >= c.slot_at + make_interval(mins => s.count_late_after_minutes) then 'late'
    when now() >= c.slot_at - make_interval(mins => s.count_reminder_minutes_before) then 'due'
    else 'upcoming'
  end as status,
  c.every_day
from checked c
cross join public.app_settings s;

-- جرد المواد بالمصنع صار كل يوم (الساعة بتنعدّل من الإعدادات)
insert into public.monthly_counts (location_id, scope, time_of_day, every_day)
select l.id, 'raw', '20:00', true
from public.locations l where l.kind = 'factory' and l.is_active
on conflict (location_id, scope) do update set every_day = true, is_active = true;
