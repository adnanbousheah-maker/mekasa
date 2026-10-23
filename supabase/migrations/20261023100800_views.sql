-- Views للقراءة. كلها security_invoker، يعني بتمشي على RLS تبع اللي بيقرأ،
-- إلا v_staff_names (موضحة تحت).

-- ─── الأصناف مع عدد القطع الفعلي ─────────────────────────────────────

create view public.v_products with (security_invoker = true) as
select
  p.*,
  case when p.sell_mode = 'pieces_only' then null
       else coalesce(p.pieces_per_cake, s.default_pieces_per_cake)
  end as effective_pieces_per_cake
from public.products p
cross join public.app_settings s;

-- ─── الستوك ──────────────────────────────────────────────────────────

-- الستوك الحالي = مجموع الحركات، لكل موقع وصنف ودفعة
create view public.v_stock_current with (security_invoker = true) as
select
  m.location_id,
  m.product_id,
  m.batch_id,
  sum(m.qty_pieces)::int as qty_pieces,
  max(m.occurred_at) as last_movement_at
from public.stock_movements m
group by m.location_id, m.product_id, m.batch_id
having sum(m.qty_pieces) <> 0;

-- نفسه بس مجموع كل الدفعات (لوحة الستوك)
create view public.v_stock_by_product with (security_invoker = true) as
select
  m.location_id,
  m.product_id,
  sum(m.qty_pieces)::int as qty_pieces,
  max(m.occurred_at) as last_movement_at
from public.stock_movements m
group by m.location_id, m.product_id
having sum(m.qty_pieces) <> 0;

-- دفعات المصنع: العمر، رقم اليوم، وآخر يوم إلها
create view public.v_factory_batches with (security_invoker = true) as
select
  b.id as batch_id,
  b.product_id,
  b.production_date,
  b.day_number,
  st.location_id,
  st.qty_pieces,
  public.amman_today() - b.production_date as age_days,
  b.production_date + s.factory_shelf_life_days as expires_on,
  public.amman_today() - b.production_date = s.factory_shelf_life_days - 1 as is_last_day,
  public.amman_today() - b.production_date >= s.factory_shelf_life_days as is_expired
from public.batches b
join public.v_stock_current st on st.batch_id = b.id
cross join public.app_settings s;

-- ─── الاستهلاك ───────────────────────────────────────────────────────

-- الاستهلاك بكل جرد بالفروع = سالب حركات "تعديل الجرد" على أسطره.
-- بيشمل تصحيحات الأدمن لأنها بتنربط بنفس الأسطر. الموجب = رقم مستحيل.
create view public.v_count_consumption with (security_invoker = true) as
select
  c.id as count_id,
  c.location_id,
  c.business_date,
  c.started_at,
  l.product_id,
  -coalesce(sum(m.qty_pieces), 0)::int as consumed_pieces
from public.stock_counts c
join public.locations loc on loc.id = c.location_id and loc.kind = 'branch'
join public.stock_count_lines l on l.count_id = c.id
left join public.stock_movements m on m.count_line_id = l.id and m.movement_type = 'count_adjustment'
where c.status = 'confirmed' and not c.is_opening
group by c.id, c.location_id, c.business_date, c.started_at, l.product_id;

-- ─── مواعيد جرد اليوم ────────────────────────────────────────────────

-- حالة كل موعد اليوم: done تم، late متأخر، due وقته (التذكير)، upcoming لسا
create view public.v_count_slots_today with (security_invoker = true) as
with slots as (
  select
    cs.id as schedule_id,
    cs.location_id,
    cs.time_of_day,
    (public.amman_today() + cs.time_of_day) at time zone 'Asia/Amman' as slot_at
  from public.count_schedules cs
  where cs.is_active and private.can_see_location(cs.location_id)
)
select
  slots.*,
  c.id as count_id,
  c.confirmed_at,
  case
    when c.id is not null then 'done'
    when now() >= slots.slot_at + make_interval(mins => s.count_late_after_minutes) then 'late'
    when now() >= slots.slot_at - make_interval(mins => s.count_reminder_minutes_before) then 'due'
    else 'upcoming'
  end as status
from slots
cross join public.app_settings s
left join public.stock_counts c
  on c.schedule_id = slots.schedule_id
 and c.business_date = public.amman_today()
 and c.status = 'confirmed';

-- ─── الإخراج اللي ما انستلم ──────────────────────────────────────────

create view public.v_unreceived_dispatches with (security_invoker = true) as
select
  d.*,
  round((extract(epoch from now() - d.dispatched_at) / 3600)::numeric, 1) as hours_in_transit,
  now() - d.dispatched_at > make_interval(hours => s.unreceived_alert_hours) as is_overdue
from public.dispatches d
cross join public.app_settings s
where d.status = 'in_transit';

-- ─── المواد الأولية ──────────────────────────────────────────────────

-- الموجود، والصرف اليومي بآخر 14 يوم، وبيكفي كم يوم
create view public.v_raw_stock with (security_invoker = true) as
with stock as (
  select m.location_id, m.material_id, sum(m.qty_base) as qty_base
  from public.raw_movements m
  group by m.location_id, m.material_id
),
usage as (
  select m.location_id, m.material_id, -sum(m.qty_base) / 14.0 as avg_daily_issue
  from public.raw_movements m
  where m.movement_type = 'issue' and m.occurred_at >= now() - interval '14 days'
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

-- ─── أسماء الموظفين ──────────────────────────────────────────────────

-- الموظفين بيحتاجوا يشوفوا أسماء بعض ("طلبتها رنا")، بس مش أرقام الجوالات.
-- هالـ view بصلاحيات صاحبها عن قصد، وبيرجع الاسم والموقع بس، ولموظف فعّال بس.
create view public.v_staff_names with (security_barrier = true) as
select s.id, s.full_name, s.location_id
from public.staff s
where private.is_active_staff();

revoke all on public.v_staff_names from anon;
grant select on public.v_staff_names to authenticated;

-- view بسيط بيقبل كتابة تلقائياً، وبصلاحيات صاحبه كانت رح تتخطى RLS على staff.
-- الـ revoke فوق كافي، وهالـ trigger احتياط لو انعمل الـ view من جديد ورجعت الصلاحيات.
create trigger v_staff_names_read_only
instead of insert or update or delete on public.v_staff_names
for each row execute function private.forbid_modification();

-- الـ views الجديدة: نفس قواعد الجداول
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on
  public.v_products, public.v_stock_current, public.v_stock_by_product, public.v_factory_batches,
  public.v_count_consumption, public.v_count_slots_today, public.v_unreceived_dispatches,
  public.v_raw_stock, public.v_staff_names
from authenticated;
