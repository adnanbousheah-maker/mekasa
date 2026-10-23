-- الإشعارات (المرحلة 1) وسجلات الذكاء الاصطناعي (قراءة الفورم بالمرحلة 1، المساعد بالمرحلة 4).

create type public.notification_kind as enum ('count_reminder', 'count_late', 'dispatch_unreceived');
create type public.ai_feature as enum ('count_ocr', 'assistant');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  -- خدمات الإشعارات المعروفة بس (Chrome/Android، Firefox، Edge، Safari). السيرفر بيبعت
  -- طلبات لهالعنوان، فأي عنوان ثاني ممكن يستعمل السيرفر ليوصل لأماكن داخلية (SSRF).
  endpoint text not null unique check (
    length(endpoint) <= 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)/'
  ),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth_key text not null check (length(auth_key) between 1 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_staff_idx on public.push_subscriptions (staff_id);

-- كل موظف أقصى شي 5 أجهزة
create function private.limit_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions p where p.staff_id = new.staff_id) >= 5 then
    raise exception 'a staff member can have at most 5 push subscriptions' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_limit
before insert on public.push_subscriptions
for each row execute function private.limit_push_subscriptions();

-- كل إشعار انبعت. الـ unique بيمنع إنه نفس التذكير يوصل مرتين لو الـ cron اشتغل مرتين.
create table public.notification_log (
  id bigint generated always as identity primary key,
  kind public.notification_kind not null,
  location_id uuid references public.locations (id),
  schedule_id uuid references public.count_schedules (id),
  slot_date date,
  dispatch_id uuid references public.dispatches (id),
  recipients int not null default 0 check (recipients >= 0),
  sent_at timestamptz not null default now(),
  unique nulls not distinct (kind, schedule_id, slot_date, dispatch_id)
);

-- كل طلب لـ Claude: لمراقبة التكلفة والأخطاء
create table public.ai_usage_log (
  id bigint generated always as identity primary key,
  feature public.ai_feature not null,
  staff_id uuid references public.staff (id),
  model text not null,
  input_tokens int check (input_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  count_id uuid references public.stock_counts (id),
  raw_response jsonb,
  error text,
  duration_ms int check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_log_time_idx on public.ai_usage_log (created_at desc);

-- محادثات مساعد الأدمن (المرحلة 4)
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  title text check (title is null or length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_conversations_touch_updated_at
before update on public.ai_conversations
for each row execute function private.touch_updated_at();

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- محتوى الرسالة بصيغة Claude (نص، استدعاء أدوات، نتائجها)
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, id);
