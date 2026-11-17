-- 17 نوفمبر 2026: رمز طوارئ من السيرفر. مفتاح الرموز بـ Vercel ما بينقرأ، فالرمز الجديد لازم يتعمل جوا التطبيق.
-- الطلب بينكتب من قاعدة البيانات بس (SQL، ما في policies)، وبيصلح 10 دقايق ومرة وحدة.
-- /api/cron/emergency-pin (بـ CRON_SECRET) بياخذ الطلب، بيعمل الرمز، وبيرجعه مرة وحدة.

create table public.emergency_pin_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  requested_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.emergency_pin_requests enable row level security;
revoke all on public.emergency_pin_requests from anon, authenticated;
