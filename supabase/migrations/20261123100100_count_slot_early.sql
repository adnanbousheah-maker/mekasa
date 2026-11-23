-- 23 نوفمبر 2026: جرد انعمل قبل موعده بأكثر من ساعة ما كان ينربط بالموعد، فالموعد كان يطلع "متأخر"
-- مع إنه الموقع جرد اليوم. هلا الموعد بينحسب "انعمل" إذا في جرد مربوط فيه، أو جرد كيك مؤكد مش مربوط
-- بنفس يوم الجرد بلّش قبل الموعد وبعد الموعد اللي قبله (نفس المنطق بـ doneScheduleIds بـ reminders/slots.ts).
create or replace view public.v_count_slots_today
with (security_invoker = true) as
with slots as (
  select cs.id as schedule_id,
    cs.location_id,
    cs.time_of_day,
    private.slot_at(public.count_day_today(), cs.time_of_day) as slot_at
  from public.count_schedules cs
  where cs.is_active and private.can_see_location(cs.location_id)
), ordered as (
  select sl.*, lag(sl.slot_at) over (partition by sl.location_id order by sl.slot_at) as prev_at
  from slots sl
)
select o.schedule_id,
  o.location_id,
  o.time_of_day,
  o.slot_at,
  c.id as count_id,
  c.confirmed_at,
  case
    when c.id is not null then 'done'
    when now() >= o.slot_at + make_interval(mins => s.count_late_after_minutes::int) then 'late'
    when now() >= o.slot_at - make_interval(mins => s.count_reminder_minutes_before::int) then 'due'
    else 'upcoming'
  end as status
from ordered o
cross join public.app_settings s
left join lateral (
  select sc.id, sc.confirmed_at
  from public.stock_counts sc
  where sc.location_id = o.location_id
    and sc.business_date = public.count_day_today()
    and sc.status = 'confirmed'
    and (sc.schedule_id = o.schedule_id
      or (sc.schedule_id is null and sc.scope = 'stock' and sc.started_at < o.slot_at
          and (o.prev_at is null or sc.started_at >= o.prev_at)))
  order by (sc.schedule_id is null), sc.started_at desc
  limit 1
) c on true;
