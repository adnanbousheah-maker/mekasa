-- 21 نوفمبر 2026 (طلب صاحب المشروع، مرحلة التجربة): سوبر أدمن IT بيصفّر جرودات موقع واحد.
-- بتنمسح جرودات الموقع (الكيك والصوصات) وحركاتها (رصيد افتتاحي، تعديل جرد، تصحيحات الأدمن)،
-- وجرد المواد الأولية إذا انطلب. الطلبات والإخراج والاستلام والإنتاج والتالف بيضلوا،
-- فالجرد الجاي بالموقع بيصير أول جرد (رصيد افتتاحي). متاح دايماً (مش بس بفترة المعاينة).

create function public.it_reset_location_counts(p_location_id uuid, p_include_raw boolean, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc public.locations;
  counts int;
  raw int := 0;
begin
  if not private.is_it_admin() then
    raise exception 'only IT can reset counts' using errcode = 'insufficient_privilege';
  end if;
  if p_confirm is distinct from 'صفّر' then
    raise exception 'type the confirmation word' using errcode = 'check_violation', hint = 'confirm';
  end if;
  select * into loc from public.locations l where l.id = p_location_id;
  if loc.id is null then
    raise exception 'location not found' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('mekasa:count:' || loc.id::text));

  select count(*) into counts from public.stock_counts c where c.location_id = loc.id;

  -- triggers الحماية (append-only) بتمنع الحذف، فبنطفيها جوا هالـ transaction بس
  set local session_replication_role = replica;

  delete from public.stock_movements m
  where m.location_id = loc.id
    and (m.movement_type = 'admin_correction'
         or m.count_line_id in (
           select l.id from public.stock_count_lines l
           join public.stock_counts c on c.id = l.count_id
           where c.location_id = loc.id));
  update public.ai_usage_log u set count_id = null
  where u.count_id in (select c.id from public.stock_counts c where c.location_id = loc.id);
  delete from public.stock_count_lines l
  where l.count_id in (select c.id from public.stock_counts c where c.location_id = loc.id);
  delete from public.stock_counts c where c.location_id = loc.id;

  if p_include_raw then
    select count(*) into raw from public.raw_counts c where c.location_id = loc.id;
    delete from public.raw_movements m
    where m.location_id = loc.id
      and (m.movement_type = 'admin_correction'
           or m.raw_count_line_id in (
             select l.id from public.raw_count_lines l
             join public.raw_counts c on c.id = l.count_id
             where c.location_id = loc.id));
    delete from public.raw_count_lines l
    where l.count_id in (select c.id from public.raw_counts c where c.location_id = loc.id);
    delete from public.raw_counts c where c.location_id = loc.id;
  end if;

  set local session_replication_role = origin;

  insert into public.audit_log (table_name, row_id, action, reason, changed_by)
  values ('stock_counts', loc.id::text, 'delete',
          format('تصفير جرودات %s (%s جرد%s)', loc.name, counts,
                 case when p_include_raw then format('، و%s جرد مواد', raw) else '' end),
          (select auth.uid()));

  return jsonb_build_object('counts', counts, 'raw_counts', raw);
end;
$$;

revoke execute on function public.it_reset_location_counts(uuid, boolean, text) from public, anon;
grant execute on function public.it_reset_location_counts(uuid, boolean, text) to authenticated;
