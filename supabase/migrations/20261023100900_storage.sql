-- التخزين: صور الجرد والتالف والفواتير (خاصة، حسب الموقع)، وصور الأصناف.
-- مسار كل ملف بيبلش بـ id الموقع بالصيغة القياسية: {location_id}/{...}.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('count-photos', 'count-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('waste-photos', 'waste-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('invoices', 'invoices', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('product-images', 'product-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- أول مجلد بالمسار لازم يكون id موقع موجود بالزبط (نفس كتابة uuid القياسية)،
-- والمستخدم بيقدر يشوف هالموقع. حتى الأدمن ما بيكتب برا مجلد موقع.
create function private.can_use_location_folder(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(object_name))[1]
      and private.can_see_location(l.id)
  )
$$;

revoke execute on function private.can_use_location_folder(text) from public, anon;
grant execute on function private.can_use_location_folder(text) to authenticated, service_role;

-- رفع وقراءة صور الموقع: الموظف لموقعه، والأدمن للكل. ما في تعديل ولا حذف.
create policy "staff upload location photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('count-photos', 'waste-photos', 'invoices')
    and private.can_use_location_folder(name)
  );

create policy "staff read location photos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('count-photos', 'waste-photos', 'invoices')
    and private.can_use_location_folder(name)
  );

create policy "active staff read product images" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and private.is_active_staff());

create policy "admin uploads product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and private.is_admin());

create policy "admin replaces product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and private.is_admin())
  with check (bucket_id = 'product-images' and private.is_admin());
