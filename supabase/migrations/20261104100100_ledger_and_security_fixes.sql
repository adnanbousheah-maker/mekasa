-- مراجعة 4 نوفمبر 2026 (الحركات والأمان والإشعارات):
-- 1) جرد بدأ قبل آخر جرد مؤكد بالموقع (شاشة فاتحة من بدري) كان بيحسب الفرق مرتين. هلا بينرفض.
-- 2) المرتجع: التالف من التوصيل انحسب تالف بالمرتجعات، فما بيرجع للستوك كمان مرة.
-- 3) التحويل والإرجاع من فرع: ما بيطلع أكثر من الموجود بالدفتر.
-- 4) الطلبية المقترحة بعد نص الليل: "بكرا" من يوم الجرد.
-- 5) رمز دخول جديد بيطلّع الموظف من كل أجهزته.
-- 6) الجهاز اللي مسجل قبل ما بيتعدّ مرة ثانية بحد الـ 5 أجهزة.

-- ─── 1) جرد بوقت بداية قديم ─────────────────────────────────────────

-- submit_count ماسك قفل الموقع قبل ما يسجل، فهالفحص صح حتى لو جردين بنفس اللحظة
create function private.reject_stale_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.stock_counts c
    where c.location_id = new.location_id and c.id <> new.id and c.status = 'confirmed'
      and c.started_at > new.started_at
  ) then
    raise exception 'a newer count was already confirmed here' using errcode = 'check_violation', hint = 'stale_count';
  end if;
  return new;
end;
$$;

-- بعد الإضافة: الصلاحيات (RLS) والقيود الفريدة بيطلعوا أخطاءهم أول
create trigger stock_counts_not_stale after insert on public.stock_counts
  for each row execute function private.reject_stale_count();

-- ─── 2) المرتجع بدون التالف من التوصيل ──────────────────────────────

-- نفس الدالة (20261023101600)، بس الباقي = المستلم − التالف بالتوصيل − اللي انقرر
create or replace function public.decide_return(
  p_receipt_line_id uuid,
  p_to_stock_pieces integer,
  p_to_waste_pieces integer,
  p_to_stock_production_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  bin public.locations;
  line record;
  decided int;
  batch uuid;
  waste uuid;
  decision uuid;
begin
  select rl.id, rl.qty_pieces, coalesce(rl.damaged_pieces, 0) as damaged_pieces, dl.product_id, rc.location_id,
         dl.pieces_per_cake_snapshot
    into line
  from public.receipt_lines rl
  join public.receipts rc on rc.id = rl.receipt_id
  join public.dispatch_lines dl on dl.id = rl.dispatch_line_id
  where rl.id = p_receipt_line_id
  for update of rl;

  select * into bin from public.locations where id = line.location_id;
  if line.id is null or bin.kind <> 'returns_bin'
     or bin.parent_location_id is distinct from private.my_location_id() or not private.has_role('storekeeper') then
    raise exception 'you cannot decide on this return' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(d.to_stock_pieces + d.to_waste_pieces), 0) into decided
  from public.return_dispositions d where d.receipt_line_id = line.id;
  if coalesce(p_to_stock_pieces, 0) < 0 or coalesce(p_to_waste_pieces, 0) < 0
     or coalesce(p_to_stock_pieces, 0) + coalesce(p_to_waste_pieces, 0) > line.qty_pieces - line.damaged_pieces - decided then
    raise exception 'more than what is left of this return' using errcode = 'check_violation';
  end if;

  if p_to_stock_pieces > 0 then
    if p_to_stock_production_date is null or p_to_stock_production_date > public.amman_today() then
      raise exception 'returning to stock needs the batch date' using errcode = 'check_violation';
    end if;
    batch := private.upsert_batch(line.product_id, p_to_stock_production_date);
  end if;

  if p_to_waste_pieces > 0 then
    insert into public.waste_records (location_id, product_id, entered_unit, entered_qty, pieces_per_cake_snapshot, reason, reason_note, recorded_by)
    values (bin.id, line.product_id, 'piece', p_to_waste_pieces, line.pieces_per_cake_snapshot, 'other', 'مرتجع من فرع', caller)
    returning id into waste;
    insert into public.stock_movements (occurred_at, location_id, product_id, qty_pieces, movement_type, waste_record_id, created_by)
    values (now(), bin.id, line.product_id, -p_to_waste_pieces, 'waste', waste, caller);
  end if;

  insert into public.return_dispositions (receipt_line_id, to_stock_pieces, to_stock_batch_id, to_waste_pieces, waste_record_id, decided_by)
  values (line.id, coalesce(p_to_stock_pieces, 0), batch, coalesce(p_to_waste_pieces, 0), waste, caller)
  returning id into decision;

  if p_to_stock_pieces > 0 then
    insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, return_disposition_id, created_by)
    values
      (now(), bin.id, line.product_id, null, -p_to_stock_pieces, 'return_to_stock', decision, caller),
      (now(), bin.parent_location_id, line.product_id, batch, p_to_stock_pieces, 'return_to_stock', decision, caller);
  end if;
  return decision;
end;
$$;

-- ─── 3) الفرع ما بيطلّع أكثر من الموجود ──────────────────────────────

-- الإخراج من المصنع بيفحص الدفعات بنفسه، ومستودع التغليف ما بيفحص (متل ما هو). هون الفروع بس.
create function private.check_branch_dispatch_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  have int;
begin
  if new.movement_type = 'dispatch_out'
     and (select l.kind from public.locations l where l.id = new.location_id) = 'branch' then
    perform pg_advisory_xact_lock(hashtext('mekasa:stock:' || new.location_id::text));
    select coalesce(sum(m.qty_pieces), 0) into have
    from public.stock_movements m
    where m.location_id = new.location_id and m.product_id = new.product_id;
    if have + new.qty_pieces < 0 then
      raise exception 'not enough stock at the branch' using errcode = 'check_violation', hint = 'not_enough_stock';
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_movements_branch_dispatch_stock before insert on public.stock_movements
  for each row execute function private.check_branch_dispatch_stock();

-- ─── 4) الطلبية المقترحة على يوم الجرد ──────────────────────────────

-- نفس الدالة (20261025100800)، بس "بكرا" بعد يوم الجرد (بعد نص الليل لحد 5 الصبح لسا اليوم)
create or replace function public.branch_suggestions(p_branch_id uuid)
returns table (product_id uuid, stock_pieces int, par_pieces int, avg_pieces int, days_used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tomorrow date := public.count_day_today() + 1;
  days date[] := array[tomorrow - 7, tomorrow - 14, tomorrow - 21, tomorrow - 28];
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
         pl.par_pieces,
         case when pd.days > 0 then ceil(greatest(0, pd.used) / pd.days::numeric)::int end,
         coalesce(pd.days, 0)
  from public.products p
  left join public.par_levels pl on pl.location_id = p_branch_id and pl.product_id = p.id
  left join lateral (
    select count(*)::int as days, -sum(x.adjusted) as used
    from (
      select c.business_date,
             sum(cl.qty_pieces) as counted,
             coalesce(sum((select sum(m.qty_pieces) from public.stock_movements m
                           where m.count_line_id = cl.id and m.movement_type = 'count_adjustment')), 0) as adjusted
      from public.stock_counts c
      join public.stock_count_lines cl on cl.count_id = c.id and cl.product_id = p.id
      where c.location_id = p_branch_id and c.status = 'confirmed' and not c.is_opening
        and c.business_date = any (days)
      group by c.business_date
    ) x
    where x.counted > 0 or x.adjusted <> 0
  ) pd on true
  where p.is_active
    and exists (select 1 from public.locations l where l.id = p_branch_id and l.kind = 'branch');
end;
$$;

-- ─── 5) رمز جديد = خروج من كل الأجهزة ───────────────────────────────

-- نفس الدالة (20261023101000)، وكمان بتمسح جلسات الموظف (إلا إذا الأدمن بيغير رمزه هو)
create or replace function public.admin_record_pin_reset(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an admin can manage staff' using errcode = 'insufficient_privilege';
  end if;

  update public.staff
  set failed_pin_attempts = 0, locked_until = null, requires_admin_reset = false
  where id = p_staff_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'no_data_found';
  end if;

  if p_staff_id is distinct from (select auth.uid()) then
    delete from auth.sessions where user_id = p_staff_id;
  end if;

  insert into public.audit_log (table_name, row_id, action, reason, changed_by)
  values ('staff', p_staff_id::text, 'update', 'رمز دخول جديد', (select auth.uid()));
end;
$$;

-- ─── 6) حد الأجهزة ما بيعدّ نفس الجهاز ──────────────────────────────

create or replace function private.limit_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions p
      where p.staff_id = new.staff_id and p.endpoint is distinct from new.endpoint) >= 5 then
    raise exception 'a staff member can have at most 5 push subscriptions' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
