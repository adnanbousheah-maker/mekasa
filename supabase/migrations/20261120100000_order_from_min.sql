-- 20 نوفمبر 2026: اقتراح الطلبية = الحد الأدنى لبكرا + 5 كيكات − الموجود (قرار صاحب المشروع).
-- الحد لبكرا = حد يوم بكرا (par_level_daily_min، بيوم الجرد) وإلا الحد العام (par_levels.min_pieces).
-- دالة definer لأن الإخراج بالمصنع ما بيشوف حدود الفروع بـ RLS (نفس صلاحيات branch_suggestions).

create function public.branch_min_tomorrow(p_branch_id uuid)
returns table (product_id uuid, min_pieces int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tomorrow_day smallint := public.day_number(public.count_day_today() + 1);
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
  select pl.product_id, coalesce(d.min_pieces, pl.min_pieces)
  from public.par_levels pl
  left join public.par_level_daily_min d
    on d.location_id = pl.location_id and d.product_id = pl.product_id and d.weekday = tomorrow_day
  where pl.location_id = p_branch_id
    and coalesce(d.min_pieces, pl.min_pieces) is not null;
end;
$$;

revoke execute on function public.branch_min_tomorrow(uuid) from public, anon;
grant execute on function public.branch_min_tomorrow(uuid) to authenticated;
