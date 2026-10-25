-- ملاحظات ميكاسا (25 أكتوبر 2026): الطلبية المقترحة = معدل استهلاك آخر 4 أيام من نفس يوم بكرا
-- (الفرع بيطلب كل يوم للصبح) ناقص الموجود. إذا ما في جرد بهالأيام، بنرجع للحد المطلوب.
--
-- استهلاك يوم = سالب تعديلات الجرد المؤكد بهاليوم (business_date). الأيام اللي ما انعمل فيها
-- جرد ما بتدخل بالمعدل (مش صفر)، والجرد الافتتاحي ما بيدخل.

drop function public.branch_suggestions(uuid);

create function public.branch_suggestions(p_branch_id uuid)
returns table (product_id uuid, stock_pieces int, par_pieces int, avg_pieces int, days_used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tomorrow date := public.amman_today() + 1;
  days date[] := array[tomorrow - 7, tomorrow - 14, tomorrow - 21, tomorrow - 28];
  counted int;
begin
  if not (
    private.is_admin()
    or (private.has_role('branch_staff') and private.my_location_id() = p_branch_id)
    or (private.has_role('dispatcher')
        and exists (select 1 from public.locations l where l.id = private.my_location_id() and l.kind = 'factory'))
  ) then
    raise exception 'you cannot see this branch' using errcode = 'insufficient_privilege';
  end if;

  select count(distinct c.business_date)::int into counted
  from public.stock_counts c
  where c.location_id = p_branch_id and c.status = 'confirmed' and not c.is_opening
    and c.business_date = any (days);

  return query
  select p.id,
         coalesce((select sum(m.qty_pieces) from public.stock_movements m
                   where m.location_id = p_branch_id and m.product_id = p.id), 0)::int,
         pl.par_pieces,
         case when counted > 0 then
           ceil(greatest(0, coalesce((
             select -sum(m.qty_pieces)
             from public.stock_movements m
             join public.stock_count_lines cl on cl.id = m.count_line_id
             join public.stock_counts c on c.id = cl.count_id
             where m.location_id = p_branch_id and m.product_id = p.id
               and m.movement_type = 'count_adjustment'
               and c.status = 'confirmed' and not c.is_opening
               and c.business_date = any (days)
           ), 0)) / counted::numeric)::int
         end,
         counted
  from public.products p
  left join public.par_levels pl on pl.location_id = p_branch_id and pl.product_id = p.id
  where p.is_active
    and exists (select 1 from public.locations l where l.id = p_branch_id and l.kind = 'branch');
end;
$$;

revoke execute on function public.branch_suggestions(uuid) from public, anon;
grant execute on function public.branch_suggestions(uuid) to authenticated;
