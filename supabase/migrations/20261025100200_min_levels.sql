-- ملاحظات ميكاسا (25 أكتوبر 2026): حد أدنى لكل صنف بكل فرع، وتنبيه لما الموجود ينزل تحته،
-- وتنبيه للمدير لما فرع ينسى يطلب صنف مقترح.

-- null = ما في حد أدنى لهالصنف بهالفرع
alter table public.par_levels
  add column min_pieces int check (min_pieces is null or min_pieces >= 0);

alter type public.notification_kind add value if not exists 'below_min';
alter type public.notification_kind add value if not exists 'order_missing_item';

-- الإشعار بيتحدد كمان بالصنف والطلب (تحت الحد الأدنى: مرة لكل فرع وصنف باليوم)
alter table public.notification_log
  add column product_id uuid references public.products (id),
  add column request_id uuid references public.stock_requests (id);
alter table public.notification_log
  drop constraint notification_log_kind_schedule_id_slot_date_dispatch_id_key;
alter table public.notification_log
  add constraint notification_log_once unique nulls not distinct
    (kind, schedule_id, slot_date, dispatch_id, location_id, product_id, request_id);

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
