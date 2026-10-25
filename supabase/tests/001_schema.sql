-- الهيكل والصلاحيات العامة والـ seed
begin;
select no_plan();

-- ─── RLS والصلاحيات ──────────────────────────────────────────────────

select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'every public table has row level security enabled'
);

select is_empty(
  $$ select table_name from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  'anon has no privileges on any public table or view'
);

select is_empty(
  $$ select table_name from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'TRUNCATE' $$,
  'authenticated cannot truncate anything (truncate skips RLS)'
);

select ok(
  not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'update')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'delete'),
  'authenticated cannot write the stock ledger directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'insert')
  and not has_table_privilege('authenticated', 'public.login_attempts', 'insert'),
  'authenticated cannot write the audit log or login attempts'
);

select is_empty(
  $$ select n.nspname || '.' || p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon cannot execute any function in public or private'
);

-- دوال الكتابة اللي رح تنضاف بعدين (confirm_count…) لازم تنولد مسكّرة على anon
create function public.zz_future_rpc() returns int language sql as $$ select 1 $$;
select ok(
  not has_function_privilege('anon', 'public.zz_future_rpc()', 'execute'),
  'a function added in a later migration is not executable by anon'
);
select ok(
  has_function_privilege('authenticated', 'public.zz_future_rpc()', 'execute'),
  'a function added in a later migration is executable by signed-in staff'
);

select is_empty(
  $$ select privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_name = 'v_staff_names' and privilege_type <> 'SELECT' $$,
  'signed-in staff can only read the names view'
);

-- ─── رقم اليوم ───────────────────────────────────────────────────────

select results_eq(
  $$ select public.day_number(d::date)::int
     from unnest(array['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
                       '2026-10-21', '2026-10-22', '2026-10-23']) as d $$,
  $$ values (1), (2), (3), (4), (5), (6), (7) $$,
  'day_number: Saturday is 1 and Friday is 7 (matches src/lib/day-number.ts)'
);

-- ─── قيود ────────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.app_settings (id) values (true) $$,
  '23505', null,
  'there is only one settings row'
);

select throws_ok(
  $$ update public.app_settings set factory_shelf_life_days = 8 $$,
  '23514', null,
  'factory shelf life cannot exceed 7 days (day numbers repeat weekly)'
);

select throws_ok(
  $$ insert into public.products (name_en, sell_mode, pieces_per_cake) values ('Test', 'pieces_only', 8) $$,
  '23514', null,
  'a pieces-only product has no cake size'
);

select throws_ok(
  $$ insert into public.locations (name, kind, code) values ('مرتجعات', 'returns_bin', 'XRT') $$,
  '23514', null,
  'a returns bin must belong to a parent location'
);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bad-phone@test.mekasa.local');

select throws_ok(
  $$ insert into public.staff (id, full_name, phone)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'رقم غلط', '0791234567') $$,
  '23514', null,
  'phones are stored in E.164 form without the plus'
);

-- ─── الـ seed ────────────────────────────────────────────────────────

select results_eq(
  $$ select kind::text, count(*)::int from public.locations group by kind order by kind $$,
  $$ values ('branch', 3), ('factory', 1), ('packaging', 1), ('returns_bin', 1) $$,
  'seed: one factory, three branches, one returns bin, one packaging store'
);

select results_eq(
  $$ select sell_mode::text, count(*)::int from public.products where kind = 'cake' group by sell_mode order by sell_mode $$,
  $$ values ('pieces_only', 3), ('whole_and_pieces', 17) $$,
  'seed: 20 menu products, 3 of them pieces only'
);

select is(
  (select count(*)::int from public.count_schedules), 6,
  'seed: six daily count times'
);

select is(
  (select count(*)::int from public.par_levels), 60,
  'seed: a par level for every product at every branch'
);

select is(
  (select par_pieces from public.par_levels
   where location_id = tests.location('SWF') and product_id = tests.product('Classic Choco')),
  200,
  'seed: par of 20 cakes is stored as pieces'
);

select results_eq(
  $$ select cardinality(product_ids) from public.count_form_versions order by location_id $$,
  $$ values (20), (20), (20), (20) $$,
  'seed: a v1 count form with all 20 products for each counting location'
);

select * from finish();
rollback;
