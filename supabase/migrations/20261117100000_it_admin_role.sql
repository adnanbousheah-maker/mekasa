-- 17 نوفمبر 2026: دور "سوبر أدمن IT" (صاحب المشروع بس). لحاله بملف لأن قيمة enum جديدة
-- ما بتنستعمل بنفس الـ transaction اللي انضافت فيه.
alter type public.app_role add value if not exists 'it_admin';
