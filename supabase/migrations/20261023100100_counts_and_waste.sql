-- المرحلة 1: مواعيد الجرد، نسخ الفورم المطبوع، الدفعات، الجرد، والتالف.

create type public.count_method as enum ('manual', 'photo');
create type public.count_status as enum ('draft', 'confirmed');
create type public.waste_reason as enum ('expired', 'broken', 'other');
create type public.entry_unit as enum ('cake', 'piece');

-- ─── مواعيد الجرد ────────────────────────────────────────────────────

create table public.count_schedules (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  -- بتوقيت عمّان
  time_of_day time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, time_of_day)
);

-- ─── نسخ فورم الجرد المطبوع ──────────────────────────────────────────

-- ترتيب الأصناف بالفورم الورقي. الـ QR فيه رمز الموقع ورقم النسخة،
-- فقراءة الصورة بتعرف أي صنف بكل سطر حتى لو تغيرت الأصناف بعدين.
create table public.count_form_versions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  version int not null check (version >= 1),
  product_ids uuid[] not null check (cardinality(product_ids) between 1 and 60),
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now(),
  unique (location_id, version)
);

-- ─── الدفعات ─────────────────────────────────────────────────────────

-- دفعة = صنف + تاريخ إنتاج. الدفعات بالمصنع بس (الفروع ما بتتبعها).
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  production_date date not null,
  day_number smallint generated always as (public.day_number(production_date)) stored,
  created_at timestamptz not null default now(),
  unique (product_id, production_date)
);

create index batches_production_date_idx on public.batches (production_date);

-- ─── الجرد ───────────────────────────────────────────────────────────

-- الجرد بينسجل بوقت بدايته (started_at = لما الموظف فتح الشاشة).
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  schedule_id uuid references public.count_schedules (id),
  business_date date not null default public.amman_today(),
  method public.count_method not null,
  status public.count_status not null default 'draft',
  -- أول جرد بكل موقع: رصيد افتتاحي، ما بيدخل بالاستهلاك
  is_opening boolean not null default false,
  started_at timestamptz not null default now(),
  confirmed_at timestamptz,
  counted_by uuid not null references public.staff (id),
  photo_path text,
  form_version_id uuid references public.count_form_versions (id),
  created_at timestamptz not null default now(),
  constraint confirmed_has_time check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint confirmed_photo_count_has_photo check (
    method = 'manual' or status = 'draft' or photo_path is not null
  ),
  -- الصورة لازم تكون بمجلد نفس الموقع، مشان ما حدا يربط جرده بصورة فرع ثاني
  constraint photo_in_location_folder check (photo_path is null or photo_path like location_id::text || '/%')
);

create index stock_counts_location_idx on public.stock_counts (location_id, started_at desc);
-- جرد واحد مؤكد لكل موعد بكل يوم
create unique index stock_counts_one_per_slot_idx
  on public.stock_counts (schedule_id, business_date)
  where status = 'confirmed' and schedule_id is not null;

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts (id),
  product_id uuid not null references public.products (id),
  -- بالمصنع بس: الجرد حسب رقم الدفعة
  batch_id uuid references public.batches (id),
  whole_cakes int not null default 0 check (whole_cakes >= 0),
  loose_pieces int not null default 0 check (loose_pieces >= 0),
  -- عدد القطع بالكيكة وقت الجرد، مشان تغيير الإعداد ما يغير التاريخ. null للأصناف اللي قطع بس
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (whole_cakes * coalesce(pieces_per_cake_snapshot, 0) + loose_pieces) stored,
  -- قراءة Claude من الصورة، ودرجة الثقة لكل رقم (0–1). الفرق عن الرقم النهائي = تصحيح الموظف
  ocr_whole_cakes int check (ocr_whole_cakes >= 0),
  ocr_loose_pieces int check (ocr_loose_pieces >= 0),
  ocr_whole_confidence numeric(4, 3) check (ocr_whole_confidence between 0 and 1),
  ocr_pieces_confidence numeric(4, 3) check (ocr_pieces_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  constraint cakes_need_cake_size check (pieces_per_cake_snapshot is not null or whole_cakes = 0),
  unique nulls not distinct (count_id, product_id, batch_id)
);

create index stock_count_lines_product_idx on public.stock_count_lines (product_id);

-- ─── التالف ──────────────────────────────────────────────────────────

create table public.waste_records (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  -- بالمصنع بس
  batch_id uuid references public.batches (id),
  -- شو اختار الموظف: "كيكة كاملة" أو "قطعة"
  entered_unit public.entry_unit not null,
  entered_qty int not null check (entered_qty > 0),
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (
    entered_qty * case when entered_unit = 'cake' then pieces_per_cake_snapshot else 1 end
  ) stored,
  reason public.waste_reason not null,
  reason_note text check (reason_note is null or length(trim(reason_note)) between 1 and 200),
  photo_path text,
  recorded_by uuid not null references public.staff (id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint cake_waste_needs_cake_size check (entered_unit = 'piece' or pieces_per_cake_snapshot is not null),
  constraint other_reason_needs_note check (reason <> 'other' or reason_note is not null),
  constraint photo_in_location_folder check (photo_path is null or photo_path like location_id::text || '/%')
);

create index waste_records_location_idx on public.waste_records (location_id, occurred_at desc);
