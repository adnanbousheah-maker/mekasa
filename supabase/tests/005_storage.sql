-- التخزين: الصور حسب الموقع، وصور الأصناف للأدمن.
begin;
select no_plan();

select tests.create_staff('44444444-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select tests.create_staff('44444444-0000-4000-8000-000000000004', 'عدنان', '962794444444', null, '{admin}');

select results_eq(
  $$ select id, public from storage.buckets order by id $$,
  $$ values ('count-photos', false), ('invoices', false), ('product-images', false), ('waste-photos', false) $$,
  'all buckets exist and none is public'
);

-- صورة جرد بالجبيهة (كـ postgres) مشان نتأكد إنه أحمد ما بيشوفها
insert into storage.objects (bucket_id, name)
values ('count-photos', tests.location('JBH') || '/count-jbh.jpg');

select tests.authenticate_as('44444444-0000-4000-8000-000000000001');

select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values ('count-photos', '%s/count-1.jpg', '44444444-0000-4000-8000-000000000001') $$,
         tests.location('SWF')),
  'branch staff upload a count photo under their own location'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('count-photos', '%s/count-2.jpg') $$,
         tests.location('JBH')),
  '42501', null,
  'branch staff cannot upload under another location'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('count-photos', 'not-a-location/count-3.jpg') $$,
  '42501', null,
  'a path that is not a location id is rejected'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('product-images', 'flan.jpg') $$,
  '42501', null,
  'only the admin uploads product images'
);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'count-photos' $$,
  format($$ values ('%s/count-1.jpg') $$, tests.location('SWF')),
  'branch staff read only their own location''s photos'
);
select is_empty(
  $$ update storage.objects set name = name || '.bak' returning id $$,
  'photos cannot be renamed or replaced'
);
-- الحذف المباشر بالـ SQL ممنوع أصلاً من Supabase (storage.protect_delete)،
-- والحذف عن طريق الـ Storage API بيمشي على RLS، وما في ولا policy بتسمح بالحذف.
select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd in ('DELETE', 'ALL') $$,
  'no policy allows deleting photos'
);

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('count-photos', '%s/count-4.jpg') $$,
         upper(tests.location('SWF')::text)),
  '42501', null,
  'the location folder must be the exact location id (no other spellings)'
);

select tests.authenticate_as('44444444-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'count-photos'), 2,
  'the admin reads photos from every location'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('count-photos', 'loose-photo.jpg') $$,
  '42501', null,
  'even the admin cannot put a photo outside a location folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('count-photos', '00000000-0000-4000-8000-000000000000/x.jpg') $$,
  '42501', null,
  'even the admin cannot use a folder for a location that does not exist'
);

select tests.as_anon();
select is_empty($$ select 1 from storage.objects $$, 'anon sees no stored files');

select * from finish();
rollback;
