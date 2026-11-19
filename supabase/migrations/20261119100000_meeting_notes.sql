-- 19 نوفمبر 2026: ملاحظات اجتماع 18 نوفمبر (الخطة: docs/plan-2026-11-19.md).
-- 1) رقم اليوم: الأحد 1 … السبت 7.  2) صورة التالف إجبارية.  3) الحد الأدنى للفروع حسب اليوم.
-- 4) Caramel Crunch و Nutty Caramel نفس الصنف (بالسحابة بس، محلياً ما في Nutty Caramel).

-- ─── 1) رقم اليوم ─────────────────────────────────────────────────────
-- لازم يطابق src/lib/day-number.ts. isodow: الاثنين 1 … الأحد 7.
create or replace function public.day_number(d date)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select (extract(isodow from d)::int % 7 + 1)::smallint
$$;

-- batches.day_number عمود محسوب ومخزّن: بنعيد حسابه للدفعات الموجودة
-- (triggers الحماية والتاريخ بتنطفي بس لهالتحديث).
set local session_replication_role = replica;
update public.batches set production_date = production_date;
set local session_replication_role = origin;

-- ─── 2) صورة التالف إجبارية ──────────────────────────────────────────
-- نفس الدالة (20261108100300) مع فحص الصورة بأولها. التالف من التوصيل (record_waste مباشرة) ما بيتأثر.
create or replace function public.log_waste(
  p_location_id uuid,
  p_product_id uuid,
  p_unit public.entry_unit,
  p_qty int,
  p_reason_id uuid,
  p_note text default null,
  p_production_date date default null,
  p_photo_path text default null
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
  return record_id;
end;
$$;

-- ─── 3) الحد الأدنى للفروع حسب اليوم ────────────────────────────────
-- weekday نفس رقم اليوم: 1 الأحد … 7 السبت. فراغ (null) = الحد العام بـ par_levels.min_pieces.
create table public.par_level_daily_min (
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  weekday smallint not null check (weekday between 1 and 7),
  min_pieces int check (min_pieces between 0 and 99999),
  updated_by uuid references public.staff (id),
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id, weekday)
);

alter table public.par_level_daily_min enable row level security;

create policy "staff read their daily minimums" on public.par_level_daily_min
  for select to authenticated using (private.can_see_location(location_id));
create policy "admin adds daily minimums" on public.par_level_daily_min
  for insert to authenticated with check (private.is_admin());
create policy "admin edits daily minimums" on public.par_level_daily_min
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- الحد اليومي للفروع بس
create function private.daily_min_branch_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.locations l where l.id = new.location_id and l.kind = 'branch') then
    raise exception 'daily minimums are for branches only' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger par_level_daily_min_branch_only
before insert or update on public.par_level_daily_min
for each row execute function private.daily_min_branch_only();

create trigger par_level_daily_min_touch_updated_at
before update on public.par_level_daily_min
for each row execute function private.touch_updated_at();

create trigger par_level_daily_min_audit after insert or update on public.par_level_daily_min
  for each row execute function private.audit_row('location_id', 'product_id', 'weekday');

-- نفس الأعمدة (create or replace). الحد = حد يوم الجرد (اللي بيخلص 5 الصبح) إذا موجود، وإلا الحد العام.
-- الأسطر من par_levels (كل صنف بالفرع إله سطر، والإعدادات بتعمله إذا ناقص)، مشان PostgREST
-- يضل يعرف العلاقة مع locations و products.
create or replace view public.v_below_min with (security_invoker = true) as
select
  pl.location_id,
  pl.product_id,
  case
    when l.kind = 'factory' then coalesce(fb.qty, 0)
    else coalesce(st.qty_pieces, 0)::bigint
  end::int as qty_pieces,
  coalesce(d.min_pieces, pl.min_pieces) as min_pieces
from public.par_levels pl
join public.locations l
  on l.id = pl.location_id and l.kind in ('branch', 'factory', 'packaging') and l.is_active
join public.products p
  on p.id = pl.product_id and p.is_active
 and p.kind = (case when l.kind = 'packaging' then 'packaging' else 'cake' end)::public.product_kind
left join public.par_level_daily_min d
  on d.location_id = pl.location_id and d.product_id = pl.product_id
 and d.weekday = public.day_number(public.count_day_today())
left join public.v_stock_by_product st
  on st.location_id = pl.location_id and st.product_id = pl.product_id
left join lateral (
  select sum(b.qty_pieces) as qty
  from public.v_factory_batches b
  where b.location_id = pl.location_id and b.product_id = pl.product_id and not b.is_expired
) fb on l.kind = 'factory'
where coalesce(d.min_pieces, pl.min_pieces) is not null
  and case
        when l.kind = 'factory' then coalesce(fb.qty, 0)
        else coalesce(st.qty_pieces, 0)::bigint
      end < coalesce(d.min_pieces, pl.min_pieces)
  and exists (
    select 1 from public.stock_counts c
    where c.location_id = pl.location_id and c.status = 'confirmed' and c.scope = 'stock'
  );

-- ─── 4) Nutty Caramel = Caramel Crunch ───────────────────────────────
-- بنوقّف Nutty Caramel (الإيقاف مش حذف)، وحدوده بتنتقل لـ Caramel Crunch إذا ما إله حد.
insert into public.par_levels (location_id, product_id, par_pieces, min_pieces)
select pl.location_id, cc.id, pl.par_pieces, pl.min_pieces
from public.par_levels pl
join public.products nc on nc.id = pl.product_id and nc.name_en = 'Nutty Caramel'
join public.products cc on cc.name_en = 'Caramel Crunch' and cc.kind = 'cake'
on conflict (location_id, product_id) do nothing;

update public.products set is_active = false where name_en = 'Nutty Caramel' and is_active;
