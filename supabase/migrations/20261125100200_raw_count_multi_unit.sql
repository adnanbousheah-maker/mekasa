-- 25 نوفمبر 2026: بجرد المواد الأولية المادة ممكن تنعدّ بأكثر من تعبئة (مثلاً كيسين + كرتونة + 3 كيلو).
-- الأسطر ممكن تتكرر لنفس المادة بوحدات مختلفة، وبتنجمع لسطر واحد بالوحدة الأساسية.
-- entered_parts = تفصيل اللي انكتب (unit_id null = الوحدة الأساسية) لما يكون أكثر من وحدة،
-- وبهالحالة entered_unit_id = null و entered_qty = المجموع بالوحدة الأساسية.
alter table public.raw_count_lines add column entered_parts jsonb;

create or replace function private.record_raw_count(factory uuid, p_lines jsonb, started timestamptz)
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
  materials int;
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

  with entries as (
    select (e ->> 'material_id')::uuid as material_id,
           nullif(e ->> 'unit_id', '')::uuid as unit_id,
           (e ->> 'qty')::numeric as qty,
           ord
    from jsonb_array_elements(p_lines) with ordinality as x(e, ord)
  ), grouped as (
    select en.material_id,
           count(*) as parts,
           sum(private.raw_to_base(en.material_id, en.unit_id, en.qty)) as qty_base,
           (array_agg(en.unit_id order by en.ord))[1] as first_unit,
           (array_agg(en.qty order by en.ord))[1] as first_qty,
           jsonb_agg(jsonb_build_object('unit_id', en.unit_id, 'qty', en.qty) order by en.ord) as entered_parts
    from entries en
    group by en.material_id
  )
  insert into public.raw_count_lines (count_id, material_id, entered_unit_id, entered_qty, qty_base, entered_parts)
  select new_count, m.id,
         case when g.parts = 1 then g.first_unit end,
         case when g.parts = 1 then g.first_qty else g.qty_base end,
         g.qty_base,
         case when g.parts > 1 then g.entered_parts end
  from grouped g
  join public.raw_materials m on m.id = g.material_id and m.is_active;

  select count(distinct (e ->> 'material_id')) into materials from jsonb_array_elements(p_lines) e;
  if (select count(*) from public.raw_count_lines l where l.count_id = new_count) <> materials then
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
