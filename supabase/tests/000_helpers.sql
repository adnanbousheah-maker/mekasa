-- دوال مساعدة للاختبارات. هالملف بيشتغل أول (الترتيب أبجدي) وبيضل بقاعدة البيانات
-- المحلية بس (ما في rollback). ما إله علاقة بالـ migrations ولا بينرفع للسحابة.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- موظف تجريبي: مستخدم auth + صف staff + أدوار، بموقع حسب رمزه
create or replace function tests.create_staff(
  uid uuid,
  full_name text,
  phone text,
  location_code text,
  roles public.app_role[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (uid, 'authenticated', 'authenticated', phone || '@test.mekasa.local', now(), now());

  insert into public.staff (id, full_name, phone, location_id)
  values (uid, full_name, phone, (select l.id from public.locations l where l.code = location_code));

  insert into public.staff_roles (staff_id, role)
  select uid, r from unnest(roles) as r;

  return uid;
end;
$$;

-- يتصرف كمستخدم مسجل دخول (نفس اللي بيعمله PostgREST)
create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

create or replace function tests.as_postgres()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function tests.location(code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select l.id from public.locations l where l.code = location.code
$$;

create or replace function tests.product(name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.id from public.products p where p.name_en = product.name
$$;

create or replace function tests.batch(product_name text, production_date date)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.batches (product_id, production_date)
  values (tests.product(product_name), production_date)
  on conflict (product_id, production_date) do update set production_date = excluded.production_date
  returning id
$$;

-- جرد مؤكد بسطر واحد (مسودة ← سطر ← تأكيد، متل ما بتعمل دالة التأكيد). بيرجع id السطر.
create or replace function tests.confirmed_count(
  location_code text,
  counted_by uuid,
  product_name text,
  whole_cakes int,
  loose_pieces int,
  batch_id uuid default null,
  is_opening boolean default false,
  started_at timestamptz default now()
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  count_id uuid;
  line_id uuid;
begin
  insert into public.stock_counts (location_id, method, counted_by, is_opening, started_at)
  values (tests.location(location_code), 'manual', counted_by, is_opening, started_at)
  returning id into count_id;

  insert into public.stock_count_lines (count_id, product_id, batch_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot)
  select count_id, p.id, batch_id, whole_cakes, loose_pieces, p.effective_pieces_per_cake
  from public.v_products p where p.name_en = product_name
  returning id into line_id;

  update public.stock_counts set status = 'confirmed', confirmed_at = now() where id = count_id;
  return line_id;
end;
$$;

-- حركة ستوك مربوطة بسطر جرد
create or replace function tests.count_movement(
  line_id uuid,
  qty int,
  kind public.movement_type default 'count_adjustment'
)
returns bigint
language sql
set search_path = ''
as $$
  insert into public.stock_movements (occurred_at, location_id, product_id, batch_id, qty_pieces, movement_type, count_line_id)
  select c.started_at, c.location_id, l.product_id, l.batch_id, qty, kind, l.id
  from public.stock_count_lines l
  join public.stock_counts c on c.id = l.count_id
  where l.id = line_id
  returning id
$$;

grant execute on all functions in schema tests to authenticated, anon;

select plan(1);
select pass('test helpers installed');
select * from finish();
