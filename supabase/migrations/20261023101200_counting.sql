-- الخطوة 5: تأكيد الجرد (يدوي أو من صورة) وتصحيح الأدمن.
-- الجرد بينكتب مع أسطره وحركاته بنفس الـ transaction، وبيتسجل بوقت بدايته.

-- ─── مين بيجرد وين ───────────────────────────────────────────────────

-- الأدمن بأي موقع. موظف الفرع بفرعه، وأمين المستودع بالمصنع.
create function private.can_count_at(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.locations l
    where l.id = loc
      and l.id = private.my_location_id()
      and l.is_active
      and case l.kind
            when 'branch' then private.has_role('branch_staff')
            when 'factory' then private.has_role('storekeeper')
            else false
          end
  )
$$;

-- ─── الستوك المتوقع بلحظة ────────────────────────────────────────────

create function private.stock_at(loc uuid, product uuid, batch uuid, at timestamptz)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(m.qty_pieces), 0)::int
  from public.stock_movements m
  where m.location_id = loc
    and m.product_id = product
    and m.batch_id is not distinct from batch
    and m.occurred_at <= at
$$;

-- ─── تأكيد الجرد ─────────────────────────────────────────────────────

-- p_lines: [{ "product_id", "production_date" (المصنع بس), "whole_cakes", "loose_pieces",
--             "ocr_whole_cakes", "ocr_loose_pieces", "ocr_whole_confidence", "ocr_pieces_confidence" }]
-- أي صنف (أو دفعة بالمصنع) إله ستوك وما انعد = صفر، لأن الجرد كامل.
-- عدد القطع بالكيكة من قاعدة البيانات مش من المدخلات.
create function public.submit_count(
  p_location_id uuid,
  p_lines jsonb,
  p_started_at timestamptz default null,
  p_schedule_id uuid default null,
  p_method public.count_method default 'manual',
  p_photo_path text default null,
  p_form_version_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  loc public.locations;
  started timestamptz := coalesce(p_started_at, now());
  opening boolean;
  new_count uuid;
  line record;
  delta int;
begin
  if not private.can_count_at(p_location_id) then
    raise exception 'you cannot count at this location' using errcode = 'insufficient_privilege';
  end if;

  select * into loc from public.locations l where l.id = p_location_id;
  if loc.kind not in ('branch', 'factory') then
    raise exception 'only branches and the factory are counted' using errcode = 'check_violation';
  end if;

  -- وقت البداية من الجوال: مش بالمستقبل، ومش أقدم من 12 ساعة
  if started > now() + interval '1 minute' or started < now() - interval '12 hours' then
    raise exception 'the count start time is out of range' using errcode = 'check_violation';
  end if;

  if p_schedule_id is not null and not exists (
    select 1 from public.count_schedules s
    where s.id = p_schedule_id and s.location_id = p_location_id and s.is_active
  ) then
    raise exception 'the schedule does not belong to this location' using errcode = 'check_violation';
  end if;

  if p_form_version_id is not null and not exists (
    select 1 from public.count_form_versions f where f.id = p_form_version_id and f.location_id = p_location_id
  ) then
    raise exception 'the form version does not belong to this location' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'lines must be an array' using errcode = 'check_violation';
  end if;

  -- جرد واحد بكل موقع بنفس اللحظة، مشان "أول جرد" والمتوقع يكونوا صح
  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || p_location_id::text));

  opening := not exists (
    select 1 from public.stock_counts c where c.location_id = p_location_id and c.status = 'confirmed'
  );

  insert into public.stock_counts (
    location_id, schedule_id, business_date, method, is_opening, started_at, counted_by, photo_path, form_version_id
  )
  values (
    p_location_id, p_schedule_id, (started at time zone 'Asia/Amman')::date, p_method, opening, started, caller,
    p_photo_path, p_form_version_id
  )
  returning id into new_count;

  -- الأسطر المدخلة. الدفعة بالمصنع من تاريخ الإنتاج (بتنعمل إذا مش موجودة).
  with input as (
    select
      (e ->> 'product_id')::uuid as product_id,
      (e ->> 'production_date')::date as production_date,
      coalesce((e ->> 'whole_cakes')::int, 0) as whole_cakes,
      coalesce((e ->> 'loose_pieces')::int, 0) as loose_pieces,
      (e ->> 'ocr_whole_cakes')::int as ocr_whole_cakes,
      (e ->> 'ocr_loose_pieces')::int as ocr_loose_pieces,
      (e ->> 'ocr_whole_confidence')::numeric as ocr_whole_confidence,
      (e ->> 'ocr_pieces_confidence')::numeric as ocr_pieces_confidence
    from jsonb_array_elements(p_lines) as e
  ),
  new_batches as (
    insert into public.batches (product_id, production_date)
    select distinct i.product_id, i.production_date from input i
    where loc.kind = 'factory' and i.production_date is not null
    on conflict (product_id, production_date) do nothing
    returning id, product_id, production_date
  ),
  all_batches as (
    select id, product_id, production_date from new_batches
    union
    select b.id, b.product_id, b.production_date from public.batches b
    join input i on i.product_id = b.product_id and i.production_date = b.production_date
  )
  insert into public.stock_count_lines (
    count_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot,
    ocr_whole_cakes, ocr_loose_pieces, ocr_whole_confidence, ocr_pieces_confidence
  )
  select
    new_count, i.product_id,
    case when loc.kind = 'factory' then b.id end,
    i.whole_cakes, i.loose_pieces, p.effective_pieces_per_cake,
    i.ocr_whole_cakes, i.ocr_loose_pieces, i.ocr_whole_confidence, i.ocr_pieces_confidence
  from input i
  join public.v_products p on p.id = i.product_id
  left join all_batches b on b.product_id = i.product_id and b.production_date = i.production_date;

  if (select count(*) from public.stock_count_lines l where l.count_id = new_count) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs a known product (and a production date at the factory)'
      using errcode = 'check_violation';
  end if;

  -- اللي إله ستوك وما انعد: سطر صفر
  insert into public.stock_count_lines (count_id, product_id, batch_id, pieces_per_cake_snapshot)
  select new_count, st.product_id, st.batch_id, p.effective_pieces_per_cake
  from (
    select m.product_id, m.batch_id
    from public.stock_movements m
    where m.location_id = p_location_id and m.occurred_at <= started
    group by m.product_id, m.batch_id
    having sum(m.qty_pieces) <> 0
  ) st
  join public.v_products p on p.id = st.product_id
  where not exists (
    select 1 from public.stock_count_lines l
    where l.count_id = new_count and l.product_id = st.product_id and l.batch_id is not distinct from st.batch_id
  );

  update public.stock_counts set status = 'confirmed', confirmed_at = now() where id = new_count;

  -- الحركة = العد − المتوقع وقت البداية
  for line in
    select l.id, l.product_id, l.batch_id, l.qty_pieces from public.stock_count_lines l where l.count_id = new_count
  loop
    delta := line.qty_pieces - private.stock_at(p_location_id, line.product_id, line.batch_id, started);
    if delta <> 0 then
      insert into public.stock_movements (
        occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, created_by
      )
      values (
        started, p_location_id, line.product_id, line.batch_id, delta,
        case when opening then 'opening_balance' else 'count_adjustment' end::public.movement_type,
        line.id, caller
      );
    end if;
  end loop;

  return new_count;
end;
$$;

-- ─── تصحيح الأدمن ────────────────────────────────────────────────────

-- بيعدل العدد مع سبب (بيتسجل بـ audit_log)، وبيضيف حركة بالفرق على الجرد المصحح،
-- وحركة معاكسة على الجرد اللي بعده بنفس الموقع والصنف والدفعة (إذا موجود)،
-- مشان الستوك الحالي يضل متل الجرد الأخير والاستهلاك بالفترتين يضل صح.
create function public.admin_correct_count_line(
  p_line_id uuid,
  p_whole_cakes int,
  p_loose_pieces int,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  old_line public.stock_count_lines;
  cnt public.stock_counts;
  new_qty int;
  delta int;
  audit_id bigint;
  next_line uuid;
  next_started timestamptz;
  later_count timestamptz;
begin
  if not private.is_admin() then
    raise exception 'only an admin can correct a confirmed count' using errcode = 'insufficient_privilege';
  end if;

  select * into old_line from public.stock_count_lines l where l.id = p_line_id for update;
  if not found then
    raise exception 'count line not found' using errcode = 'no_data_found';
  end if;
  select * into cnt from public.stock_counts c where c.id = old_line.count_id;
  if cnt.status <> 'confirmed' then
    raise exception 'only confirmed counts are corrected' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || cnt.location_id::text));
  perform set_config('mekasa.change_reason', coalesce(p_reason, ''), true);

  update public.stock_count_lines
  set whole_cakes = p_whole_cakes, loose_pieces = p_loose_pieces
  where id = p_line_id
  returning qty_pieces into new_qty;

  delta := new_qty - old_line.qty_pieces;
  if delta = 0 then
    return;
  end if;

  select a.id into audit_id
  from public.audit_log a
  where a.table_name = 'stock_count_lines' and a.row_id = p_line_id::text
  order by a.id desc
  limit 1;

  insert into public.stock_movements (
    occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
  )
  values (
    cnt.started_at, cnt.location_id, old_line.product_id, old_line.batch_id, delta, 'count_adjustment',
    p_line_id, audit_id, caller
  );

  select l.id, c.started_at into next_line, next_started
  from public.stock_count_lines l
  join public.stock_counts c on c.id = l.count_id
  where c.location_id = cnt.location_id
    and c.status = 'confirmed'
    and c.started_at > cnt.started_at
    and l.product_id = old_line.product_id
    and l.batch_id is not distinct from old_line.batch_id
  order by c.started_at
  limit 1;

  -- أول جرد بعده (أي جرد، حتى لو ما فيه هالصنف)
  select min(c.started_at) into later_count
  from public.stock_counts c
  where c.location_id = cnt.location_id and c.status = 'confirmed' and c.started_at > cnt.started_at;

  if next_line is not null and next_started = later_count then
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id, correction_audit_id, created_by
    )
    values (
      next_started, cnt.location_id, old_line.product_id, old_line.batch_id, -delta, 'count_adjustment',
      next_line, audit_id, caller
    );
  elsif later_count is not null then
    -- الجرد اللي بعده ما فيه هالصنف (كان صفر)، فالعكس حركة تصحيح بوقته
    insert into public.stock_movements (
      occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, correction_audit_id, created_by
    )
    values (
      later_count, cnt.location_id, old_line.product_id, old_line.batch_id, -delta, 'admin_correction', audit_id, caller
    );
  end if;
end;
$$;

revoke execute on function private.can_count_at(uuid), private.stock_at(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function private.can_count_at(uuid), private.stock_at(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
revoke execute on function
  public.submit_count(uuid, jsonb, timestamptz, uuid, public.count_method, text, uuid),
  public.admin_correct_count_line(uuid, int, int, text)
from public, anon;
grant execute on function
  public.submit_count(uuid, jsonb, timestamptz, uuid, public.count_method, text, uuid),
  public.admin_correct_count_line(uuid, int, int, text)
to authenticated;
