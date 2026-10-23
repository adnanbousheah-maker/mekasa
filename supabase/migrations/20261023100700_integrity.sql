-- قواعد ما بتنكسر حتى لو حدا كتب على قاعدة البيانات مباشرة:
-- الدفاتر ما بتتعدل، كل حركة مطابقة لمستندها، الجرد المؤكد ما بيتعدل إلا بسبب،
-- المستندات ما بتغير هويتها، كل تغيير مهم بينسجل، الأدوار متوافقة مع المواقع،
-- والدفعات بالمصنع بس.

-- ─── ممنوع تعديل أو حذف ──────────────────────────────────────────────

create function private.forbid_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%: % is not allowed', tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation',
          hint = 'Record a new compensating row instead.';
end;
$$;

-- الدفاتر والسجلات: لا تعديل ولا حذف ولا truncate، لأي حدا
do $$
declare
  t text;
begin
  foreach t in array array['stock_movements', 'raw_movements', 'audit_log'] loop
    execute format(
      'create trigger %1$s_append_only before update or delete on public.%1$I
         for each row execute function private.forbid_modification()', t);
    execute format(
      'create trigger %1$s_no_truncate before truncate on public.%1$I
         for each statement execute function private.forbid_modification()', t);
  end loop;
end;
$$;

-- المستندات اللي ما بتتغير بعد ما تنكتب
do $$
declare
  t text;
begin
  foreach t in array array[
    'waste_records', 'production_entries', 'production_lines', 'stock_request_lines',
    'dispatch_lines', 'dispatch_line_batches', 'receipts', 'return_dispositions', 'count_form_versions'
  ] loop
    execute format(
      'create trigger %1$s_immutable before update or delete on public.%1$I
         for each row execute function private.forbid_modification()', t);
  end loop;
end;
$$;

-- المستندات اللي حالتها بتتغير بس ما بتنحذف
do $$
declare
  t text;
begin
  foreach t in array array['stock_requests', 'dispatches', 'receipt_lines'] loop
    execute format(
      'create trigger %1$s_no_delete before delete on public.%1$I
         for each row execute function private.forbid_modification()', t);
  end loop;
end;
$$;

-- ─── الطلب والإخراج والاستلام: الهوية ثابتة، والحالة بترتيبها ────────

create function private.guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.requesting_location_id, new.supplying_location_id, new.requested_by, new.requested_at, new.note)
     is distinct from
     (old.requesting_location_id, old.supplying_location_id, old.requested_by, old.requested_at, old.note)
  then
    raise exception 'only the status and approval of a request can change' using errcode = 'restrict_violation';
  end if;

  if old.approved_at is not null
     and (new.approved_by, new.approved_at) is distinct from (old.approved_by, old.approved_at) then
    raise exception 'an approval cannot be changed' using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending_approval' and new.status in ('sent', 'cancelled'))
    or (old.status = 'sent' and new.status in ('dispatched', 'cancelled'))
    or (old.status = 'dispatched' and new.status = 'received')
  ) then
    raise exception 'a request cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger stock_requests_guard
before update on public.stock_requests
for each row execute function private.guard_request_update();

create function private.guard_dispatch_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.from_location_id, new.to_location_id, new.request_id, new.kind, new.dispatched_by, new.dispatched_at, new.note)
     is distinct from
     (old.from_location_id, old.to_location_id, old.request_id, old.kind, old.dispatched_by, old.dispatched_at, old.note)
  then
    raise exception 'only the status of a dispatch can change' using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'in_transit' and new.status in ('received', 'cancelled')) then
    raise exception 'a dispatch cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger dispatches_guard
before update on public.dispatches
for each row execute function private.guard_dispatch_update();

-- أسطر الاستلام: الكمية ثابتة، بس قرار الأدمن على الفرق بيتعبى مرة وحدة
create function private.freeze_receipt_quantities()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.receipt_id, new.dispatch_line_id, new.whole_cakes, new.loose_pieces, new.pieces_per_cake_snapshot, new.note)
     is distinct from
     (old.receipt_id, old.dispatch_line_id, old.whole_cakes, old.loose_pieces, old.pieces_per_cake_snapshot, old.note)
  then
    raise exception 'received quantities are read-only' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger receipt_lines_freeze_quantities
before update on public.receipt_lines
for each row execute function private.freeze_receipt_quantities();

-- ─── الجرد المؤكد (الكيك والمواد الأولية) ────────────────────────────

-- الموظف ما بيعدل بعد التأكيد (CLAUDE.md، القاعدة 4). المسودة بتتعدل وبتنحذف.
create function private.guard_confirmed_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed' then
    raise exception 'confirmed counts are read-only' using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger stock_counts_guard
before update or delete on public.stock_counts
for each row execute function private.guard_confirmed_count();

create trigger raw_counts_guard
before update or delete on public.raw_counts
for each row execute function private.guard_confirmed_count();

-- سبب التصحيح من mekasa.change_reason (لازم ينحط بـ set_config(…, true) جوا نفس الـ transaction)
create function private.require_change_reason()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  reason text := trim(coalesce(current_setting('mekasa.change_reason', true), ''));
begin
  if length(reason) < 3 then
    raise exception 'a reason of at least 3 characters is required to correct a confirmed count'
      using errcode = 'check_violation';
  end if;
  return reason;
end;
$$;

-- سطر بجرد مؤكد: الأدمن بس بيصحح العدد، مع سبب. الحذف ممنوع، وما في أسطر جديدة،
-- والسطر ما بينقل لجرد ثاني.
create function private.guard_count_line()
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

  if not private.is_admin() then
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

create trigger stock_count_lines_guard
before insert or update or delete on public.stock_count_lines
for each row execute function private.guard_count_line();

create function private.guard_raw_count_line()
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
  from public.raw_counts c
  where c.id = case when tg_op = 'INSERT' then new.count_id else old.count_id end;

  if parent_status is distinct from 'confirmed' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'lines of a confirmed count cannot be added or removed' using errcode = 'restrict_violation';
  end if;

  if not private.is_admin() then
    raise exception 'only an admin can correct a confirmed count' using errcode = 'insufficient_privilege';
  end if;

  perform private.require_change_reason();

  if new.material_id is distinct from old.material_id then
    raise exception 'only the counted quantities can be corrected' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger raw_count_lines_guard
before insert or update or delete on public.raw_count_lines
for each row execute function private.guard_raw_count_line();

-- ─── كل حركة مطابقة لمستندها ─────────────────────────────────────────

-- الموقع والصنف والدفعة (والكمية لما تكون معروفة) لازم تطابق المستند المصدر،
-- مشان ما حدا يقدر يسجل تالف بفرع والحركة بفرع ثاني، أو بكمية غير.
create function private.check_movement_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  src_location uuid;
  src_product uuid;
  src_batch uuid;
  src_qty int;          -- null = الكمية مش محددة من المستند (تعديل الجرد هو الفرق)
  src_ready boolean := true;
  return_bin uuid;
  return_parent uuid;
  return_pieces int;
  return_batch uuid;
begin
  case new.movement_type
    when 'opening_balance', 'count_adjustment' then
      select c.location_id, l.product_id, l.batch_id, c.status = 'confirmed'
        into src_location, src_product, src_batch, src_ready
      from public.stock_count_lines l
      join public.stock_counts c on c.id = l.count_id
      where l.id = new.count_line_id;

    when 'waste' then
      select w.location_id, w.product_id, w.batch_id, -w.qty_pieces
        into src_location, src_product, src_batch, src_qty
      from public.waste_records w
      where w.id = new.waste_record_id;

    when 'production' then
      select e.location_id, l.product_id, l.batch_id, l.qty_pieces
        into src_location, src_product, src_batch, src_qty
      from public.production_lines l
      join public.production_entries e on e.id = l.entry_id
      where l.id = new.production_line_id;

    when 'dispatch_out' then
      select d.from_location_id, l.product_id, -l.qty_pieces
        into src_location, src_product, src_qty
      from public.dispatch_lines l
      join public.dispatches d on d.id = l.dispatch_id
      where l.id = new.dispatch_line_id;
      -- من المصنع: كل حركة دفعة وحدة من توزيع السطر على الدفعات
      if new.batch_id is not null then
        select b.batch_id, -b.qty_pieces into src_batch, src_qty
        from public.dispatch_line_batches b
        where b.dispatch_line_id = new.dispatch_line_id and b.batch_id = new.batch_id;
      end if;

    when 'receipt_in' then
      select r.location_id, dl.product_id, rl.qty_pieces
        into src_location, src_product, src_qty
      from public.receipt_lines rl
      join public.receipts r on r.id = rl.receipt_id
      join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
      where rl.id = new.receipt_line_id;

    when 'return_to_stock' then
      -- حركتين: طالعة من خانة المرتجعات (بدون دفعة)، وداخلة على المصنع الأب (على الدفعة اللي انختارت)
      select dl.product_id, r.location_id, bin.parent_location_id, rd.to_stock_pieces, rd.to_stock_batch_id
        into src_product, return_bin, return_parent, return_pieces, return_batch
      from public.return_dispositions rd
      join public.receipt_lines rl on rl.id = rd.receipt_line_id
      join public.receipts r on r.id = rl.receipt_id
      join public.locations bin on bin.id = r.location_id
      join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
      where rd.id = new.return_disposition_id;

      if new.location_id = return_bin then
        src_location := return_bin;
        src_qty := -return_pieces;
      elsif new.location_id = return_parent then
        src_location := return_parent;
        src_batch := return_batch;
        src_qty := return_pieces;
      end if;

    when 'admin_correction' then
      return new;
  end case;

  if not src_ready then
    raise exception 'stock moves only after the count is confirmed' using errcode = 'check_violation';
  end if;

  if new.location_id is distinct from src_location
     or new.product_id is distinct from src_product
     or new.batch_id is distinct from src_batch
     or (src_qty is not null and new.qty_pieces is distinct from src_qty)
  then
    raise exception '% movement does not match its source document', new.movement_type
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger stock_movements_match_source
before insert on public.stock_movements
for each row execute function private.check_movement_source();

-- ─── سجل التعديلات ───────────────────────────────────────────────────

-- بيسجل القيمة القديمة والجديدة والسبب (من mekasa.change_reason إذا موجود).
-- الوسائط: أسماء أعمدة المفتاح (الافتراضي id).
create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- أعمدة بتتغير مع كل محاولة دخول، ما إلها داعي بالسجل
  noise constant text[] := array['updated_at', 'failed_pin_attempts', 'locked_until', 'last_login_at'];
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - noise end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - noise end;
  key_row jsonb := coalesce(new_row, old_row);
  key_columns text[] := case when tg_nargs > 0 then tg_argv else array['id'] end;
  row_key text;
begin
  if tg_op = 'UPDATE' and old_row = new_row then
    return null;
  end if;

  select string_agg(key_row ->> k, ':') into row_key from unnest(key_columns) as k;

  insert into public.audit_log (table_name, row_id, action, old_values, new_values, reason, changed_by)
  values (
    tg_table_name,
    coalesce(row_key, '?'),
    lower(tg_op),
    old_row,
    new_row,
    nullif(trim(current_setting('mekasa.change_reason', true)), ''),
    (select s.id from public.staff s where s.id = (select auth.uid()))
  );
  return null;
end;
$$;

create trigger locations_audit after insert or update on public.locations
  for each row execute function private.audit_row();
create trigger staff_audit after insert or update on public.staff
  for each row execute function private.audit_row();
create trigger staff_roles_audit after insert or delete on public.staff_roles
  for each row execute function private.audit_row('staff_id', 'role');
create trigger app_settings_audit after update on public.app_settings
  for each row execute function private.audit_row();
create trigger products_audit after insert or update on public.products
  for each row execute function private.audit_row();
create trigger count_schedules_audit after insert or update on public.count_schedules
  for each row execute function private.audit_row();
create trigger count_form_versions_audit after insert on public.count_form_versions
  for each row execute function private.audit_row();
create trigger par_levels_audit after insert or update on public.par_levels
  for each row execute function private.audit_row('location_id', 'product_id');
create trigger raw_materials_audit after insert or update on public.raw_materials
  for each row execute function private.audit_row();
create trigger raw_material_units_audit after insert or update on public.raw_material_units
  for each row execute function private.audit_row();
-- التصحيحات وتغيير الحالة بس (الإدخال الأصلي محفوظ بالمستند نفسه)
create trigger stock_count_lines_audit after update on public.stock_count_lines
  for each row execute function private.audit_row();
create trigger raw_count_lines_audit after update on public.raw_count_lines
  for each row execute function private.audit_row();
create trigger receipt_lines_audit after update on public.receipt_lines
  for each row execute function private.audit_row();
create trigger stock_requests_audit after update on public.stock_requests
  for each row execute function private.audit_row();
create trigger dispatches_audit after update on public.dispatches
  for each row execute function private.audit_row();

-- ─── الأدوار متوافقة مع المواقع ──────────────────────────────────────

-- موظف الفرع بفرع، والإخراج وأمين المستودع بالمصنع. الأدمن بأي مكان.
create function private.assert_roles_match_location(target_staff uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  bad_role public.app_role;
begin
  select r.role into bad_role
  from public.staff_roles r
  join public.staff s on s.id = r.staff_id
  left join public.locations l on l.id = s.location_id
  where r.staff_id = target_staff
    and case r.role
          when 'admin' then false
          when 'branch_staff' then l.kind is distinct from 'branch'
          else l.kind is distinct from 'factory'
        end
  limit 1;

  if bad_role is not null then
    raise exception 'role % does not match the staff member''s location', bad_role
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.check_roles_on_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_roles_match_location(new.staff_id);
  return null;
end;
$$;

create constraint trigger staff_roles_match_location
after insert or update on public.staff_roles
deferrable initially deferred
for each row execute function private.check_roles_on_role_change();

create function private.check_roles_on_location_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_roles_match_location(new.id);
  return null;
end;
$$;

create constraint trigger staff_location_matches_roles
after update of location_id on public.staff
deferrable initially deferred
for each row execute function private.check_roles_on_location_change();

-- ─── الدفعات بالمصنع بس ──────────────────────────────────────────────

create function private.batch_required_here(loc uuid, batch uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  loc_kind public.location_kind;
begin
  select l.kind into loc_kind from public.locations l where l.id = loc;
  if loc_kind = 'factory' and batch is null then
    raise exception 'factory stock must name a batch' using errcode = 'check_violation';
  elsif loc_kind <> 'factory' and batch is not null then
    raise exception 'only the factory tracks batches' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.check_batch_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.batch_required_here(new.location_id, new.batch_id);
  return new;
end;
$$;

-- الاسم بيبلش بـ a مشان يشتغل قبل stock_movements_match_source (الترتيب أبجدي)
create trigger stock_movements_a_batch_location
before insert on public.stock_movements
for each row execute function private.check_batch_location();

create trigger waste_records_batch_location
before insert on public.waste_records
for each row execute function private.check_batch_location();

create function private.check_count_line_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.batch_required_here(
    (select c.location_id from public.stock_counts c where c.id = new.count_id),
    new.batch_id
  );
  return new;
end;
$$;

create trigger stock_count_lines_batch_location
before insert on public.stock_count_lines
for each row execute function private.check_count_line_batch();

-- الدوال الجديدة بـ private: نفس الصلاحيات
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
