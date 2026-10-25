-- ملاحظات ميكاسا (25 أكتوبر 2026): حد أدنى لكل صنف بكل فرع، وتنبيه لما الموجود ينزل تحته،
-- وتنبيه للمدير لما فرع ينسى يطلب صنف مقترح.

-- null = ما في حد أدنى لهالصنف بهالفرع
alter table public.par_levels
  add column min_pieces int check (min_pieces is null or min_pieces >= 0);

alter type public.notification_kind add value if not exists 'below_min';
alter type public.notification_kind add value if not exists 'order_missing_item';

-- إشعارات الصنف والطلب بسجل لحاله (السجل القديم فريد على (kind, schedule_id, slot_date, dispatch_id)
-- بدون الصنف، وتغيير قيده بيحتاج حذف). كل إشعار بينحجز هون قبل ما ينبعت، مرة وحدة بس:
-- تحت الحد الأدنى مرة لكل فرع وصنف باليوم، والصنف المنسي مرة لكل طلب. الكرون (service role) بس.
create table public.alert_log (
  id uuid primary key default gen_random_uuid(),
  kind public.notification_kind not null,
  location_id uuid references public.locations (id),
  product_id uuid references public.products (id),
  request_id uuid references public.stock_requests (id),
  slot_date date,
  sent_at timestamptz not null default now(),
  constraint alert_log_once unique nulls not distinct (kind, location_id, product_id, request_id, slot_date)
);

alter table public.alert_log enable row level security;
revoke all on public.alert_log from anon, authenticated;

-- الأصناف اللي موجودها بالفرع تحت الحد الأدنى (الموجود = مجموع الحركات)
create view public.v_below_min with (security_invoker = true) as
select
  pl.location_id,
  pl.product_id,
  coalesce(st.qty_pieces, 0) as qty_pieces,
  pl.min_pieces
from public.par_levels pl
join public.locations l on l.id = pl.location_id and l.kind = 'branch' and l.is_active
join public.products p on p.id = pl.product_id and p.is_active
left join public.v_stock_by_product st on st.location_id = pl.location_id and st.product_id = pl.product_id
where pl.min_pieces is not null
  and coalesce(st.qty_pieces, 0) < pl.min_pieces;

revoke all on public.v_below_min from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_below_min from authenticated;
