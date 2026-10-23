-- الخطوة 10: قراءات لوحة الأدمن. كلها security invoker (RLS تبع اللي بيقرأ).

-- ─── تفاصيل جرد: لكل سطر شو كان قبل، شو دخل وطلع، المتوقع، العد، والاستهلاك ───

-- المتوقع = العد − التعديل (نفس اللي استعمله الدفتر)، والأعمدة الثانية للشرح.
-- "قبل" من الجرد المؤكد اللي قبله بنفس الموقع (صفر إذا الصنف ما كان فيه، null إذا ما في جرد قبل).
create function public.count_breakdown(p_count_id uuid)
returns table (
  line_id uuid,
  product_id uuid,
  batch_id uuid,
  pieces_per_cake smallint,
  whole_cakes int,
  loose_pieces int,
  counted_qty int,
  prev_qty int,
  in_qty int,
  out_qty int,
  waste_qty int,
  other_qty int,
  adjustment_qty int,
  expected_qty int,
  ocr_whole_cakes int,
  ocr_loose_pieces int,
  ocr_whole_confidence numeric,
  ocr_pieces_confidence numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (
    select sc.* from public.stock_counts sc where sc.id = p_count_id and sc.status = 'confirmed'
  ),
  prev as (
    select pc.id, pc.started_at
    from public.stock_counts pc, c
    where pc.location_id = c.location_id and pc.status = 'confirmed' and pc.started_at < c.started_at
    order by pc.started_at desc
    limit 1
  ),
  lines as (
    select l.*, c.location_id, c.started_at as count_at from public.stock_count_lines l join c on c.id = l.count_id
  ),
  moves as (
    select
      l.id as line_id,
      coalesce(sum(m.qty_pieces) filter (where m.movement_type in ('production', 'receipt_in', 'return_to_stock')), 0)::int as in_qty,
      coalesce(-sum(m.qty_pieces) filter (where m.movement_type = 'dispatch_out'), 0)::int as out_qty,
      coalesce(-sum(m.qty_pieces) filter (where m.movement_type = 'waste'), 0)::int as waste_qty,
      coalesce(sum(m.qty_pieces) filter (where m.movement_type = 'admin_correction'), 0)::int as other_qty
    from lines l
    left join public.stock_movements m
      on m.location_id = l.location_id
     and m.product_id = l.product_id
     and m.batch_id is not distinct from l.batch_id
     and m.occurred_at > coalesce((select started_at from prev), '-infinity'::timestamptz)
     and m.occurred_at <= l.count_at
    group by l.id
  ),
  adjustments as (
    select m.count_line_id as line_id, sum(m.qty_pieces)::int as adjustment_qty
    from public.stock_movements m
    where m.count_line_id in (select id from lines) and m.movement_type in ('count_adjustment', 'opening_balance')
    group by m.count_line_id
  )
  select
    l.id, l.product_id, l.batch_id, l.pieces_per_cake_snapshot, l.whole_cakes, l.loose_pieces, l.qty_pieces,
    case when (select id from prev) is null then null
         else coalesce((
           select pl.qty_pieces from public.stock_count_lines pl
           where pl.count_id = (select id from prev) and pl.product_id = l.product_id
             and pl.batch_id is not distinct from l.batch_id
         ), 0)
    end,
    mv.in_qty, mv.out_qty, mv.waste_qty, mv.other_qty,
    coalesce(a.adjustment_qty, 0),
    l.qty_pieces - coalesce(a.adjustment_qty, 0),
    l.ocr_whole_cakes, l.ocr_loose_pieces, l.ocr_whole_confidence, l.ocr_pieces_confidence
  from lines l
  join moves mv on mv.line_id = l.id
  left join adjustments a on a.line_id = l.id
  join public.products p on p.id = l.product_id
  order by p.sort_order, l.batch_id
$$;

-- ─── قائمة الجرودات مع ملخص ──────────────────────────────────────────

create view public.v_count_list with (security_invoker = true) as
select
  c.id,
  c.location_id,
  c.business_date,
  c.started_at,
  c.confirmed_at,
  c.method,
  c.is_opening,
  c.counted_by,
  c.photo_path,
  s.time_of_day as schedule_time,
  count(l.id)::int as line_count,
  -- الاستهلاك بالقطع، وبالكيكات حسب حجم كل صنف (الأصناف اللي قطع بس لحالها)
  coalesce(sum(-adj.qty) filter (where not c.is_opening), 0)::int as consumed_pieces,
  round(coalesce(sum(-adj.qty::numeric / l.pieces_per_cake_snapshot)
        filter (where not c.is_opening and l.pieces_per_cake_snapshot is not null), 0), 1) as consumed_cakes,
  coalesce(sum(-adj.qty) filter (where not c.is_opening and l.pieces_per_cake_snapshot is null), 0)::int as consumed_loose_only,
  -- العد أكثر من المتوقع
  count(*) filter (where not c.is_opening and adj.qty > 0)::int as impossible_lines,
  -- الموظف غيّر رقم قرأه Claude
  count(*) filter (where l.ocr_loose_pieces is not null and l.ocr_loose_pieces <> l.loose_pieces
                      or l.ocr_whole_cakes is not null and l.ocr_whole_cakes <> l.whole_cakes)::int as staff_corrected_lines
from public.stock_counts c
left join public.count_schedules s on s.id = c.schedule_id
left join public.stock_count_lines l on l.count_id = c.id
left join lateral (
  select coalesce(sum(m.qty_pieces), 0)::int as qty
  from public.stock_movements m
  where m.count_line_id = l.id and m.movement_type in ('count_adjustment', 'opening_balance')
) adj on true
where c.status = 'confirmed'
group by c.id, s.time_of_day;

revoke all on public.v_count_list from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_count_list from authenticated;
revoke execute on function public.count_breakdown(uuid) from public, anon;
grant execute on function public.count_breakdown(uuid) to authenticated;
