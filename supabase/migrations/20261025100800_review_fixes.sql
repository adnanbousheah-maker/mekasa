-- مراجعة 25 أكتوبر 2026:
-- 1) الطلبية المقترحة: اليوم بيدخل بمعدل الصنف بس إذا الصنف كان موجود بالفرع (انعدّ منه أو كان متوقع إله ستوك).
--    قبل: صنف جديد أو خالص كان معدله صفر، فالاقتراح صفر للأبد وما بيرجع للحد المطلوب.
-- 2) الحد الأدنى بالمصنع بيحسب الدفعات اللي مش منتهية بس (المنتهي ما بيطلع).

create or replace function public.branch_suggestions(p_branch_id uuid)
returns table (product_id uuid, stock_pieces int, par_pieces int, avg_pieces int, days_used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tomorrow date := public.amman_today() + 1;
  days date[] := array[tomorrow - 7, tomorrow - 14, tomorrow - 21, tomorrow - 28];
begin
  if not (
    private.is_admin()
    or (private.has_role('branch_staff') and private.my_location_id() = p_branch_id)
    or (private.has_role('dispatcher')
        and exists (select 1 from public.locations l where l.id = private.my_location_id() and l.kind = 'factory'))
  ) then
    raise exception 'you cannot see this branch' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id,
         coalesce((select sum(m.qty_pieces) from public.stock_movements m
                   where m.location_id = p_branch_id and m.product_id = p.id), 0)::int,
         pl.par_pieces,
         case when pd.days > 0 then ceil(greatest(0, pd.used) / pd.days::numeric)::int end,
         coalesce(pd.days, 0)
  from public.products p
  left join public.par_levels pl on pl.location_id = p_branch_id and pl.product_id = p.id
  left join lateral (
    -- لكل يوم: كم انعدّ من الصنف، وكم كان تعديل الجرد (سالبه = الاستهلاك)
    select count(*)::int as days, -sum(x.adjusted) as used
    from (
      select c.business_date,
             sum(cl.qty_pieces) as counted,
             coalesce(sum((select sum(m.qty_pieces) from public.stock_movements m
                           where m.count_line_id = cl.id and m.movement_type = 'count_adjustment')), 0) as adjusted
      from public.stock_counts c
      join public.stock_count_lines cl on cl.count_id = c.id and cl.product_id = p.id
      where c.location_id = p_branch_id and c.status = 'confirmed' and not c.is_opening
        and c.business_date = any (days)
      group by c.business_date
    ) x
    -- الصنف كان بالفرع: انعدّ منه شي، أو كان متوقع إله ستوك (التعديل مش صفر)
    where x.counted > 0 or x.adjusted <> 0
  ) pd on true
  where p.is_active
    and exists (select 1 from public.locations l where l.id = p_branch_id and l.kind = 'branch');
end;
$$;

create or replace view public.v_below_min with (security_invoker = true) as
select
  pl.location_id,
  pl.product_id,
  (case when l.kind = 'factory' then coalesce(fb.qty, 0) else coalesce(st.qty_pieces, 0) end)::int as qty_pieces,
  pl.min_pieces
from public.par_levels pl
join public.locations l on l.id = pl.location_id and l.kind in ('branch', 'factory', 'packaging') and l.is_active
-- الكيك بالفروع والمصنع، والتغليف بالمستودع
join public.products p on p.id = pl.product_id and p.is_active
  and p.kind = case when l.kind = 'packaging' then 'packaging' else 'cake' end::public.product_kind
left join public.v_stock_by_product st on st.location_id = pl.location_id and st.product_id = pl.product_id
left join lateral (
  select sum(b.qty_pieces) as qty from public.v_factory_batches b
  where b.location_id = pl.location_id and b.product_id = pl.product_id and not b.is_expired
) fb on l.kind = 'factory'
where pl.min_pieces is not null
  and (case when l.kind = 'factory' then coalesce(fb.qty, 0) else coalesce(st.qty_pieces, 0) end) < pl.min_pieces;
