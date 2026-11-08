-- المهام المتكررة: الأدمن بيعمل القالب، الموظف بيعلّمها انعملت مرة باليوم، والتقرير بيحسب الالتزام.
begin;
select no_plan();

select tests.create_staff('8d8d8d8d-0000-4000-8000-000000000001', 'أدمن', '962791170001', null, '{admin}');
select tests.create_staff('8d8d8d8d-0000-4000-8000-000000000002', 'أحمد', '962791170002', 'SWF', '{branch_staff}');
select tests.create_staff('8d8d8d8d-0000-4000-8000-000000000003', 'مسؤول الجبيهة', '962791170003', 'JBH', '{branch_manager}');
select tests.create_staff('8d8d8d8d-0000-4000-8000-000000000004', 'سامر', '962791170004', 'FAC', '{dispatcher}');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select ok(private.day_number('2026-11-07') = 1 and private.day_number('2026-11-13') = 7, 'Saturday is day 1, Friday day 7');

-- الموظف ما بيعمل قوالب
select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.task_templates (title) values ('تنظيف') $$,
  '42501', null, 'staff cannot create tasks'
);

select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000001');
-- 5:00 = أول موعد بيوم الجرد، فهلا فات وقته
insert into public.task_templates (title, due_time, created_at) values ('نظّف الثلاجة', '05:00', now() - interval '3 days');
insert into ids select 'clean', id from public.task_templates where title = 'نظّف الثلاجة';
insert into public.task_templates (title, requires_photo, location_ids)
values ('صورة الحرارة', true, array[tests.location('SWF')]);
insert into ids select 'photo', id from public.task_templates where title = 'صورة الحرارة';
insert into public.task_templates (title, frequency, weekdays) values ('جرد التوابل', 'weekly',
  array[((private.day_number(public.count_day_today()) % 7) + 1)::smallint]);
select throws_ok(
  $$ insert into public.task_templates (title, frequency) values ('بدون أيام', 'weekly') $$,
  '23514', null, 'a weekly task needs its days'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'task_templates'), 3,
  'every template change is audited'
);

-- اليوم
select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000002');
select results_eq(
  $$ select title from public.v_tasks_today order by title $$,
  $$ values ('صورة الحرارة'), ('نظّف الثلاجة') $$,
  'the branch sees today''s tasks (not the weekly one for tomorrow, not other branches)'
);
select is(
  (select status from public.v_tasks_today where title = 'نظّف الثلاجة'), 'late',
  'past its time = late'
);
select throws_ok(
  format($$ select public.complete_task(%L) $$, (select id from ids where name = 'photo')),
  '23514', null, 'a photo task needs a photo'
);
select throws_ok(
  format($$ select public.complete_task(%L, null, 'someone-else/x.jpg') $$, (select id from ids where name = 'photo')),
  '23514', null, 'the photo must be in the branch folder'
);
select lives_ok(
  format($$ select public.complete_task(%L, null, %L) $$, (select id from ids where name = 'photo'),
    tests.location('SWF') || '/2026-11-08/a.jpg'),
  'done with a photo'
);
select lives_ok(
  format($$ select public.complete_task(%L, '  تمام  ') $$, (select id from ids where name = 'clean')),
  'done with a note'
);
select throws_ok(
  format($$ select public.complete_task(%L) $$, (select id from ids where name = 'clean')),
  '23505', null, 'once a day'
);
select is((select status from public.v_tasks_today where title = 'نظّف الثلاجة'), 'done', 'shows as done');
select is((select note from public.task_runs where note is not null), 'تمام', 'the note is kept, trimmed');
reset role;
select throws_ok(
  $$ update public.task_runs set note = 'x' $$,
  '23001', null, 'a done task cannot be changed, even by the owner'
);

-- مسؤول الفرع = موظف فرع
select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select public.complete_task(%L) $$, (select id from ids where name = 'clean')),
  'a branch manager does branch tasks'
);
select throws_ok(
  format($$ select public.complete_task(%L, null, 'x') $$, (select id from ids where name = 'photo')),
  '23514', null, 'a task for another branch is refused'
);

-- المصنع ما إله مهام الفروع
select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000004');
select throws_ok(
  format($$ select public.complete_task(%L) $$, (select id from ids where name = 'clean')),
  '23514', null, 'branch tasks are not due at the factory'
);

-- التقرير
select tests.authenticate_as('8d8d8d8d-0000-4000-8000-000000000001');
-- (مهمة الصورة الساعة 12 ممكن لسا ما إجا وقتها، حسب ساعة الفحص)
select ok(
  (select expected >= 1 and done = expected from public.report_tasks(public.count_day_today(), public.count_day_today())
   where location_id = tests.location('SWF')),
  'the report counts what was due and done'
);

select * from finish();
rollback;
