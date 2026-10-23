-- المرحلة 2 (الجداول من هلأ، الشاشات بعدين): الحد المطلوب، الطلب، الإخراج، الاستلام،
-- الإنتاج، وقرارات المرتجعات. الطلب والإخراج والاستلام ثلاث مستندات منفصلة.

create type public.request_status as enum ('pending_approval', 'sent', 'dispatched', 'received', 'cancelled');
create type public.dispatch_kind as enum ('replenishment', 'transfer', 'return');
create type public.dispatch_status as enum ('in_transit', 'received', 'cancelled');
create type public.discrepancy_resolution as enum ('waste', 'review', 'resolved');

-- ─── الحد المطلوب ────────────────────────────────────────────────────

create table public.par_levels (
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  par_pieces int not null check (par_pieces >= 0),
  updated_by uuid references public.staff (id),
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id)
);

create trigger par_levels_touch_updated_at
before update on public.par_levels
for each row execute function private.touch_updated_at();

-- ─── الطلب: ما بيغير الستوك ──────────────────────────────────────────

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_location_id uuid not null references public.locations (id),
  supplying_location_id uuid not null references public.locations (id),
  status public.request_status not null default 'sent',
  requested_by uuid not null references public.staff (id),
  requested_at timestamptz not null default now(),
  approved_by uuid references public.staff (id),
  approved_at timestamptz,
  note text check (note is null or length(note) <= 500),
  constraint request_between_two_locations check (requesting_location_id <> supplying_location_id),
  constraint approval_is_complete check ((approved_by is null) = (approved_at is null))
);

create index stock_requests_requesting_idx on public.stock_requests (requesting_location_id, requested_at desc);
create index stock_requests_supplying_idx on public.stock_requests (supplying_location_id, status);

create table public.stock_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stock_requests (id),
  product_id uuid not null references public.products (id),
  whole_cakes int not null default 0 check (whole_cakes >= 0),
  loose_pieces int not null default 0 check (loose_pieces >= 0),
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (whole_cakes * coalesce(pieces_per_cake_snapshot, 0) + loose_pieces) stored,
  -- الكمية اللي اقترحها التطبيق (الحد − الموجود) وقت الطلب
  suggested_pieces int check (suggested_pieces >= 0),
  constraint cakes_need_cake_size check (pieces_per_cake_snapshot is not null or whole_cakes = 0),
  constraint line_not_empty check (whole_cakes + loose_pieces > 0),
  unique (request_id, product_id)
);

-- ─── الإخراج: بينقص ستوك المصدر ──────────────────────────────────────

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references public.locations (id),
  to_location_id uuid not null references public.locations (id),
  request_id uuid references public.stock_requests (id),
  kind public.dispatch_kind not null,
  status public.dispatch_status not null default 'in_transit',
  dispatched_by uuid not null references public.staff (id),
  dispatched_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500),
  constraint dispatch_between_two_locations check (from_location_id <> to_location_id)
);

create index dispatches_from_idx on public.dispatches (from_location_id, dispatched_at desc);
create index dispatches_to_idx on public.dispatches (to_location_id, status);
create index dispatches_request_idx on public.dispatches (request_id);

create table public.dispatch_lines (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches (id),
  product_id uuid not null references public.products (id),
  -- null = صنف ما انطلب (المصنع ضافه)
  request_line_id uuid references public.stock_request_lines (id),
  whole_cakes int not null default 0 check (whole_cakes >= 0),
  loose_pieces int not null default 0 check (loose_pieces >= 0),
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (whole_cakes * coalesce(pieces_per_cake_snapshot, 0) + loose_pieces) stored,
  constraint cakes_need_cake_size check (pieces_per_cake_snapshot is not null or whole_cakes = 0),
  constraint line_not_empty check (whole_cakes + loose_pieces > 0),
  unique (dispatch_id, product_id)
);

-- من أي دفعة طلع كل سطر (لما المصدر المصنع). الأقدم أول (FEFO)، والتجاوز بينسجل.
create table public.dispatch_line_batches (
  id uuid primary key default gen_random_uuid(),
  dispatch_line_id uuid not null references public.dispatch_lines (id),
  batch_id uuid not null references public.batches (id),
  qty_pieces int not null check (qty_pieces > 0),
  is_fefo_override boolean not null default false,
  override_confirmed_by uuid references public.staff (id),
  unique (dispatch_line_id, batch_id),
  constraint override_is_confirmed check (not is_fefo_override or override_confirmed_by is not null)
);

-- ─── الاستلام: بيزيد ستوك الوجهة ─────────────────────────────────────

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references public.dispatches (id),
  location_id uuid not null references public.locations (id),
  received_by uuid not null references public.staff (id),
  received_at timestamptz not null default now()
);

-- أسطر الاستلام هي أسطر الإخراج. الفرق بينهم مشكلة بتروح للأدمن.
create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id),
  dispatch_line_id uuid not null unique references public.dispatch_lines (id),
  whole_cakes int not null default 0 check (whole_cakes >= 0),
  loose_pieces int not null default 0 check (loose_pieces >= 0),
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (whole_cakes * coalesce(pieces_per_cake_snapshot, 0) + loose_pieces) stored,
  note text check (note is null or length(note) <= 300),
  -- قرار الأدمن على الفرق: اعتمده تالف، علّقه للمراجعة، أو انحل
  resolution public.discrepancy_resolution,
  resolved_by uuid references public.staff (id),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 300),
  constraint cakes_need_cake_size check (pieces_per_cake_snapshot is not null or whole_cakes = 0),
  constraint resolution_is_complete check (
    (resolution is null) = (resolved_at is null) and (resolution is null) = (resolved_by is null)
  )
);

create index receipt_lines_receipt_idx on public.receipt_lines (receipt_id);

-- ─── الإنتاج ─────────────────────────────────────────────────────────

-- أكثر من تسجيل باليوم مسموح. كل سطر بيدخل بدفعة (الصنف + تاريخ الإنتاج).
create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id),
  production_date date not null default public.amman_today(),
  recorded_by uuid not null references public.staff (id),
  recorded_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 300)
);

create index production_entries_date_idx on public.production_entries (location_id, production_date desc);

create table public.production_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.production_entries (id),
  product_id uuid not null references public.products (id),
  batch_id uuid not null references public.batches (id),
  whole_cakes int not null default 0 check (whole_cakes >= 0),
  loose_pieces int not null default 0 check (loose_pieces >= 0),
  pieces_per_cake_snapshot smallint check (pieces_per_cake_snapshot between 1 and 50),
  qty_pieces int generated always as (whole_cakes * coalesce(pieces_per_cake_snapshot, 0) + loose_pieces) stored,
  constraint cakes_need_cake_size check (pieces_per_cake_snapshot is not null or whole_cakes = 0),
  constraint line_not_empty check (whole_cakes + loose_pieces > 0),
  unique (entry_id, product_id)
);

-- ─── قرارات المرتجعات ────────────────────────────────────────────────

-- لما الإرجاع يتفعّل: الراجع بيوصل لخانة المرتجعات، وأمين المستودع بيقرر.
create table public.return_dispositions (
  id uuid primary key default gen_random_uuid(),
  receipt_line_id uuid not null references public.receipt_lines (id),
  to_stock_pieces int not null default 0 check (to_stock_pieces >= 0),
  to_stock_batch_id uuid references public.batches (id),
  to_waste_pieces int not null default 0 check (to_waste_pieces >= 0),
  waste_record_id uuid references public.waste_records (id),
  decided_by uuid not null references public.staff (id),
  decided_at timestamptz not null default now(),
  constraint decision_not_empty check (to_stock_pieces + to_waste_pieces > 0),
  constraint stock_needs_batch check (to_stock_pieces = 0 or to_stock_batch_id is not null),
  constraint waste_needs_record check (to_waste_pieces = 0 or waste_record_id is not null)
);
