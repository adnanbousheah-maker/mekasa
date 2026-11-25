-- 25 نوفمبر 2026 (docs/perf-2026-11.md): الصلاحيات كانت تنحسب مع كل سطر (private.can_see_location(col)
-- و is_active_staff()/can_read_all()/is_admin() بدون select)، تقريباً 0.6–0.8 ملي ثانية للسطر، وبتكبر مع البيانات.
-- هلا: المواقع المسموحة بتنحسب مرة وحدة لكل استعلام (initPlan) والمقارنة = any(مصفوفة).
-- نفس الصلاحيات بالضبط (نفس شروط can_see_location). alter policy بدل drop/create.

create function private.visible_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.can_read_all() then (select coalesce(array_agg(l.id), '{}') from public.locations l)
    else (
      select coalesce(array_agg(l.id), '{}')
      from public.locations l
      where private.my_location_id() in (l.id, l.parent_location_id)
         or (l.kind = 'packaging' and private.has_role('packaging_keeper'))
    )
  end
$$;

revoke execute on function private.visible_location_ids() from public, anon;
grant execute on function private.visible_location_ids() to authenticated, service_role;

alter policy "admin reads own conversations" on public.ai_conversations
  using (((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.can_read_all())));
alter policy "admin starts conversations" on public.ai_conversations
  with check (((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.can_read_all())));
alter policy "admin reads own messages" on public.ai_messages
  using ((EXISTS ( SELECT 1
   FROM ai_conversations c
  WHERE ((c.id = ai_messages.conversation_id) AND (c.staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.can_read_all())))));
alter policy "admin reads ai usage" on public.ai_usage_log
  using ((SELECT private.can_read_all()));
alter policy "active staff read settings" on public.app_settings
  using ((SELECT private.is_active_staff()));
alter policy "admin edits settings" on public.app_settings
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "admin reads audit log" on public.audit_log
  using ((SELECT private.can_read_all()));
alter policy "active staff read batches" on public.batches
  using ((SELECT private.is_active_staff()));
alter policy "admin adds form versions" on public.count_form_versions
  with check ((SELECT private.is_admin()));
alter policy "staff read their form versions" on public.count_form_versions
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "active staff read schedules" on public.count_schedules
  using ((SELECT private.is_active_staff()));
alter policy "admin adds schedules" on public.count_schedules
  with check ((SELECT private.is_admin()));
alter policy "admin edits schedules" on public.count_schedules
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "both ends read dispatch batches" on public.dispatch_line_batches
  using ((EXISTS ( SELECT 1
   FROM (dispatch_lines l
     JOIN dispatches d ON ((d.id = l.dispatch_id)))
  WHERE ((l.id = dispatch_line_batches.dispatch_line_id) AND ((d.from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (d.to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read dispatch lines" on public.dispatch_lines
  using ((EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = dispatch_lines.dispatch_id) AND ((d.from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (d.to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read dispatches" on public.dispatches
  using (((from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[]))));
alter policy "active staff read locations" on public.locations
  using ((SELECT private.is_active_staff()));
alter policy "admin adds locations" on public.locations
  with check ((SELECT private.is_admin()));
alter policy "admin edits locations" on public.locations
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "active staff read lists" on public.lookup_lists
  using ((SELECT private.is_active_staff()));
alter policy "active staff read options" on public.lookup_options
  using ((SELECT private.is_active_staff()));
alter policy "admin adds options" on public.lookup_options
  with check ((SELECT private.is_admin()));
alter policy "admin edits options" on public.lookup_options
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "active staff read monthly counts" on public.monthly_counts
  using ((SELECT private.is_active_staff()));
alter policy "admin adds monthly counts" on public.monthly_counts
  with check ((SELECT private.is_admin()));
alter policy "admin edits monthly counts" on public.monthly_counts
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "admin reads notification log" on public.notification_log
  using ((SELECT private.can_read_all()));
alter policy "staff read their notifications" on public.notifications
  using (((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.is_active_staff())));
alter policy "admin adds daily minimums" on public.par_level_daily_min
  with check ((SELECT private.is_admin()));
alter policy "admin edits daily minimums" on public.par_level_daily_min
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff read their daily minimums" on public.par_level_daily_min
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "admin adds par levels" on public.par_levels
  with check ((SELECT private.is_admin()));
alter policy "admin edits par levels" on public.par_levels
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff read their par levels" on public.par_levels
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "staff read their production" on public.production_entries
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "staff read their production lines" on public.production_lines
  using ((EXISTS ( SELECT 1
   FROM production_entries e
  WHERE ((e.id = production_lines.entry_id) AND (e.location_id = ANY ((SELECT private.visible_location_ids())::uuid[]))))));
alter policy "active staff read products" on public.products
  using ((SELECT private.is_active_staff()));
alter policy "admin adds products" on public.products
  with check ((SELECT private.is_admin()));
alter policy "admin edits products" on public.products
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff add own push subscriptions" on public.push_subscriptions
  with check (((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.is_active_staff())));
alter policy "staff read own push subscriptions" on public.push_subscriptions
  using (((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.is_active_staff())));
alter policy "staff read their raw count lines" on public.raw_count_lines
  using ((EXISTS ( SELECT 1
   FROM raw_counts c
  WHERE ((c.id = raw_count_lines.count_id) AND (c.location_id = ANY ((SELECT private.visible_location_ids())::uuid[]))))));
alter policy "staff read their raw counts" on public.raw_counts
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "active staff read raw units" on public.raw_material_units
  using ((SELECT private.is_active_staff()));
alter policy "admin adds raw units" on public.raw_material_units
  with check ((SELECT private.is_admin()));
alter policy "admin edits raw units" on public.raw_material_units
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "active staff read raw materials" on public.raw_materials
  using ((SELECT private.is_active_staff()));
alter policy "admin adds raw materials" on public.raw_materials
  with check ((SELECT private.is_admin()));
alter policy "admin edits raw materials" on public.raw_materials
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff read their raw movements" on public.raw_movements
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "both ends read receipt lines" on public.receipt_lines
  using ((EXISTS ( SELECT 1
   FROM (receipts rc
     JOIN dispatches d ON ((d.id = rc.dispatch_id)))
  WHERE ((rc.id = receipt_lines.receipt_id) AND ((d.from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (d.to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read receipts" on public.receipts
  using ((EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = receipts.dispatch_id) AND ((d.from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (d.to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read return decisions" on public.return_dispositions
  using ((EXISTS ( SELECT 1
   FROM ((receipt_lines rl
     JOIN receipts rc ON ((rc.id = rl.receipt_id)))
     JOIN dispatches d ON ((d.id = rc.dispatch_id)))
  WHERE ((rl.id = return_dispositions.receipt_line_id) AND ((d.from_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (d.to_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "admin adds staff" on public.staff
  with check ((SELECT private.is_admin()));
alter policy "admin edits staff" on public.staff
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff read themselves, admin reads all" on public.staff
  using ((((id = ( SELECT auth.uid() AS uid)) AND is_active) OR (SELECT private.can_read_all())));
alter policy "admin grants roles" on public.staff_roles
  with check ((SELECT private.is_admin()));
alter policy "admin revokes roles" on public.staff_roles
  using ((SELECT private.is_admin()));
alter policy "staff read their roles, admin reads all" on public.staff_roles
  using ((((staff_id = ( SELECT auth.uid() AS uid)) AND (SELECT private.is_active_staff())) OR (SELECT private.can_read_all())));
alter policy "staff read their count lines" on public.stock_count_lines
  using ((EXISTS ( SELECT 1
   FROM stock_counts c
  WHERE ((c.id = stock_count_lines.count_id) AND (c.location_id = ANY ((SELECT private.visible_location_ids())::uuid[]))))));
alter policy "staff read their counts" on public.stock_counts
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "staff read their movements" on public.stock_movements
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "both ends read request lines" on public.stock_request_lines
  using ((EXISTS ( SELECT 1
   FROM stock_requests r
  WHERE ((r.id = stock_request_lines.request_id) AND ((r.requesting_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (r.supplying_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read forgotten items" on public.stock_request_missing
  using ((EXISTS ( SELECT 1
   FROM stock_requests r
  WHERE ((r.id = stock_request_missing.request_id) AND ((r.requesting_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (r.supplying_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])))))));
alter policy "both ends read requests" on public.stock_requests
  using (((requesting_location_id = ANY ((SELECT private.visible_location_ids())::uuid[])) OR (supplying_location_id = ANY ((SELECT private.visible_location_ids())::uuid[]))));
alter policy "staff read task runs at their location" on public.task_runs
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
alter policy "active staff read task templates" on public.task_templates
  using ((SELECT private.is_active_staff()));
alter policy "admin adds task templates" on public.task_templates
  with check ((SELECT private.is_admin()));
alter policy "admin edits task templates" on public.task_templates
  using ((SELECT private.is_admin()))
  with check ((SELECT private.is_admin()));
alter policy "staff read their waste" on public.waste_records
  using ((location_id = ANY ((SELECT private.visible_location_ids())::uuid[])));
