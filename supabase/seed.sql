-- بيانات تجريبية للتطوير المحلي (supabase db reset).
-- الموظفين ما بينضافوا هون: حساباتهم بتنعمل بالخطوة 3 بسكربت، لأن كلمة السر
-- مشتقة من الرمز بمفتاح AUTH_PIN_PEPPER اللي على السيرفر بس.

-- ─── المواقع ─────────────────────────────────────────────────────────

insert into public.locations (name, kind, code, sort_order) values
  ('المصنع', 'factory', 'FAC', 0),
  ('الصويفية', 'branch', 'SWF', 1),
  ('الجبيهة', 'branch', 'JBH', 2),
  ('دابوق', 'branch', 'DBQ', 3);

-- خانة المرتجعات بالمصنع (الإرجاع موقوف بالإعدادات لحد ما يتفعّل)
insert into public.locations (name, kind, code, parent_location_id, sort_order)
select 'مرتجعات المصنع', 'returns_bin', 'RET', id, 4 from public.locations where code = 'FAC';

-- ─── الأصناف (من المنيو، بنفس الترتيب) ───────────────────────────────

insert into public.products (sort_order, name_en, sell_mode) values
  (1, 'Classic Choco', 'whole_and_pieces'),
  (2, 'The Red One', 'whole_and_pieces'),
  (3, 'The One', 'whole_and_pieces'),
  (4, 'Qudrat Qader', 'whole_and_pieces'),
  (5, 'Flan', 'whole_and_pieces'),
  (6, 'Strawberry', 'whole_and_pieces'),
  (7, 'Belgian Choco', 'whole_and_pieces'),
  (8, 'Black & White', 'whole_and_pieces'),
  (9, 'Classic Crunch', 'whole_and_pieces'),
  (10, 'Classic Strawberry', 'whole_and_pieces'),
  (11, 'Nightmare', 'whole_and_pieces'),
  (12, 'Caramel Crunch', 'whole_and_pieces'),
  (13, 'Latte', 'whole_and_pieces'),
  (14, 'Carrot', 'whole_and_pieces'),
  (15, 'Pecan', 'whole_and_pieces'),
  (16, 'Double Choco', 'whole_and_pieces'),
  (17, 'San Sebastian', 'whole_and_pieces'),
  (18, 'Cheesecake for Two – Chocolate', 'pieces_only'),
  (19, 'Cheesecake for Two – Original', 'pieces_only'),
  (20, 'Tiramisu', 'pieces_only');

-- ─── مواعيد الجرد (من التصميم) ───────────────────────────────────────

insert into public.count_schedules (location_id, time_of_day)
select l.id, t.time_of_day::time
from public.locations l
join (values
  ('FAC', '08:00'),
  ('SWF', '09:00'), ('SWF', '21:00'),
  ('JBH', '09:00'), ('JBH', '21:00'),
  ('DBQ', '09:00')
) as t(code, time_of_day) on t.code = l.code;

-- ─── الحد المطلوب: 20 من كل صنف بكل فرع (مثال لحد ما الأدمن يعدله) ───

insert into public.par_levels (location_id, product_id, par_pieces)
select l.id, p.id, 20 * coalesce(p.effective_pieces_per_cake, 1)
from public.locations l
cross join public.v_products p
where l.kind = 'branch';

-- ─── فورم الجرد: النسخة 1 لكل موقع جرد ───────────────────────────────

insert into public.count_form_versions (location_id, version, product_ids)
select l.id, 1, array(select p.id from public.products p where p.is_active order by p.sort_order)
from public.locations l
where l.kind in ('factory', 'branch');
