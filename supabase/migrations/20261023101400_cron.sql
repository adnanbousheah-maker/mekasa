-- الخطوة 9: pg_cron بينادي التطبيق كل دقيقة للتذكيرات (Vercel المجاني ما بيسمح بـ cron كل دقيقة)،
-- وبيمسح محاولات الدخول القديمة كل يوم.
--
-- العنوان والسر بـ Supabase Vault (مش بالكود):
--   select vault.create_secret('https://mekasa.vercel.app', 'mekasa_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'mekasa_cron_secret');
-- إذا مش موجودين، المهمة ما بتعمل شي.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create function private.call_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'mekasa_app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'mekasa_cron_secret';
  if app_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

-- ما حدا من التطبيق بينادي هالدالة، بس pg_cron (postgres)
revoke execute on function private.call_reminders() from public, anon, authenticated;

select cron.schedule('mekasa-reminders', '* * * * *', $$ select private.call_reminders() $$);
select cron.schedule('mekasa-login-attempts-cleanup', '17 3 * * *',
  $$ delete from public.login_attempts where attempted_at < now() - interval '30 days' $$);
