-- المرحلة 3 (الجداول من هلأ): المواد الأولية بالمصنع.
-- نفس الفكرة: الموجود = مجموع حركات بالوحدة الأساسية للمادة.

create type public.raw_movement_type as enum (
  'opening_balance',
  'receipt',           -- استلام من مورد
  'issue',             -- صرف للإنتاج
  'count_adjustment',
  'admin_correction'
);

create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 80),
  -- الوحدة الأساسية: كيلو، لتر، حبة…
  base_unit text not null check (length(trim(base_unit)) between 1 and 20),
  min_qty numeric(12, 3) not null default 0 check (min_qty >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger raw_materials_touch_updated_at
before update on public.raw_materials
for each row execute function private.touch_updated_at();

-- تحويلات الوحدات: الكيس = 25 كيلو
create table public.raw_material_units (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.raw_materials (id),
  unit_name text not null check (length(trim(unit_name)) between 1 and 20),
  factor_to_base numeric(12, 3) not null check (factor_to_base > 0),
  unique (material_id, unit_name)
);

create table public.raw_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  business_date date not null default public.amman_today(),
  status public.count_status not null default 'draft',
  started_at timestamptz not null default now(),
  confirmed_at timestamptz,
  counted_by uuid not null references public.staff (id),
  created_at timestamptz not null default now(),
  constraint confirmed_has_time check ((status = 'confirmed') = (confirmed_at is not null))
);

create index raw_counts_location_idx on public.raw_counts (location_id, started_at desc);

create table public.raw_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.raw_counts (id),
  material_id uuid not null references public.raw_materials (id),
  -- null = الوحدة الأساسية
  entered_unit_id uuid references public.raw_material_units (id),
  entered_qty numeric(12, 3) not null check (entered_qty >= 0),
  qty_base numeric(14, 3) not null check (qty_base >= 0),
  unique (count_id, material_id)
);

create table public.raw_movements (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  location_id uuid not null references public.locations (id),
  material_id uuid not null references public.raw_materials (id),
  qty_base numeric(14, 3) not null check (qty_base <> 0),
  movement_type public.raw_movement_type not null,
  -- شو كتب الموظف (مثلاً 4 أكياس)
  entered_unit_id uuid references public.raw_material_units (id),
  entered_qty numeric(12, 3) check (entered_qty > 0),
  supplier_name text check (supplier_name is null or length(trim(supplier_name)) between 1 and 80),
  invoice_photo_path text,
  raw_count_line_id uuid references public.raw_count_lines (id),
  correction_audit_id bigint references public.audit_log (id),
  created_by uuid references public.staff (id),
  constraint source_matches_type check (
    case movement_type
      when 'receipt' then qty_base > 0
      when 'issue' then qty_base < 0
      when 'opening_balance' then raw_count_line_id is not null
      when 'count_adjustment' then raw_count_line_id is not null
      when 'admin_correction' then correction_audit_id is not null
      else false
    end
  ),
  constraint supplier_only_on_receipt check (
    movement_type = 'receipt' or (supplier_name is null and invoice_photo_path is null)
  ),
  constraint invoice_in_location_folder check (
    invoice_photo_path is null or invoice_photo_path like location_id::text || '/%'
  ),
  constraint not_in_the_future check (occurred_at <= recorded_at + interval '5 minutes')
);

create index raw_movements_stock_idx on public.raw_movements (location_id, material_id, occurred_at);
create index raw_movements_issue_idx on public.raw_movements (material_id, occurred_at) where movement_type = 'issue';

-- كل سطر جرد بينحسب مرة وحدة (إلا تصحيحات الأدمن)
create unique index raw_movements_one_per_count_line_idx
  on public.raw_movements (raw_count_line_id)
  where movement_type in ('opening_balance', 'count_adjustment') and correction_audit_id is null;
