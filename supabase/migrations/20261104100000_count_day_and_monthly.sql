-- ملاحظات 4 نوفمبر 2026:
-- 1) يوم الجرد بيخلص الساعة 5 الصبح: جرد الساعة 12:40 بالليل تبع اليوم اللي قبله (الجبيهة ودابوق بيسكروا بعد نص الليل).
--    بس الجرد ومواعيده بيمشوا على هاليوم. الدفعات والطلبات والتالف ضلوا على تاريخ عمّان العادي.
-- 2) جرد آخر الشهر لكل موقع: الكيك (أو التغليف بالمستودع) بكل موقع، والمواد الأولية بالمصنع.
--    تذكير بآخر يوم بالشهر بالساعة اللي بيحددها الأدمن، و"متأخر" للأدمن.

-- ─── يوم الجرد ───────────────────────────────────────────────────────

create function private.count_day(at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select ((at at time zone 'Asia/Amman') - interval '5 hours')::date
$$;

create function public.count_day_today()
returns date
language sql
stable
set search_path = ''
as $$
  select private.count_day(now())
$$;

revoke execute on function private.count_day(timestamptz), public.count_day_today() from public, anon;
grant execute on function private.count_day(timestamptz), public.count_day_today() to authenticated, service_role;

-- الجرد بينسجل على يوم بدايته (بعد 5 الصبح)، مهما كتبت الدالة اللي سجلته
create function private.set_count_business_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.business_date := private.count_day(new.started_at);
  return new;
end;
$$;

create trigger stock_counts_business_day before insert on public.stock_counts
  for each row execute function private.set_count_business_day();
create trigger raw_counts_business_day before insert on public.raw_counts
  for each row execute function private.set_count_business_day();

-- موعد قبل 5 الصبح تبع آخر يوم الجرد (بعد نص الليل)
create function private.slot_at(day date, time_of_day time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (day + time_of_day + case when time_of_day < time '05:00' then interval '1 day' else interval '0' end)
         at time zone 'Asia/Amman'
$$;

revoke execute on function private.slot_at(date, time) from public, anon;
grant execute on function private.slot_at(date, time) to authenticated, service_role;

-- نفس الـ view (20261023100800)، بس على يوم الجرد
create or replace view public.v_count_slots_today with (security_invoker = true) as
with slots as (
  select
    cs.id as schedule_id,
    cs.location_id,
    cs.time_of_day,
    private.slot_at(public.count_day_today(), cs.time_of_day) as slot_at
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
 and c.business_date = public.count_day_today()
 and c.status = 'confirmed';

-- ─── جرد آخر الشهر ───────────────────────────────────────────────────

alter type public.notification_kind add value if not exists 'monthly_count_reminder';
alter type public.notification_kind add value if not exists 'monthly_count_late';
alter type public.notification_kind add value if not exists 'monthly_raw_reminder';
alter type public.notification_kind add value if not exists 'monthly_raw_late';

-- stock = جرد الكيك الكامل (أو التغليف بالمستودع)، raw = المواد الأولية (المصنع بس)
create table public.monthly_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  scope text not null check (scope in ('stock', 'raw')),
  time_of_day time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, scope)
);

alter table public.monthly_counts enable row level security;

create policy "active staff read monthly counts" on public.monthly_counts
  for select to authenticated using (private.is_active_staff());
create policy "admin adds monthly counts" on public.monthly_counts
  for insert to authenticated with check (private.is_admin());
create policy "admin edits monthly counts" on public.monthly_counts
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create trigger monthly_counts_audit after insert or update on public.monthly_counts
  for each row execute function private.audit_row();

-- المواد الأولية بالمصنع بس، والمرتجعات ما بتنجرد
create function private.check_monthly_count()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kind public.location_kind := (select l.kind from public.locations l where l.id = new.location_id);
begin
  if kind not in ('branch', 'factory', 'packaging') or (new.scope = 'raw' and kind <> 'factory') then
    raise exception 'this place has no such monthly count' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger monthly_counts_check before insert or update on public.monthly_counts
  for each row execute function private.check_monthly_count();

-- جرد آخر الشهر اليوم (بيرجع صفوف بس بآخر يوم بالشهر): الموعد، وإذا انعمل، والحالة
create view public.v_monthly_counts_today with (security_invoker = true) as
with today as (
  select public.count_day_today() as day
),
due as (
  select mc.id, mc.location_id, mc.scope, mc.time_of_day, t.day,
         private.slot_at(t.day, mc.time_of_day) as slot_at
  from public.monthly_counts mc
  cross join today t
  join public.locations l on l.id = mc.location_id and l.is_active
  where mc.is_active
    and private.can_see_location(mc.location_id)
    and t.day = (date_trunc('month', t.day) + interval '1 month - 1 day')::date
)
select
  d.id,
  d.location_id,
  d.scope,
  d.time_of_day,
  d.slot_at,
  case
    when d.scope = 'raw' then exists (
      select 1 from public.raw_counts r
      where r.location_id = d.location_id and r.business_date = d.day and r.status = 'confirmed')
    else exists (
      select 1 from public.stock_counts c
      where c.location_id = d.location_id and c.business_date = d.day and c.status = 'confirmed')
  end as done,
  case
    when (case
            when d.scope = 'raw' then exists (
              select 1 from public.raw_counts r
              where r.location_id = d.location_id and r.business_date = d.day and r.status = 'confirmed')
            else exists (
              select 1 from public.stock_counts c
              where c.location_id = d.location_id and c.business_date = d.day and c.status = 'confirmed')
          end) then 'done'
    when now() >= d.slot_at + make_interval(mins => s.count_late_after_minutes) then 'late'
    when now() >= d.slot_at - make_interval(mins => s.count_reminder_minutes_before) then 'due'
    else 'upcoming'
  end as status
from due d
cross join public.app_settings s;

revoke all on public.v_monthly_counts_today from anon;
