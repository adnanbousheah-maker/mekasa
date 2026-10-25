-- ملاحظات ميكاسا (25 أكتوبر 2026): كود لكل مادة أولية، وجرد المواد من ملف Excel (أول مرة).
-- الملف: الكود، الاسم، التعبئة (مثلاً "كيس 25 كيلو")، الكمية. التطبيق بيفك التعبئة وبيبعت الأسطر هون.

alter table public.raw_materials
  add column code text unique check (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$');

-- ─── الجرد نفسه (مشترك بين الجرد من الشاشة والجرد من الملف) ─────────

-- p_lines: [{ "material_id", "unit_id", "qty" }]. اللي ما انعد بيضل متل ما هو (جرد جزئي).
create function private.record_raw_count(factory uuid, p_lines jsonb, started timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
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

-- نفس التوقيع والسلوك، بس الجسم صار بالدالة المشتركة
create or replace function public.submit_raw_count(p_lines jsonb, p_started_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.record_raw_count(private.raw_staff_factory(), p_lines, coalesce(p_started_at, now()));
end;
$$;

-- ─── الجرد من Excel (الأدمن) ─────────────────────────────────────────

-- p_rows: [{ "code", "name", "base_unit", "unit_name" (null = الوحدة الأساسية), "factor", "qty" }]
-- المادة بتنلاقى بالكود (وإذا ما في كود، بالاسم). المادة أو التعبئة اللي مش موجودة بتنضاف.
-- تعبئة موجودة بعامل مختلف = خطأ (ما منغير تحويل قديم بصمت).
create function public.admin_import_raw_count(p_rows jsonb, p_started_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  factory uuid := private.main_factory();
  r jsonb;
  material public.raw_materials;
  unit_id uuid;
  unit_factor numeric;
  lines jsonb := '[]'::jsonb;
  row_code text;
  row_name text;
  row_unit text;
  row_factor numeric;
begin
  if not private.is_admin() then
    raise exception 'only an admin can import a raw materials count' using errcode = 'insufficient_privilege';
  end if;
  if factory is null then
    raise exception 'there is no active factory' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'the file has no rows' using errcode = 'check_violation';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    row_code := nullif(trim(r ->> 'code'), '');
    row_name := nullif(trim(r ->> 'name'), '');
    row_unit := nullif(trim(r ->> 'unit_name'), '');
    row_factor := coalesce((r ->> 'factor')::numeric, 1);
    if row_name is null and row_code is null then
      raise exception 'a row needs a code or a name' using errcode = 'check_violation';
    end if;
    if (r ->> 'qty')::numeric is null or (r ->> 'qty')::numeric < 0 then
      raise exception 'a quantity must be zero or more' using errcode = 'check_violation';
    end if;

    material := null;
    if row_code is not null then
      select * into material from public.raw_materials m where m.code = row_code;
    end if;
    if material.id is null and row_name is not null then
      select * into material from public.raw_materials m where m.name = row_name;
    end if;

    if material.id is null then
      if row_name is null or nullif(trim(r ->> 'base_unit'), '') is null then
        raise exception 'a new material needs a name and a base unit' using errcode = 'check_violation';
      end if;
      insert into public.raw_materials (name, base_unit, code)
      values (row_name, trim(r ->> 'base_unit'), row_code)
      returning * into material;
    elsif material.code is null and row_code is not null then
      update public.raw_materials set code = row_code where id = material.id returning * into material;
    end if;
    if not material.is_active then
      update public.raw_materials set is_active = true where id = material.id returning * into material;
    end if;

    unit_id := null;
    if row_unit is not null and row_unit <> material.base_unit then
      select u.id, u.factor_to_base into unit_id, unit_factor
      from public.raw_material_units u where u.material_id = material.id and u.unit_name = row_unit;
      if unit_id is null then
        if row_factor <= 0 then
          raise exception 'packaging needs a positive size' using errcode = 'check_violation';
        end if;
        insert into public.raw_material_units (material_id, unit_name, factor_to_base)
        values (material.id, row_unit, row_factor)
        returning id into unit_id;
      elsif unit_factor <> row_factor then
        raise exception 'packaging % of % is % %, not %', row_unit, material.name, unit_factor, material.base_unit, row_factor
          using errcode = 'check_violation', hint = 'unit_factor_mismatch';
      end if;
    end if;

    lines := lines || jsonb_build_array(jsonb_build_object(
      'material_id', material.id, 'unit_id', unit_id, 'qty', (r ->> 'qty')::numeric));
  end loop;

  if (select count(distinct e ->> 'material_id') from jsonb_array_elements(lines) e) <> jsonb_array_length(lines) then
    raise exception 'a material appears twice in the file' using errcode = 'check_violation', hint = 'duplicate_material';
  end if;

  return private.record_raw_count(factory, lines, coalesce(p_started_at, now()));
end;
$$;

revoke execute on function private.record_raw_count(uuid, jsonb, timestamptz) from public, anon;
grant execute on function private.record_raw_count(uuid, jsonb, timestamptz) to authenticated, service_role;
revoke execute on function public.admin_import_raw_count(jsonb, timestamptz) from public, anon;
grant execute on function public.admin_import_raw_count(jsonb, timestamptz) to authenticated;
