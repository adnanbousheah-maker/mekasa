-- المرحلة أ: دورين جداد. لحالهم مشان القيم الجديدة تنستعمل بالـ migration اللي بعده.
-- general_manager: المدير العام، بيشوف كل شي بدون تعديل.
-- branch_manager: مسؤول الفرع، كل شغل موظف الفرع + تقارير فرعه.
alter type public.app_role add value if not exists 'general_manager';
alter type public.app_role add value if not exists 'branch_manager';
