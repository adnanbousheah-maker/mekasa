# النشر على السحابة (Supabase + Vercel)

## الوضع الحالي (23 أكتوبر 2026)
- **Supabase:** مشروع `mekasa` (`nuqbkajkdenblfyaklkd`، Frankfurt). الـ migrations انرفعت عن طريق Supabase MCP (أسماءها بالسجل من غير التاريخ، فـ `supabase db push` رح يشوفها مش مرفوعة: استعمل `supabase migration repair` قبل أول push). البيانات الأساسية من `seed.sql` موجودة، وأسرار Vault (`mekasa_app_url`، `mekasa_cron_secret`) محطوطة. الهيكلية انفحصت مقابل المحلي (بصمة الدوال والأعمدة والـ policies والـ triggers والـ views) وطابقت.
- **قاعدة البيانات كاملة:** آخر 3 أجزاء (فيها `delete`/`truncate`، وأداة MCP بتطلب عليها موافقة) انحطوا من SQL Editor. الدوال اللي إجت من هناك نهايات أسطرها `\r\n` (نسخ من ويندوز)، وغير هيك مطابقة للأصل.
- **Vercel:** مشروع `mekasa` مربوط بالمستودع، `https://mekasa.vercel.app` (fra1). المتغيرات كلها محطوطة إلا `ANTHROPIC_API_KEY`. تذكيرات pg_cron شغالة (200). الفرع `main` قديم، فالنشر الحالي من `feat/auth-nxciay`؛ بعد الدمج بـ `main` كل push بينشر لحاله.
- **إعدادات Auth بالسحابة** (الخطوة 1.3 تحت) لسا لازم تنعمل من اللوحة.

هالدليل لصاحب المشروع. كل المفاتيح بتنحط بلوحات Supabase وVercel أو بملف محلي مش على git، وممنوع تنبعت لحدا.

## 1. Supabase
1. اعمل مشروع جديد على supabase.com (المنطقة الأقرب: Frankfurt `eu-central-1`).
2. من جهازك، جوا مجلد المشروع:
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase db push          # بيرفع كل الـ migrations
   ```
   الـ seed (المواقع والأصناف والمواد) ما بيروح مع `db push`. افتح SQL Editor بلوحة Supabase والصق محتوى `supabase/seed.sql` وشغّله مرة وحدة.
3. **Authentication → Sign In / Providers** لازم يطابق `supabase/config.toml`:
   - Allow new users to sign up: **موقوف**.
   - Email provider: **مفعّل** (الدخول كله عن طريقه)، وConfirm email: موقوف.
   - Minimum password length: **40**، وSecure password change: مفعّل.
   - Rate limits → Sign-ups and sign-ins: **300** بالخمس دقايق (كل الدخول جاي من عناوين Vercel).
4. **Database → Extensions**: تأكد إنه `pg_cron` و`pg_net` مفعّلين (الـ migration بتفعّلهم، بس تأكد).
5. **SQL Editor**: حط عنوان التطبيق وسر الـ cron بـ Vault (نفس قيمة `CRON_SECRET` بـ Vercel):
   ```sql
   select vault.create_secret('https://<اسم-التطبيق>.vercel.app', 'mekasa_app_url');
   select vault.create_secret('<CRON_SECRET>', 'mekasa_cron_secret');
   ```
   بدون هدول التذكيرات ما بتشتغل (المهمة بتطلع بدون ما تعمل شي).

## 2. المفاتيح
ولّدهم على جهازك:
```bash
openssl rand -base64 32            # AUTH_PIN_PEPPER
openssl rand -base64 32            # CRON_SECRET
npx web-push generate-vapid-keys   # NEXT_PUBLIC_VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY
```
- `AUTH_PIN_PEPPER`: احفظه بمكان آمن. إذا تغيّر، كل الرموز بتبطل وبتحتاج رموز جديدة لكل الموظفين.
- مفاتيح Supabase من Project Settings → API (`URL`، `anon`، `service_role`).
- `ANTHROPIC_API_KEY` من console.anthropic.com (حط حد شهري للصرف هناك).

## 3. Vercel
1. Import للمستودع من GitHub. الإعدادات الافتراضية لـ Next.js بتكفي (`npm run build`). Node 24.
2. Settings → Environment Variables (Production)، الثمانية اللي بـ `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`، `SUPABASE_SERVICE_ROLE_KEY`، `ANTHROPIC_API_KEY`، `AUTH_PIN_PEPPER`، `NEXT_PUBLIC_VAPID_PUBLIC_KEY`، `VAPID_PRIVATE_KEY`، `CRON_SECRET`.
   **ما تحط** `MEKASA_FAKE_OCR` ولا `MEKASA_FAKE_AI` (للتطوير بس، وبالإنتاج بينتجاهلوا أصلاً).
3. Deploy. إذا تغيّر اسم الدومين، حدّث `mekasa_app_url` بـ Vault:
   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'mekasa_app_url'), 'https://<الدومين الجديد>');
   ```

## 4. أول أدمن
اعمل ملف `.env.production.local` على جهازك (ممنوع على git، والـ `.gitignore` بيمنعه) فيه `NEXT_PUBLIC_SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` و`AUTH_PIN_PEPPER` تبعين السحابة، وبعدين:
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.production.local scripts/create-admin.ts "الاسم" 07XXXXXXXX
```
بيطبع رمز من 6 أرقام مرة وحدة. ادخل فيه، وضيف باقي الموظفين من **الموظفين** بلوحة الإدارة. السكربت بيرفض إذا في أدمن فعّال. الأفضل تعمل أدمن ثاني من اللوحة مشان إذا واحد انقفل.

إذا الأدمن الوحيد انقفل: `scripts/reset-pin.ts` بنفس الملف:
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.production.local scripts/reset-pin.ts 07XXXXXXXX
```

## 5. بعد النشر
- اطبع فورم الجرد لكل موقع من **الإعدادات → مواعيد الجرد**.
- حدد مواعيد الجرد والحد المطلوب لكل فرع.
- على الجوالات: افتح الموقع بـ Safari/Chrome و"إضافة للشاشة الرئيسية". **آيفون:** الإشعارات بتشتغل بس بعد ما ينضاف التطبيق للشاشة الرئيسية وينفتح منها (iOS 16.4 أو أحدث).
- الإشعارات ما بتوصل إذا الموظف ما كبس "فعّل الإشعارات" بالرئيسية.

## 6. الخطط المجانية
- Supabase المجاني بيوقف المشروع بعد أسبوع بدون استخدام. الاستخدام اليومي بيمنع هالشي.
- Vercel Hobby مش للاستخدام التجاري؛ لما تخلص التجربة انقل لـ Pro.
- تكلفة Claude بتنشاف بـ `ai_usage_log` وبلوحة Anthropic.
