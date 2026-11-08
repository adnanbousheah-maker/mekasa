-- 8 نوفمبر 2026: الموقع اللي لسا ما انجرد ستوكه صفر بالدفتر، فكان كل صنف فيه "تحت الحد الأدنى"
-- (بانر أحمر وتنبيهات لكل الموظفين قبل أول جرد). هلا الحد الأدنى بينفحص بس بعد أول جرد مؤكد
-- للكيك أو التغليف بالموقع (الرصيد الافتتاحي). نفس الأعمدة (create or replace).

create or replace view public.v_below_min with (security_invoker = true) as
select
  pl.location_id,
  pl.product_id,
  case
    when l.kind = 'factory' then coalesce(fb.qty, 0)
    else coalesce(st.qty_pieces, 0)::bigint
  end::int as qty_pieces,
  pl.min_pieces
from public.par_levels pl
join public.locations l
  on l.id = pl.location_id and l.kind in ('branch', 'factory', 'packaging') and l.is_active
join public.products p
  on p.id = pl.product_id and p.is_active
 and p.kind = (case when l.kind = 'packaging' then 'packaging' else 'cake' end)::public.product_kind
left join public.v_stock_by_product st
  on st.location_id = pl.location_id and st.product_id = pl.product_id
left join lateral (
  select sum(b.qty_pieces) as qty
  from public.v_factory_batches b
  where b.location_id = pl.location_id and b.product_id = pl.product_id and not b.is_expired
) fb on l.kind = 'factory'
where pl.min_pieces is not null
  and case
        when l.kind = 'factory' then coalesce(fb.qty, 0)
        else coalesce(st.qty_pieces, 0)::bigint
      end < pl.min_pieces
  and exists (
    select 1 from public.stock_counts c
    where c.location_id = pl.location_id and c.status = 'confirmed' and c.scope = 'stock'
  );
