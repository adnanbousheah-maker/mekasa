-- المرحلة ز (8 نوفمبر 2026): المهام المتكررة (تنظيف الثلاجة، فحص الحرارة، …).
-- الأدمن بيعمل "قالب مهمة": مين بيعملها (دور)، وين (مواقع، أو كل الفروع)، إيمتى (كل يوم، أيام
-- بالأسبوع، يوم بالشهر) والساعة، وإذا لازم صورة. الموظف بيعلّمها "انعملت" مرة لكل يوم جرد.
-- الإنجاز سجل ما بيتعدل (append-only متل باقي المستندات).

-- ─── الصور ───────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter policy "staff upload location photos" on storage.objects
  with check (
    bucket_id in ('count-photos', 'waste-photos', 'invoices', 'task-photos')
    and private.can_use_location_folder(name)
  );
alter policy "staff read location photos" on storage.objects
  using (
    bucket_id in ('count-photos', 'waste-photos', 'invoices', 'task-photos')
    and private.can_use_location_folder(name)
  );

-- ─── القوالب ─────────────────────────────────────────────────────────

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 80),
  description text check (description is null or length(description) <= 300),
  -- null = كل الفروع الفعّالة
  location_ids uuid[],
  role public.app_role not null default 'branch_staff',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'monthly')),
  -- أرقام الأيام متل باقي التطبيق: السبت 1 … الجمعة 7
  weekdays smallint[] check (weekdays is null or weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  -- 31 = آخر يوم بالشهر لما الشهر أقصر
  month_day smallint check (month_day is null or month_day between 1 and 31),
  due_time time not null default '12:00',
  requires_photo boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff (id) default auth.uid(),
  constraint task_weekly_has_days check (frequency <> 'weekly' or coalesce(cardinality(weekdays), 0) > 0),
  constraint task_monthly_has_day check (frequency <> 'monthly' or month_day is not null)
);

alter table public.task_templates enable row level security;
create policy "active staff read task templates" on public.task_templates
  for select to authenticated using (private.is_active_staff());
create policy "admin adds task templates" on public.task_templates
  for insert to authenticated with check (private.is_admin());
create policy "admin edits task templates" on public.task_templates
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create trigger task_templates_audit after insert or update on public.task_templates
  for each row execute function private.audit_row();

-- ─── الإنجاز ─────────────────────────────────────────────────────────

create table public.task_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates (id),
  location_id uuid not null references public.locations (id),
  due_date date not null,
  done_at timestamptz not null default now(),
  done_by uuid not null references public.staff (id),
  note text check (note is null or length(note) <= 300),
  photo_path text,
  unique (template_id, location_id, due_date)
);

alter table public.task_runs enable row level security;
create policy "staff read task runs at their location" on public.task_runs
  for select to authenticated using (private.can_see_location(location_id));

create trigger task_runs_immutable before update or delete on public.task_runs
  for each row execute function private.forbid_modification();

-- رقم اليوم: السبت 1 … الجمعة 7
create function private.day_number(d date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select ((extract(dow from d)::int + 1) % 7 + 1)::smallint
$$;

create function private.task_due_on(t public.task_templates, d date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case t.frequency
    when 'daily' then true
    when 'weekly' then private.day_number(d) = any (t.weekdays)
    else extract(day from d)::int = t.month_day
      or (t.month_day > extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int
          and d = (date_trunc('month', d) + interval '1 month - 1 day')::date)
  end
$$;

revoke execute on function private.day_number(date), private.task_due_on(public.task_templates, date) from public, anon;
grant execute on function private.day_number(date), private.task_due_on(public.task_templates, date) to authenticated, service_role;

-- مهام يوم الجرد الحالي لكل موقع (بيشوف كل واحد مواقعه بس، RLS)
create view public.v_tasks_today with (security_invoker = true) as
with today as (select public.count_day_today() as d)
select
  t.id as template_id,
  t.title,
  t.description,
  t.role,
  t.requires_photo,
  t.due_time,
  t.sort_order,
  l.id as location_id,
  l.name as location_name,
  (select d from today) as due_date,
  private.slot_at((select d from today), t.due_time) as due_at,
  r.id as run_id,
  r.done_at,
  r.done_by,
  r.note,
  r.photo_path,
  case
    when r.id is not null then 'done'
    when now() > private.slot_at((select d from today), t.due_time)
      + make_interval(mins => (select a.count_late_after_minutes from public.app_settings a)) then 'late'
    else 'open'
  end as status
from public.task_templates t
join public.locations l
  on l.is_active
 and (t.location_ids is null and l.kind = 'branch' or l.id = any (t.location_ids))
left join public.task_runs r
  on r.template_id = t.id and r.location_id = l.id and r.due_date = (select d from today)
where t.is_active and private.task_due_on(t, (select d from today)) and private.can_see_location(l.id);

-- الموظف بيعلّم مهمة موقعه "انعملت" (مرة باليوم)
create function public.complete_task(p_template_id uuid, p_note text default null, p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.task_templates;
  loc uuid := private.my_location_id();
  today date := public.count_day_today();
  run_id uuid;
begin
  select * into t from public.task_templates x where x.id = p_template_id and x.is_active;
  if t.id is null or loc is null
     or not exists (
       select 1 from public.locations l
       where l.id = loc and l.is_active
         and (t.location_ids is null and l.kind = 'branch' or l.id = any (t.location_ids))
     )
     or not private.task_due_on(t, today) then
    raise exception 'this task is not due here today' using errcode = 'check_violation';
  end if;
  if not private.has_role(t.role) then
    raise exception 'this task is for another role' using errcode = 'insufficient_privilege';
  end if;
  if t.requires_photo and coalesce(p_photo_path, '') = '' then
    raise exception 'this task needs a photo' using errcode = 'check_violation', hint = 'photo_required';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> loc::text then
    raise exception 'the photo must be in your location folder' using errcode = 'check_violation';
  end if;

  insert into public.task_runs (template_id, location_id, due_date, done_by, note, photo_path)
  values (t.id, loc, today, (select auth.uid()), nullif(trim(p_note), ''), nullif(p_photo_path, ''))
  on conflict (template_id, location_id, due_date) do nothing
  returning id into run_id;
  if run_id is null then
    raise exception 'already done today' using errcode = 'unique_violation', hint = 'already_done';
  end if;
  return run_id;
end;
$$;

revoke execute on function public.complete_task(uuid, text, text) from public, anon;
grant execute on function public.complete_task(uuid, text, text) to authenticated;

-- الالتزام بالمهام بفترة: لكل موقع، قديش مطلوب وقديش انعمل وبوقته (RLS بتحدد المواقع)
create function public.report_tasks(p_from date, p_to date)
returns table (location_id uuid, expected int, done int, on_time int)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  today date := public.count_day_today();
begin
  perform private.report_range_ok(p_from, p_to);
  return query
  with due as (
    select t.id as template_id, t.due_time, l.id as loc, d::date as day
    from public.task_templates t
    join public.locations l
      on l.is_active
     and (t.location_ids is null and l.kind = 'branch' or l.id = any (t.location_ids))
    cross join generate_series(p_from, least(p_to, today), interval '1 day') d
    where t.is_active
      and d::date >= private.count_day(t.created_at)
      and private.task_due_on(t, d::date)
      and private.slot_at(d::date, t.due_time) <= now()
      and private.can_see_location(l.id)
  )
  select due.loc,
    count(*)::int,
    count(r.id)::int,
    count(r.id) filter (
      where r.done_at <= private.slot_at(due.day, due.due_time)
        + make_interval(mins => (select a.count_late_after_minutes from public.app_settings a))
    )::int
  from due
  left join public.task_runs r
    on r.template_id = due.template_id and r.location_id = due.loc and r.due_date = due.day
  group by due.loc;
end;
$$;

revoke execute on function public.report_tasks(date, date) from public, anon;
grant execute on function public.report_tasks(date, date) to authenticated;
