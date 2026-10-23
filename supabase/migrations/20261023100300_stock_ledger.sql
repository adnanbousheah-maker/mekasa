-- دفتر حركات الستوك: الستوك = مجموع الحركات (CLAUDE.md، القاعدة 1).
-- كل صف تغيير واحد بموقع واحد، ومربوط بالمستند اللي سببه. ما في تعديل ولا حذف أبداً.

create type public.movement_type as enum (
  'opening_balance',   -- أول جرد بالموقع
  'count_adjustment',  -- الفرق بين العد والمتوقع (سالبه = الاستهلاك)
  'waste',
  'production',
  'dispatch_out',
  'receipt_in',
  'return_to_stock',   -- من خانة المرتجعات للستوك
  'admin_correction'   -- تصحيح الأدمن مع سبب بسجل التعديلات
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  -- وقت الحدث الفعلي (مثلاً بداية الجرد)، مش وقت الكتابة
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  -- بالمصنع لازم، وبالفروع ممنوع (trigger بـ integrity)
  batch_id uuid references public.batches (id),
  qty_pieces int not null check (qty_pieces <> 0),
  movement_type public.movement_type not null,

  -- المستند المصدر: واحد بس
  count_line_id uuid references public.stock_count_lines (id),
  waste_record_id uuid references public.waste_records (id),
  production_line_id uuid references public.production_lines (id),
  dispatch_line_id uuid references public.dispatch_lines (id),
  receipt_line_id uuid references public.receipt_lines (id),
  return_disposition_id uuid references public.return_dispositions (id),
  -- موجود لما الحركة جاية من تصحيح أدمن
  correction_audit_id bigint references public.audit_log (id),

  created_by uuid references public.staff (id),

  constraint one_source_document check (
    num_nonnulls(count_line_id, waste_record_id, production_line_id, dispatch_line_id,
                 receipt_line_id, return_disposition_id) <= 1
  ),
  constraint source_matches_type check (
    case movement_type
      when 'opening_balance' then count_line_id is not null
      when 'count_adjustment' then count_line_id is not null
      when 'waste' then waste_record_id is not null and qty_pieces < 0
      when 'production' then production_line_id is not null and qty_pieces > 0
      when 'dispatch_out' then dispatch_line_id is not null and qty_pieces < 0
      when 'receipt_in' then receipt_line_id is not null and qty_pieces > 0
      when 'return_to_stock' then return_disposition_id is not null
      when 'admin_correction' then correction_audit_id is not null
        and num_nonnulls(count_line_id, waste_record_id, production_line_id, dispatch_line_id,
                         receipt_line_id, return_disposition_id) = 0
      -- نوع جديد بالـ enum لازم ينضافله شرط هون
      else false
    end
  ),
  -- ما في حركات بالمستقبل
  constraint not_in_the_future check (occurred_at <= recorded_at + interval '5 minutes')
);

create index stock_movements_stock_idx on public.stock_movements (location_id, product_id, batch_id, occurred_at);
create index stock_movements_time_idx on public.stock_movements (occurred_at);
create index stock_movements_count_line_idx on public.stock_movements (count_line_id) where count_line_id is not null;
create index stock_movements_waste_idx on public.stock_movements (waste_record_id) where waste_record_id is not null;
create index stock_movements_production_idx on public.stock_movements (production_line_id) where production_line_id is not null;
create index stock_movements_dispatch_idx on public.stock_movements (dispatch_line_id) where dispatch_line_id is not null;
create index stock_movements_receipt_idx on public.stock_movements (receipt_line_id) where receipt_line_id is not null;

-- كل مستند بينحسب مرة وحدة: لو الطلب انبعت مرتين، الثانية بتفشل.
-- تعديل الجرد ممكن يتكرر بس مع تصحيح أدمن (correction_audit_id).
create unique index stock_movements_one_opening_idx
  on public.stock_movements (count_line_id) where movement_type = 'opening_balance';
create unique index stock_movements_one_adjustment_idx
  on public.stock_movements (count_line_id) where movement_type = 'count_adjustment' and correction_audit_id is null;
create unique index stock_movements_one_waste_idx
  on public.stock_movements (waste_record_id) where movement_type = 'waste';
create unique index stock_movements_one_production_idx
  on public.stock_movements (production_line_id) where movement_type = 'production';
create unique index stock_movements_one_dispatch_idx
  on public.stock_movements (dispatch_line_id, batch_id) nulls not distinct where movement_type = 'dispatch_out';
create unique index stock_movements_one_receipt_idx
  on public.stock_movements (receipt_line_id) where movement_type = 'receipt_in';
create unique index stock_movements_one_return_idx
  on public.stock_movements (return_disposition_id, location_id) where movement_type = 'return_to_stock';
