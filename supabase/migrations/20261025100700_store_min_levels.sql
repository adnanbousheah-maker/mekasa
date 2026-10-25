-- ملاحظات ميكاسا (25 أكتوبر 2026): الحد الأدنى كمان للمصنع (الكيك) ولمستودع التغليف (مواد التغليف)،
-- مش بس للفروع. نفس الأعمدة، فبينعمل replace بدون حذف.
create or replace view public.v_below_min with (security_invoker = true) as
select
  pl.location_id,
  pl.product_id,
  coalesce(st.qty_pieces, 0) as qty_pieces,
  pl.min_pieces
from public.par_levels pl
join public.locations l on l.id = pl.location_id and l.kind in ('branch', 'factory', 'packaging') and l.is_active
-- الكيك بالفروع والمصنع، والتغليف بالمستودع
join public.products p on p.id = pl.product_id and p.is_active
  and p.kind = case when l.kind = 'packaging' then 'packaging' else 'cake' end::public.product_kind
left join public.v_stock_by_product st on st.location_id = pl.location_id and st.product_id = pl.product_id
where pl.min_pieces is not null
  and coalesce(st.qty_pieces, 0) < pl.min_pieces;
