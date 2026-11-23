-- 23 نوفمبر 2026: الأدمن بيضيف صنف ما انعدّ لجرد مؤكد (مثلاً صنف كان موقوف وقت الجرد)، بسبب إجباري.
-- نفس منطق التصحيح: الحركة = العد − المتوقع وقت بداية الجرد (رصيد افتتاحي إذا الجرد افتتاحي)،
-- والعكس على أول جرد بعده، فالاستهلاك بالفترتين بيضل صح.

create or replace function private.guard_count_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_status public.count_status;
begin
  if tg_op = 'UPDATE' and new.count_id is distinct from old.count_id then
    raise exception 'a count line cannot move to another count' using errcode = 'restrict_violation';
  end if;

  select c.status into parent_status
  from public.stock_counts c
  where c.id = case when tg_op = 'INSERT' then new.count_id else old.count_id end;

  if parent_status is distinct from 'confirmed' then
    return coalesce(new, old);
  end if;

  -- سطر جديد لجرد مؤكد: بس من admin_add_count_line
  if tg_op = 'INSERT' and private.is_admin() and current_setting('mekasa.admin_count_add', true) = 'on' then
    perform private.require_change_reason();
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'lines of a confirmed count cannot be added or removed' using errcode = 'restrict_violation';
  end if;

  if not private.is_admin() and current_setting('mekasa.staff_count_edit', true) is distinct from 'on' then
    raise exception 'only an admin can correct a confirmed count' using errcode = 'insufficient_privilege';
  end if;

  perform private.require_change_reason();

  if (new.product_id, new.batch_id, new.pieces_per_cake_snapshot,
      new.ocr_whole_cakes, new.ocr_loose_pieces, new.ocr_whole_confidence, new.ocr_pieces_confidence)
     is distinct from
     (old.product_id, old.batch_id, old.pieces_per_cake_snapshot,
      old.ocr_whole_cakes, old.ocr_loose_pieces, old.ocr_whole_confidence, old.ocr_pieces_confidence)
  then
    raise exception 'only the counted quantities can be corrected' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create function public.admin_add_count_line(
  p_count_id uuid,
  p_product_id uuid,
  p_production_date date,
  p_frozen boolean,
  p_whole_cakes int,
  p_loose_pieces int,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cnt public.stock_counts;
  loc public.locations;
  batch uuid;
  new_line public.stock_count_lines;
  delta int;
  audit_id bigint;
  next_line uuid;
  next_started timestamptz;
  later_count timestamptz;
begin
  if not private.is_admin() then
    raise exception 'only an admin can add to a confirmed count' using errcode = 'insufficient_privilege';
  end if;
  select * into cnt from public.stock_counts c where c.id = p_count_id;
  if cnt.id is null or cnt.status <> 'confirmed' then
    raise exception 'only confirmed counts get added lines' using errcode = 'check_violation';
  end if;
  select * into loc from public.locations l where l.id = cnt.location_id;
  if coalesce(p_whole_cakes, 0) < 0 or coalesce(p_loose_pieces, 0) < 0 then
    raise exception 'quantities cannot be negative' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || cnt.location_id::text));
  perform set_config('mekasa.change_reason', coalesce(p_reason, ''), true);
  perform private.require_change_reason();

  if loc.kind = 'factory' and (select p.kind from public.products p where p.id = p_product_id) = 'cake' then
    if p_production_date is null then
      raise exception 'pick the production date' using errcode = 'check_violation', hint = 'production_date';
    end if;
    batch := private.upsert_batch_frozen(p_product_id, p_production_date, coalesce(p_frozen, false));
  end if;

  if exists (
    select 1 from public.stock_count_lines l
    where l.count_id = cnt.id and l.product_id = p_product_id and l.batch_id is not distinct from batch
  ) then
    raise exception 'this product is already in the count' using errcode = 'check_violation', hint = 'already_counted';
  end if;

  perform set_config('mekasa.admin_count_add', 'on', true);
  insert into public.stock_count_lines (count_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
  select cnt.id, p.id, batch, coalesce(p_whole_cakes, 0), coalesce(p_loose_pieces, 0), p.effective_pieces_per_cake
  from public.v_products p
  where p.id = p_product_id
  returning * into new_line;
  perform set_config('mekasa.admin_count_add', 'off', true);
  if new_line.id is null then
    raise exception 'unknown product' using errcode = 'check_violation';
  end if;

  insert into public.audit_log (table_name, row_id, action, new_values, reason, changed_by)
  values ('stock_count_lines', new_line.id::text, 'insert', to_jsonb(new_line), trim(p_reason), caller)
  returning id into audit_id;

  -- العد − المتوقع وقت بداية الجرد
  delta := new_line.qty_pieces - private.stock_at(cnt.location_id, p_product_id, batch, cnt.started_at);
  if delta = 0 then
    return new_line.id;
  end if;

  insert into public.stock_movements (
    occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
  )
  values (
    cnt.started_at, cnt.location_id, p_product_id, batch, delta,
    case when cnt.is_opening then 'opening_balance' else 'count_adjustment' end::public.movement_type,
    new_line.id, audit_id, caller
  );

  -- العكس على أول جرد بعده (نفس admin_correct_count_line)
  select l.id, c.started_at into next_line, next_started
  from public.stock_count_lines l
  join public.stock_counts c on c.id = l.count_id
  where c.location_id = cnt.location_id and c.status = 'confirmed' and c.started_at > cnt.started_at
    and l.product_id = p_product_id and l.batch_id is not distinct from batch
  order by c.started_at
  limit 1;

  select min(c.started_at) into later_count
  from public.stock_counts c
  where c.location_id = cnt.location_id and c.status = 'confirmed' and c.scope = cnt.scope and c.started_at > cnt.started_at;

  if next_line is not null and next_started = later_count then
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
    )
    values (next_started, cnt.location_id, p_product_id, batch, -delta, 'count_adjustment', next_line, audit_id, caller);
  elsif later_count is not null then
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, correction_audit_id, created_by
    )
    values (later_count, cnt.location_id, p_product_id, batch, -delta, 'admin_correction', audit_id, caller);
  end if;

  return new_line.id;
end;
$$;

revoke execute on function public.admin_add_count_line(uuid, uuid, date, boolean, int, int, text) from public, anon;
grant execute on function public.admin_add_count_line(uuid, uuid, date, boolean, int, int, text) to authenticated;
