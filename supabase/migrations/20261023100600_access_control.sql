-- الصلاحيات: مين بيشوف شو. كل الجداول عليها RLS، والكتابة على المستندات والحركات
-- ما بتصير إلا عن طريق دوال (security definer) بتنكتب مع كل ميزة.
--
-- القاعدة: الموظف الموقوف ما بيشوف ولا صف، حتى لو جلسته لسا شغالة.

-- ─── دوال مساعدة ─────────────────────────────────────────────────────

create function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.id = (select auth.uid()) and s.is_active
  )
$$;

create function private.has_role(wanted public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.staff s on s.id = r.staff_id
    where r.staff_id = (select auth.uid()) and r.role = wanted and s.is_active
  )
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin')
$$;

create function private.my_location_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.location_id from public.staff s
  where s.id = (select auth.uid()) and s.is_active
$$;

-- الأدمن بيشوف كل المواقع. الموظف بيشوف موقعه، والمواقع التابعة إله (مرتجعات المصنع).
create function private.can_see_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.locations l
    where l.id = loc and private.my_location_id() in (l.id, l.parent_location_id)
  )
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ─── تفعيل RLS على كل الجداول ────────────────────────────────────────

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ─── المرجعيات: أي موظف فعّال بيقرأ، والأدمن بيكتب ───────────────────

create policy "active staff read locations" on public.locations
  for select to authenticated using (private.is_active_staff());
create policy "admin adds locations" on public.locations
  for insert to authenticated with check (private.is_admin());
create policy "admin edits locations" on public.locations
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "active staff read settings" on public.app_settings
  for select to authenticated using (private.is_active_staff());
create policy "admin edits settings" on public.app_settings
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "active staff read products" on public.products
  for select to authenticated using (private.is_active_staff());
create policy "admin adds products" on public.products
  for insert to authenticated with check (private.is_admin());
create policy "admin edits products" on public.products
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "active staff read schedules" on public.count_schedules
  for select to authenticated using (private.is_active_staff());
create policy "admin adds schedules" on public.count_schedules
  for insert to authenticated with check (private.is_admin());
create policy "admin edits schedules" on public.count_schedules
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "staff read their form versions" on public.count_form_versions
  for select to authenticated using (private.can_see_location(location_id));
create policy "admin adds form versions" on public.count_form_versions
  for insert to authenticated with check (private.is_admin());

create policy "active staff read batches" on public.batches
  for select to authenticated using (private.is_active_staff());

create policy "staff read their par levels" on public.par_levels
  for select to authenticated using (private.can_see_location(location_id));
create policy "admin adds par levels" on public.par_levels
  for insert to authenticated with check (private.is_admin());
create policy "admin edits par levels" on public.par_levels
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "active staff read raw materials" on public.raw_materials
  for select to authenticated using (private.is_active_staff());
create policy "admin adds raw materials" on public.raw_materials
  for insert to authenticated with check (private.is_admin());
create policy "admin edits raw materials" on public.raw_materials
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "active staff read raw units" on public.raw_material_units
  for select to authenticated using (private.is_active_staff());
create policy "admin adds raw units" on public.raw_material_units
  for insert to authenticated with check (private.is_admin());
create policy "admin edits raw units" on public.raw_material_units
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- ─── الموظفين ────────────────────────────────────────────────────────

-- كل موظف بيشوف حاله، والأدمن الكل. الأسماء للباقي عن طريق v_staff_names (بدون جوالات).
create policy "staff read themselves, admin reads all" on public.staff
  for select to authenticated using ((id = (select auth.uid()) and is_active) or private.is_admin());
create policy "admin adds staff" on public.staff
  for insert to authenticated with check (private.is_admin());
create policy "admin edits staff" on public.staff
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "staff read their roles, admin reads all" on public.staff_roles
  for select to authenticated using (staff_id = (select auth.uid()) and private.is_active_staff() or private.is_admin());
create policy "admin grants roles" on public.staff_roles
  for insert to authenticated with check (private.is_admin());
create policy "admin revokes roles" on public.staff_roles
  for delete to authenticated using (private.is_admin());

-- login_attempts: ما في policies. السيرفر بس (service role).

-- ─── الجرد والتالف والحركات: حسب الموقع ──────────────────────────────

create policy "staff read their counts" on public.stock_counts
  for select to authenticated using (private.can_see_location(location_id));

create policy "staff read their count lines" on public.stock_count_lines
  for select to authenticated using (
    exists (select 1 from public.stock_counts c where c.id = count_id and private.can_see_location(c.location_id))
  );

create policy "staff read their waste" on public.waste_records
  for select to authenticated using (private.can_see_location(location_id));

create policy "staff read their movements" on public.stock_movements
  for select to authenticated using (private.can_see_location(location_id));

create policy "staff read their production" on public.production_entries
  for select to authenticated using (private.can_see_location(location_id));

create policy "staff read their production lines" on public.production_lines
  for select to authenticated using (
    exists (select 1 from public.production_entries e where e.id = entry_id and private.can_see_location(e.location_id))
  );

create policy "staff read their raw counts" on public.raw_counts
  for select to authenticated using (private.can_see_location(location_id));

create policy "staff read their raw count lines" on public.raw_count_lines
  for select to authenticated using (
    exists (select 1 from public.raw_counts c where c.id = count_id and private.can_see_location(c.location_id))
  );

create policy "staff read their raw movements" on public.raw_movements
  for select to authenticated using (private.can_see_location(location_id));

-- ─── الطلب والإخراج والاستلام: موقع المصدر والوجهة ───────────────────

create policy "both ends read requests" on public.stock_requests
  for select to authenticated using (
    private.can_see_location(requesting_location_id) or private.can_see_location(supplying_location_id)
  );

create policy "both ends read request lines" on public.stock_request_lines
  for select to authenticated using (
    exists (
      select 1 from public.stock_requests r
      where r.id = request_id
        and (private.can_see_location(r.requesting_location_id) or private.can_see_location(r.supplying_location_id))
    )
  );

create policy "both ends read dispatches" on public.dispatches
  for select to authenticated using (
    private.can_see_location(from_location_id) or private.can_see_location(to_location_id)
  );

create policy "both ends read dispatch lines" on public.dispatch_lines
  for select to authenticated using (
    exists (
      select 1 from public.dispatches d
      where d.id = dispatch_id
        and (private.can_see_location(d.from_location_id) or private.can_see_location(d.to_location_id))
    )
  );

create policy "both ends read dispatch batches" on public.dispatch_line_batches
  for select to authenticated using (
    exists (
      select 1 from public.dispatch_lines l
      join public.dispatches d on d.id = l.dispatch_id
      where l.id = dispatch_line_id
        and (private.can_see_location(d.from_location_id) or private.can_see_location(d.to_location_id))
    )
  );

create policy "both ends read receipts" on public.receipts
  for select to authenticated using (
    exists (
      select 1 from public.dispatches d
      where d.id = dispatch_id
        and (private.can_see_location(d.from_location_id) or private.can_see_location(d.to_location_id))
    )
  );

create policy "both ends read receipt lines" on public.receipt_lines
  for select to authenticated using (
    exists (
      select 1 from public.receipts rc
      join public.dispatches d on d.id = rc.dispatch_id
      where rc.id = receipt_id
        and (private.can_see_location(d.from_location_id) or private.can_see_location(d.to_location_id))
    )
  );

create policy "both ends read return decisions" on public.return_dispositions
  for select to authenticated using (
    exists (
      select 1 from public.receipt_lines rl
      join public.receipts rc on rc.id = rl.receipt_id
      join public.dispatches d on d.id = rc.dispatch_id
      where rl.id = receipt_line_id
        and (private.can_see_location(d.from_location_id) or private.can_see_location(d.to_location_id))
    )
  );

-- ─── السجلات: للأدمن ─────────────────────────────────────────────────

create policy "admin reads audit log" on public.audit_log
  for select to authenticated using (private.is_admin());

create policy "admin reads notification log" on public.notification_log
  for select to authenticated using (private.is_admin());

create policy "admin reads ai usage" on public.ai_usage_log
  for select to authenticated using (private.is_admin());

-- ─── الإشعارات: كل موظف اشتراكاته ────────────────────────────────────

create policy "staff read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (staff_id = (select auth.uid()) and private.is_active_staff());
create policy "staff add own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (staff_id = (select auth.uid()) and private.is_active_staff());
create policy "staff remove own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (staff_id = (select auth.uid()));

-- ─── مساعد الأدمن ────────────────────────────────────────────────────

create policy "admin reads own conversations" on public.ai_conversations
  for select to authenticated using (staff_id = (select auth.uid()) and private.is_admin());
create policy "admin starts conversations" on public.ai_conversations
  for insert to authenticated with check (staff_id = (select auth.uid()) and private.is_admin());

create policy "admin reads own messages" on public.ai_messages
  for select to authenticated using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.staff_id = (select auth.uid()) and private.is_admin()
    )
  );

-- ─── الصلاحيات على مستوى الجداول ─────────────────────────────────────

-- الدخول بيصير على السيرفر، فالـ anon ما إله أي وصول لأي جدول.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- TRUNCATE بيتخطى RLS، فممنوع على المستخدمين.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- الدفاتر والسجلات ما حدا بيكتب فيها من التطبيق مباشرة، حتى لو انضافت policy بالغلط.
revoke insert, update, delete on
  public.stock_movements,
  public.raw_movements,
  public.audit_log,
  public.login_attempts,
  public.notification_log,
  public.ai_usage_log
from authenticated;

-- الدوال: كل دالة بـ public بتنعرض كـ /rest/v1/rpc/…، ودوال الكتابة (security definer)
-- لازم ما تكون متاحة بدون دخول. Postgres بيعطي EXECUTE لـ PUBLIC على أي دالة جديدة
-- افتراضياً، وهالافتراضي ما بينشال إلا بدون "in schema".
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
