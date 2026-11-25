-- 25 نوفمبر 2026 (docs/perf-2026-11.md): الصلاحيات بالـ policies لازم تنحسب مرة وحدة لكل استعلام.
-- can_see_location(col) لكل سطر ممنوعة (بدالها col = any ((select private.visible_location_ids())::uuid[]))،
-- ودوال الجلسة لازم تكون جوا (select ...).
begin;
select plan(3);

select is(
  (select count(*)::int from pg_policies
   where schemaname in ('public', 'storage')
     and coalesce(qual, '') || coalesce(with_check, '') ~ 'can_see_location\('),
  0, 'no policy calls can_see_location per row'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') || coalesce(with_check, '') ~ '(?<!SELECT )private\.(is_active_staff|can_read_all|is_admin)\(\)'),
  0, 'session checks in policies run once per query (wrapped in select)'
);

select tests.create_staff('e0e0e0e0-0000-4000-8000-000000000001', 'فرع', '962793360001', 'SWF', '{branch_staff}');
select tests.authenticate_as('e0e0e0e0-0000-4000-8000-000000000001');
select is(
  (select array_length(private.visible_location_ids(), 1)),
  1, 'branch staff see their branch only'
);

select * from finish();
rollback;
