-- 20 نوفمبر 2026: الموظف بيعدّل جرده خلال ربع ساعة من التأكيد (قرار صاحب المشروع).
-- بس آخر جرد بالموقع (ما في جرد بعده)، فالتعديل = حركة بالفرق على نفس السطر بوقت الجرد،
-- متل تصحيح الأدمن بدون العكس على الجرد اللي بعده. بينسجل بسجل التعديلات بسبب ثابت.

-- نفس الدالة (20261023100700)، بس بتسمح لتعديل الموظف من staff_edit_count (علامة محلية للـ transaction)
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

-- كم دقيقة بعد التأكيد (نفس ربع ساعة الطلب)
create function private.count_edit_minutes()
returns int
language sql
immutable
set search_path = ''
as $$
  select 15
$$;

revoke execute on function private.count_edit_minutes() from public, anon;
grant execute on function private.count_edit_minutes() to authenticated, service_role;

-- p_lines: [{ "line_id", "whole_cakes", "loose_pieces" }] (بس الأسطر اللي تغيّرت، أسطر نفس الجرد)
create function public.staff_edit_count(p_count_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cnt public.stock_counts;
  e jsonb;
  old_line public.stock_count_lines;
  new_qty int;
  delta int;
  audit_id bigint;
begin
  select * into cnt from public.stock_counts c where c.id = p_count_id;
  if cnt.id is null or not private.can_count_at(cnt.location_id) then
    raise exception 'you cannot edit this count' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || cnt.location_id::text));

  if cnt.status <> 'confirmed'
     or now() - cnt.confirmed_at > make_interval(mins => private.count_edit_minutes())
     or exists (
       select 1 from public.stock_counts c
       where c.location_id = cnt.location_id and c.status = 'confirmed' and c.started_at > cnt.started_at
     ) then
    raise exception 'the count can no longer be changed' using errcode = 'check_violation', hint = 'not_editable';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'lines must be an array' using errcode = 'check_violation';
  end if;

  perform set_config('mekasa.staff_count_edit', 'on', true);
  perform set_config('mekasa.change_reason', 'تعديل الموظف خلال ربع ساعة من الجرد', true);

  for e in select * from jsonb_array_elements(p_lines) loop
    select * into old_line from public.stock_count_lines l
    where l.id = (e ->> 'line_id')::uuid and l.count_id = cnt.id
    for update;
    if old_line.id is null then
      raise exception 'the line is not in this count' using errcode = 'check_violation';
    end if;

    update public.stock_count_lines
    set whole_cakes = coalesce((e ->> 'whole_cakes')::int, 0), loose_pieces = coalesce((e ->> 'loose_pieces')::int, 0)
    where id = old_line.id
    returning qty_pieces into new_qty;

    delta := new_qty - old_line.qty_pieces;
    continue when delta = 0;

    select a.id into audit_id
    from public.audit_log a
    where a.table_name = 'stock_count_lines' and a.row_id = old_line.id::text
    order by a.id desc
    limit 1;

    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
    )
    values (
      cnt.started_at, cnt.location_id, old_line.product_id, old_line.batch_id, delta, 'count_adjustment',
      old_line.id, audit_id, caller
    );
  end loop;

  perform set_config('mekasa.staff_count_edit', '', true);
end;
$$;

revoke execute on function public.staff_edit_count(uuid, jsonb) from public, anon;
grant execute on function public.staff_edit_count(uuid, jsonb) to authenticated;
