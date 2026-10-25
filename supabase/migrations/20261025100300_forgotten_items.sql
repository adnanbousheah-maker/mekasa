-- ملاحظات ميكاسا (25 أكتوبر 2026): لما الفرع يبعت طلب وينسى صنف مقترح، بنحذّره،
-- وإذا بعت هيك بننسجل الأصناف اللي ما طلبها والمدير بيوصله إشعار.

create table public.stock_request_missing (
  request_id uuid not null references public.stock_requests (id),
  product_id uuid not null references public.products (id),
  -- الكمية اللي كانت مقترحة وانتركت، بالقطع
  suggested_pieces int not null check (suggested_pieces > 0),
  primary key (request_id, product_id)
);

alter table public.stock_request_missing enable row level security;

create policy "both ends read forgotten items" on public.stock_request_missing
  for select to authenticated using (
    exists (
      select 1 from public.stock_requests r
      where r.id = request_id
        and (private.can_see_location(r.requesting_location_id) or private.can_see_location(r.supplying_location_id))
    )
  );

revoke all on public.stock_request_missing from anon;
revoke insert, update, delete, truncate, references, trigger on public.stock_request_missing from authenticated;

create trigger stock_request_missing_immutable before update or delete on public.stock_request_missing
  for each row execute function private.forbid_modification();
create trigger stock_request_missing_no_truncate before truncate on public.stock_request_missing
  for each statement execute function private.forbid_modification();

-- p_missing: [{ "product_id", "suggested_pieces" }]، الأصناف المقترحة اللي الموظف شافها وما طلبها
-- الحذف بيطلب موافقة بالسحابة، فالنسخة القديمة بتنحفظ باسم ثاني ومسكّرة على الكل
alter function public.create_request(jsonb, text) rename to create_request_before_missing;
revoke execute on function public.create_request_before_missing(jsonb, text) from public, anon, authenticated;

create function public.create_request(p_lines jsonb, p_note text default null, p_missing jsonb default '[]')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  branch uuid := private.my_location_id();
  factory uuid := private.main_factory();
  needs_approval boolean := (select s.order_approval_required from public.app_settings s);
  request uuid;
begin
  if not private.has_role('branch_staff')
     or not exists (select 1 from public.locations l where l.id = branch and l.kind = 'branch' and l.is_active) then
    raise exception 'only branch staff can request stock' using errcode = 'insufficient_privilege';
  end if;
  if factory is null then
    raise exception 'there is no active factory' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a request needs at least one line' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(p_missing, '[]')) is distinct from 'array' then
    raise exception 'forgotten items must be a list' using errcode = 'check_violation';
  end if;

  insert into public.stock_requests (requesting_location_id, supplying_location_id, status, requested_by, note)
  values (branch, factory, case when needs_approval then 'pending_approval' else 'sent' end::public.request_status,
          caller, nullif(trim(p_note), ''))
  returning id into request;

  insert into public.stock_request_lines (request_id, product_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot, suggested_pieces)
  select request, p.id, coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0),
         p.effective_pieces_per_cake, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(p_lines) e
  join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.is_active;

  if (select count(*) from public.stock_request_lines l where l.request_id = request) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs an active product' using errcode = 'check_violation';
  end if;

  -- صنف ما بيكون منسي إذا انطلب
  insert into public.stock_request_missing (request_id, product_id, suggested_pieces)
  select request, p.id, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(coalesce(p_missing, '[]')) e
  join public.products p on p.id = (e ->> 'product_id')::uuid and p.is_active
  where not exists (
    select 1 from public.stock_request_lines l where l.request_id = request and l.product_id = p.id
  );

  if (select count(*) from public.stock_request_missing m where m.request_id = request)
     <> jsonb_array_length(coalesce(p_missing, '[]')) then
    raise exception 'a forgotten item must be an active product that is not in the request'
      using errcode = 'check_violation';
  end if;
  return request;
end;
$$;

revoke execute on function public.create_request(jsonb, text, jsonb) from public, anon;
grant execute on function public.create_request(jsonb, text, jsonb) to authenticated;
