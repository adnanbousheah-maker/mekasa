-- المرحلة 3: حركات المواد الأولية بالمصنع (استلام من مورد، صرف للإنتاج، جرد).
-- كله بالوحدة الأساسية للمادة، وبينحفظ شو كتب الموظف (مثلاً 4 أكياس).

create function private.raw_staff_factory()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  loc uuid := private.my_location_id();
begin
  if not private.has_role('storekeeper')
     or not exists (select 1 from public.locations l where l.id = loc and l.kind = 'factory' and l.is_active) then
    raise exception 'only the storekeeper handles raw materials' using errcode = 'insufficient_privilege';
  end if;
  return loc;
end;
$$;

-- الكمية بالوحدة الأساسية: الوحدة لازم تكون لنفس المادة
create function private.raw_to_base(material uuid, unit uuid, qty numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  factor numeric := 1;
begin
  if unit is not null then
    select u.factor_to_base into factor from public.raw_material_units u where u.id = unit and u.material_id = material;
    if factor is null then
      raise exception 'the unit does not belong to this material' using errcode = 'check_violation';
    end if;
  end if;
  return round(qty * factor, 3);
end;
$$;

-- استلام (موجب) أو صرف (سالب)
create function public.record_raw_movement(
  p_material_id uuid,
  p_kind public.raw_movement_type,
  p_qty numeric,
  p_unit_id uuid default null,
  p_supplier_name text default null,
  p_invoice_photo_path text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  factory uuid := private.raw_staff_factory();
  base numeric;
  movement bigint;
begin
  if p_kind not in ('receipt', 'issue') then
    raise exception 'only receipts and issues are recorded here' using errcode = 'check_violation';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'the quantity must be positive' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.raw_materials m where m.id = p_material_id and m.is_active) then
    raise exception 'material not found' using errcode = 'check_violation';
  end if;

  base := private.raw_to_base(p_material_id, p_unit_id, p_qty);
  insert into public.raw_movements (
    occurred_at, location_id, material_id, qty_base, movement_type, entered_unit_id, entered_qty,
    supplier_name, invoice_photo_path, created_by
  )
  values (
    now(), factory, p_material_id, case when p_kind = 'issue' then -base else base end, p_kind, p_unit_id, p_qty,
    case when p_kind = 'receipt' then nullif(trim(p_supplier_name), '') end,
    case when p_kind = 'receipt' then p_invoice_photo_path end,
    (select auth.uid())
  )
  returning id into movement;
  return movement;
end;
$$;

-- جرد المواد: p_lines [{ "material_id", "unit_id", "qty" }]. اللي ما انعد بيضل متل ما هو
-- (جرد المواد ممكن يكون جزئي، عكس جرد الكيك).
create function public.submit_raw_count(p_lines jsonb, p_started_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  factory uuid := private.raw_staff_factory();
  started timestamptz := coalesce(p_started_at, now());
  new_count uuid;
  line record;
  expected numeric;
  first_time boolean;
begin
  if started > now() + interval '1 minute' or started < now() - interval '12 hours' then
    raise exception 'the count start time is out of range' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'count at least one material' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:raw-count:' || factory::text));

  insert into public.raw_counts (location_id, business_date, started_at, counted_by)
  values (factory, (started at time zone 'Asia/Amman')::date, started, (select auth.uid()))
  returning id into new_count;

  insert into public.raw_count_lines (count_id, material_id, entered_unit_id, entered_qty, qty_base)
  select new_count, m.id, (e ->> 'unit_id')::uuid, (e ->> 'qty')::numeric,
         private.raw_to_base(m.id, (e ->> 'unit_id')::uuid, (e ->> 'qty')::numeric)
  from jsonb_array_elements(p_lines) e
  join public.raw_materials m on m.id = (e ->> 'material_id')::uuid and m.is_active;

  if (select count(*) from public.raw_count_lines l where l.count_id = new_count)
     <> jsonb_array_length(p_lines) then
    raise exception 'every line needs an active material' using errcode = 'check_violation';
  end if;

  update public.raw_counts set status = 'confirmed', confirmed_at = now() where id = new_count;

  for line in select l.id, l.material_id, l.qty_base from public.raw_count_lines l where l.count_id = new_count loop
    select coalesce(sum(m.qty_base), 0) into expected
    from public.raw_movements m
    where m.location_id = factory and m.material_id = line.material_id and m.occurred_at <= started;

    first_time := not exists (
      select 1 from public.raw_count_lines pl
      join public.raw_counts pc on pc.id = pl.count_id
      where pc.location_id = factory and pc.status = 'confirmed' and pl.material_id = line.material_id
        and pc.id <> new_count
    );

    if line.qty_base - expected <> 0 then
      insert into public.raw_movements (occurred_at, location_id, material_id, qty_base, movement_type, raw_count_line_id, created_by)
      values (started, factory, line.material_id, line.qty_base - expected,
              case when first_time then 'opening_balance' else 'count_adjustment' end::public.raw_movement_type,
              line.id, (select auth.uid()));
    end if;
  end loop;

  return new_count;
end;
$$;

revoke execute on function private.raw_staff_factory(), private.raw_to_base(uuid, uuid, numeric) from public, anon;
grant execute on function private.raw_staff_factory(), private.raw_to_base(uuid, uuid, numeric) to authenticated, service_role;
revoke execute on function
  public.record_raw_movement(uuid, public.raw_movement_type, numeric, uuid, text, text),
  public.submit_raw_count(jsonb, timestamptz)
from public, anon;
grant execute on function
  public.record_raw_movement(uuid, public.raw_movement_type, numeric, uuid, text, text),
  public.submit_raw_count(jsonb, timestamptz)
to authenticated;
