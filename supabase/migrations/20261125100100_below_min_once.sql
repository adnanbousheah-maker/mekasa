-- 25 نوفمبر 2026 (docs/perf-2026-11.md): v_below_min كان يحسب ستوك دفعات المصنع لكل صنف لحاله
-- (LATERAL على v_factory_batches، 26 مرة) = 2–3 ثواني. هلا بينحسب مرة وحدة مجمّع حسب الموقع والصنف.
-- نفس الأعمدة ونفس النتيجة.
create or replace view public.v_below_min
with (security_invoker = true) as
with fb as (
  select b.location_id, b.product_id, sum(b.qty_pieces) as qty
  from public.v_factory_batches b
  where not b.is_expired
  group by b.location_id, b.product_id
)
select pl.location_id,
  pl.product_id,
  (case when l.kind = 'factory' then coalesce(fb.qty, 0) else coalesce(st.qty_pieces, 0)::bigint end)::integer as qty_pieces,
  coalesce(d.min_pieces, pl.min_pieces) as min_pieces
from public.par_levels pl
join public.locations l
  on l.id = pl.location_id and l.kind = any (array['branch', 'factory', 'packaging']::public.location_kind[]) and l.is_active
join public.products p
  on p.id = pl.product_id and p.is_active
 and p.kind = (case when l.kind = 'packaging' then 'packaging' else 'cake' end)::public.product_kind
left join public.par_level_daily_min d
  on d.location_id = pl.location_id and d.product_id = pl.product_id
 and d.weekday = public.day_number(public.count_day_today())
left join public.v_stock_by_product st
  on st.location_id = pl.location_id and st.product_id = pl.product_id
left join fb
  on l.kind = 'factory' and fb.location_id = pl.location_id and fb.product_id = pl.product_id
where coalesce(d.min_pieces, pl.min_pieces) is not null
  and (case when l.kind = 'factory' then coalesce(fb.qty, 0) else coalesce(st.qty_pieces, 0)::bigint end)
      < coalesce(d.min_pieces, pl.min_pieces)
  and exists (
    select 1 from public.stock_counts c
    where c.location_id = pl.location_id and c.status = 'confirmed' and c.scope = 'stock'
  );
