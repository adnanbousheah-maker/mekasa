-- الخطوة 6: تسجيل التالف بأي موقع. السجل وحركته بنفس الـ transaction.

-- أي موظف فعّال بموقعه (أو الأدمن بأي موقع جرد).
create function private.can_record_waste_at(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.locations l
    where l.id = loc
      and l.is_active
      and l.kind in ('branch', 'factory')
      and (private.is_admin() or l.id = private.my_location_id())
  )
$$;

create function public.record_waste(
  p_location_id uuid,
  p_product_id uuid,
  p_unit public.entry_unit,
  p_qty int,
  p_reason public.waste_reason,
  p_note text default null,
  -- المصنع بس: تاريخ إنتاج الدفعة
  p_production_date date default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  loc_kind public.location_kind;
  batch uuid;
  record_id uuid;
  pieces int;
begin
  if not private.can_record_waste_at(p_location_id) then
    raise exception 'you cannot record waste at this location' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'product not found' using errcode = 'foreign_key_violation';
  end if;

  select l.kind into loc_kind from public.locations l where l.id = p_location_id;
  if loc_kind = 'factory' then
    if p_production_date is null or p_production_date > public.amman_today() then
      raise exception 'factory waste needs the batch production date' using errcode = 'check_violation';
    end if;
    insert into public.batches (product_id, production_date)
    values (p_product_id, p_production_date)
    on conflict (product_id, production_date) do update set production_date = excluded.production_date
    returning id into batch;
  end if;

  insert into public.waste_records (
    location_id, product_id, batch_id, entered_unit, entered_qty, pieces_per_cake_snapshot,
    reason, reason_note, photo_path, recorded_by
  )
  select
    p_location_id, p_product_id, batch, p_unit, p_qty, p.effective_pieces_per_cake,
    p_reason, nullif(trim(p_note), ''), p_photo_path, caller
  from public.v_products p
  where p.id = p_product_id
  returning id, qty_pieces into record_id, pieces;

  insert into public.stock_movements (
    occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, waste_record_id, created_by
  )
  values (now(), p_location_id, p_product_id, batch, -pieces, 'waste', record_id, caller);

  return record_id;
end;
$$;

revoke execute on function private.can_record_waste_at(uuid) from public, anon;
grant execute on function private.can_record_waste_at(uuid) to authenticated, service_role;
revoke execute on function
  public.record_waste(uuid, uuid, public.entry_unit, int, public.waste_reason, text, date, text)
from public, anon;
grant execute on function
  public.record_waste(uuid, uuid, public.entry_unit, int, public.waste_reason, text, date, text)
to authenticated;
