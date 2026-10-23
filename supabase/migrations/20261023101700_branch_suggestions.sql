-- الكمية المقترحة لفرع (الحد المطلوب − الموجود). الإخراج بالمصنع ما بيشوف ستوك الفروع (RLS)،
-- فهالدالة بترجع الرقمين بس لكل صنف، لمين إله علاقة: موظف الفرع نفسه، الإخراج بالمصنع، والأدمن.
create function public.branch_suggestions(p_branch_id uuid)
returns table (product_id uuid, stock_pieces int, par_pieces int)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
         pl.par_pieces
  from public.products p
  left join public.par_levels pl on pl.location_id = p_branch_id and pl.product_id = p.id
  where p.is_active
    and exists (select 1 from public.locations l where l.id = p_branch_id and l.kind = 'branch');
end;
$$;

revoke execute on function public.branch_suggestions(uuid) from public, anon;
grant execute on function public.branch_suggestions(uuid) to authenticated;
