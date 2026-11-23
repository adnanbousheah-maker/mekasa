-- 23 نوفمبر 2026 (فترة التجربة): زر "تم إخراج الطلبية" لمسؤول المصنع والأدمن. الطلبية طلعت برا النظام،
-- فبتنعلّم "طلعت" وبتختفي من طلبات المصنع، بدون إخراج ولا حركة ستوك. IT بيطفي الزر من /admin/it.

alter table public.app_settings add column feature_request_mark_out boolean not null default true;

create or replace function private.guard_it_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preview_mode and not old.preview_mode then
    raise exception 'preview mode cannot be turned back on' using errcode = 'check_violation';
  end if;
  if (new.preview_mode is distinct from old.preview_mode
      or new.feature_tasks is distinct from old.feature_tasks
      or new.feature_request_mark_out is distinct from old.feature_request_mark_out)
     and (select auth.uid()) is not null and not private.is_it_admin() then
    raise exception 'only IT can change this' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function private.feature_enabled(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case feature
    when 'tasks' then (select a.feature_tasks from public.app_settings a)
    when 'request_mark_out' then (select a.feature_request_mark_out from public.app_settings a)
    else false
  end
$$;

-- مين علّم الطلبية إنها طلعت برا النظام (append-only)
create table public.request_mark_outs (
  request_id uuid primary key references public.stock_requests (id),
  marked_by uuid not null references public.staff (id),
  marked_at timestamptz not null default now(),
  previous_status public.request_status not null
);

alter table public.request_mark_outs enable row level security;

-- اللي بيشوف الطلب بيشوف علامته
create policy "read mark outs of visible requests" on public.request_mark_outs
  for select to authenticated
  using (exists (select 1 from public.stock_requests r where r.id = request_id));

create function public.mark_request_out(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.stock_requests;
  supplier public.locations;
begin
  if not private.feature_enabled('request_mark_out') then
    raise exception 'this button is turned off' using errcode = 'check_violation', hint = 'feature_off';
  end if;
  select * into req from public.stock_requests r where r.id = p_request_id for update;
  select * into supplier from public.locations l where l.id = req.supplying_location_id;
  if req.id is null or not (
       private.is_admin()
    or (supplier.kind = 'factory' and private.has_role('factory_manager') and private.my_location_id() = supplier.id)
  ) then
    raise exception 'you cannot mark this request' using errcode = 'insufficient_privilege';
  end if;
  if req.status not in ('sent', 'partial') then
    raise exception 'the request is not waiting for the factory' using errcode = 'check_violation';
  end if;

  insert into public.request_mark_outs (request_id, marked_by, previous_status)
  values (req.id, (select auth.uid()), req.status);
  update public.stock_requests r set status = 'dispatched' where r.id = req.id;
end;
$$;

revoke execute on function public.mark_request_out(uuid) from public, anon;
grant execute on function public.mark_request_out(uuid) to authenticated;

-- التصفير الكامل لازم يمسح علامات "تم إخراج الطلبية" مع الطلبات (مفتاح أجنبي)
CREATE OR REPLACE FUNCTION public.it_reset_operations(p_confirm text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_it_admin() then
    raise exception 'only IT can reset the system' using errcode = 'insufficient_privilege';
  end if;
  if not (select a.preview_mode from public.app_settings a) then
    raise exception 'reset is closed after the preview period' using errcode = 'check_violation', hint = 'preview_over';
  end if;
  if p_confirm is distinct from 'صفّر' then
    raise exception 'type the confirmation word' using errcode = 'check_violation', hint = 'confirm';
  end if;

  set local session_replication_role = replica;
  truncate table
    public.stock_movements, public.stock_count_lines, public.stock_counts,
    public.dispatch_line_batches, public.dispatch_lines, public.dispatches,
    public.receipt_lines, public.receipts, public.return_dispositions,
    public.request_mark_outs, public.stock_request_missing, public.stock_request_lines, public.stock_requests,
    public.production_lines, public.production_entries, public.batches,
    public.raw_count_lines, public.raw_counts, public.raw_movements,
    public.waste_records, public.task_runs,
    public.alert_log, public.notification_log, public.notifications,
    public.ai_messages, public.ai_conversations, public.ai_usage_log,
    public.login_attempts, public.audit_log;
  set local session_replication_role = origin;

  insert into public.audit_log (table_name, row_id, action, reason, changed_by)
  values ('system', 'reset', 'delete', 'تصفير النظام (فترة المعاينة)', (select auth.uid()));
end;
$function$

;
