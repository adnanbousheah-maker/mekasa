-- 23 نوفمبر 2026: الأدمن بيعدّل التعبئات (الاسم والحجم) وبيشيلها.
-- الشيل = إيقاف (الحركات القديمة مربوطة فيها، وكميتها محفوظة بالوحدة الأساسية qty_base).
alter table public.raw_material_units add column is_active boolean not null default true;
