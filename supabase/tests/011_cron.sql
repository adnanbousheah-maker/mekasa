-- مهام pg_cron: التذكيرات كل دقيقة، ومسح محاولات الدخول القديمة، والدالة مسكّرة على التطبيق.
begin;
select no_plan();

select results_eq(
  $$ select jobname, schedule from cron.job where jobname like 'mekasa-%' order by jobname $$,
  $$ values ('mekasa-login-attempts-cleanup', '17 3 * * *'), ('mekasa-reminders', '* * * * *') $$,
  'the reminder and cleanup jobs are scheduled'
);
select ok(not has_function_privilege('authenticated', 'private.call_reminders()', 'execute'), 'staff cannot trigger the cron call');
select ok(not has_function_privilege('anon', 'private.call_reminders()', 'execute'), 'anon cannot trigger the cron call');
select lives_ok($$ select private.call_reminders() $$, 'without vault secrets the job does nothing');

select * from finish();
rollback;
