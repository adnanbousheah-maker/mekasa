-- 22 نوفمبر 2026: قيم جديدة لازم تنحفظ قبل ما تنستعمل (الـ migration اللي بعدها).
-- مسؤول المصنع: بيعمل شغل أمين المستودع والإخراج، وإله تقرير المصنع.
alter type public.app_role add value if not exists 'factory_manager';
-- الطلب طلع جزء منه، والباقي بيطلع بدفعة ثانية بنفس اليوم.
alter type public.request_status add value if not exists 'partial';
