-- نقل موظف لموقع ما بيناسب أدواره (فحص مؤجل لآخر الـ transaction).
-- بملف لحاله لأن الفحوصات المؤجلة الفاشلة بتأثر على أي فحص مؤجل بعدها بنفس الملف.
begin;
select no_plan();

select tests.create_staff('55555555-0000-4000-8000-000000000001', 'أحمد', '962791111111', 'SWF', '{branch_staff}');
select lives_ok($$ set constraints all immediate $$, 'branch staff at a branch is valid');
set constraints all deferred;

update public.staff set location_id = tests.location('FAC') where id = '55555555-0000-4000-8000-000000000001';
select throws_ok(
  $$ set constraints all immediate $$,
  '23514', null,
  'moving branch staff to the factory without changing their role is rejected'
);

select * from finish();
rollback;
