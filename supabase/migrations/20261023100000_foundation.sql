-- الأساس: الأنواع، المواقع، الموظفين والأدوار، الإعدادات، الأصناف، سجل التعديلات.
-- الشرح الكامل للتصميم بـ docs/plan.md.

-- دوال مساعدة للـ RLS والـ triggers. هالـ schema مش معروض بالـ API.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('admin', 'branch_staff', 'dispatcher', 'storekeeper');
create type public.location_kind as enum ('factory', 'branch', 'returns_bin');
create type public.sell_mode as enum ('whole_and_pieces', 'pieces_only');

-- ─── الوقت ورقم اليوم ────────────────────────────────────────────────

-- اليوم التشغيلي بتوقيت عمّان
create function public.amman_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Amman')::date
$$;

-- رقم اليوم: السبت 1 … الجمعة 7. لازم يطابق src/lib/day-number.ts
create function public.day_number(d date)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select ((extract(isodow from d)::int + 1) % 7 + 1)::smallint
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── المواقع ─────────────────────────────────────────────────────────

-- المواقع بيانات مش كود (CLAUDE.md، القاعدة 5). خانة المرتجعات موقع تابع للمصنع.
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  kind public.location_kind not null,
  -- رمز قصير بينطبع على فورم الجرد وبالـ QR
  code text not null unique check (code ~ '^[A-Z]{2,5}$'),
  parent_location_id uuid references public.locations (id),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint returns_bin_has_parent check ((kind = 'returns_bin') = (parent_location_id is not null))
);

-- ─── الموظفين والأدوار ───────────────────────────────────────────────

create table public.staff (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 1 and 80),
  -- E.164 بدون +: 9627XXXXXXXX
  phone text not null unique check (phone ~ '^9627[789][0-9]{7}$'),
  -- الأدمن ممكن ما يكون إله موقع
  location_id uuid references public.locations (id),
  is_active boolean not null default true,
  -- القفل: 5 غلط ← 15 دقيقة، 10 غلط ← لحد ما الأدمن يعطي رمز جديد
  failed_pin_attempts smallint not null default 0 check (failed_pin_attempts >= 0),
  locked_until timestamptz,
  requires_admin_reset boolean not null default false,
  last_login_at timestamptz,
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_location_idx on public.staff (location_id);

create trigger staff_touch_updated_at
before update on public.staff
for each row execute function private.touch_updated_at();

-- الأدوار مش الأشخاص (CLAUDE.md، القاعدة 3): موظف ممكن ياخذ أكثر من دور.
create table public.staff_roles (
  staff_id uuid not null references public.staff (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.staff (id),
  granted_at timestamptz not null default now(),
  primary key (staff_id, role)
);

create index staff_roles_role_idx on public.staff_roles (role);

-- محاولات الدخول، للقفل وللحد لكل IP. السيرفر بس بيكتب فيه.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  phone text not null,
  ip inet,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_phone_idx on public.login_attempts (phone, attempted_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip, attempted_at desc);

-- ─── الإعدادات ───────────────────────────────────────────────────────

-- صف واحد بس. كل إعداد عمود إله نوع وحدود.
create table public.app_settings (
  id boolean primary key default true check (id),
  default_pieces_per_cake smallint not null default 10 check (default_pieces_per_cake between 1 and 50),
  order_approval_required boolean not null default false,
  branch_transfers_enabled boolean not null default true,
  returns_enabled boolean not null default false,
  unreceived_alert_hours smallint not null default 3 check (unreceived_alert_hours between 1 and 72),
  -- رقم اليوم بيتكرر كل أسبوع، فأكثر من 7 بيخلي دفعتين إلهم نفس الرقم
  factory_shelf_life_days smallint not null default 7 check (factory_shelf_life_days between 1 and 7),
  branch_shelf_life_days smallint not null default 3 check (branch_shelf_life_days between 1 and 14),
  photo_count_enabled boolean not null default true,
  count_reminder_minutes_before smallint not null default 10 check (count_reminder_minutes_before between 0 and 120),
  count_late_after_minutes smallint not null default 15 check (count_late_after_minutes between 0 and 240),
  updated_by uuid references public.staff (id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function private.touch_updated_at();

-- ─── الأصناف ─────────────────────────────────────────────────────────

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique check (length(trim(name_en)) between 1 and 80),
  name_ar text check (name_ar is null or length(trim(name_ar)) between 1 and 80),
  sell_mode public.sell_mode not null default 'whole_and_pieces',
  -- null = الرقم العام من app_settings
  pieces_per_cake smallint check (pieces_per_cake between 1 and 50),
  image_path text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pieces_only_has_no_cake_size check (sell_mode = 'whole_and_pieces' or pieces_per_cake is null)
);

create trigger products_touch_updated_at
before update on public.products
for each row execute function private.touch_updated_at();

-- ─── سجل التعديلات ───────────────────────────────────────────────────

-- ما في حذف ولا تعديل صامت (CLAUDE.md، القاعدة 4). كل تغيير مهم بينسجل هون مع سببه.
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  reason text,
  -- null = النظام (service role)
  changed_by uuid references public.staff (id),
  changed_at timestamptz not null default now()
);

create index audit_log_row_idx on public.audit_log (table_name, row_id, changed_at desc);
