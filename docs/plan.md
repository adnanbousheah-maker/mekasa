# خطة التنفيذ (معتمدة 23 أكتوبر 2026)

هاد الملف بيكمّل CLAUDE.md بتفاصيل الهيكلية وقاعدة البيانات اللي انعتمدت. أي تغيير على هالقرارات لازم يتوافق عليه صاحب المشروع ويتحدّث هون.

## 1. هيكلة المجلدات

```
mekasa/
├── CLAUDE.md · docs/plan.md
├── design/                  مرجع التصميم (مش كود)
├── public/                  logo.jpg، أيقونات الـ PWA
├── supabase/
│   ├── migrations/          كل migration بملف
│   ├── tests/               فحوصات RLS
│   └── seed.sql
├── src/
│   ├── app/
│   │   ├── login/
│   │   ├── (staff)/         واجهة الجوال، والرئيسية حسب أدوار الموظف
│   │   │   ├── count/       method · camera · confirm · done
│   │   │   ├── waste/
│   │   │   ├── order/ orders/ receive/          (المرحلة 2)
│   │   │   └── factory/     count · production · requests · dispatch · raw
│   │   ├── admin/           overview · stock · counts · orders · factory · raw · waste · staff · settings · ai
│   │   ├── print/count-form/[location]/
│   │   └── api/             count-ocr · cron/reminders · push
│   ├── features/            لكل ميزة: actions · queries · schemas (zod) · components
│   ├── components/ui/       المكونات المشتركة (Button، Stepper، DayBadge، Quantity، ProductName، Logo)
│   ├── lib/
│   │   ├── supabase/        server · client · admin (service role، server-only)
│   │   ├── units.ts         قطع ⇄ كيكات + قطع
│   │   ├── day-number.ts    التاريخ ← رقم اليوم ولونه
│   │   └── time.ts          توقيت عمّان
│   └── proxy.ts             (Next 16 سمّى الـ middleware "proxy") تجديد الجلسة وطرد الموقوفين
└── tests/e2e/               Playwright. اختبارات الوحدات جنب ملفاتها (*.test.ts)
```

## 2. قاعدة البيانات

### المبادئ
- كل كميات الكيك أعداد صحيحة بالقطع. كل سطر بيدخله موظف بيحفظ كمان شو كتب (كيكات، قطع) وعدد القطع بالكيكة وقتها (`pieces_per_cake_snapshot`).
- كل مستند بيكتب حركاته بـ `stock_movements` بنفس الـ transaction.
- ما في كتابة مباشرة من التطبيق على جداول المستندات والحركات. كل عملية دالة Postgres (`confirm_count`، `record_waste`، …) بتفحص الدور والموقع وبتكتب كل شي أو ولا شي. Server Actions بتناديها بجلسة المستخدم (RLS شغال).
- service role بس لـ: إنشاء/إيقاف الحسابات وإعادة الرمز، عدادات القفل، الـ cron.
- التواريخ بتوقيت `Asia/Amman`، واليوم التشغيلي ورقم اليوم بينحسبوا بقاعدة البيانات.

### المرحلة 1
| الجدول | شو فيه |
| --- | --- |
| `locations` | الاسم، النوع (factory / branch / returns_bin)، رمز قصير للفورم، parent_location_id (للمرتجعات)، فعّال |
| `staff` | id = auth.users.id، الاسم، الجوال (E.164 فريد)، الموقع، فعّال، المحاولات الغلط، مقفول لإيمتى، آخر دخول |
| `staff_roles` | (staff_id, role) و role من enum: admin, branch_staff, dispatcher, storekeeper |
| `login_attempts` | جوال، IP، نجح، الوقت |
| `app_settings` | صف واحد بأعمدة محددة: القطع العام 10، موافقة الطلبات، التحويل، الإرجاع، ساعات تنبيه الإخراج 3، مدة الحياة بالمصنع 7 (≤ 7) وبالفرع 3، الجرد بالصورة، دقايق التذكير 10 والتأخير 15 |
| `products` | name_en، name_ar، sell_mode (whole_and_pieces / pieces_only)، pieces_per_cake (null = العام)، صورة، ترتيب، فعّال |
| `count_schedules` | الموقع، الساعة، فعّال |
| `count_form_versions` | الموقع، رقم النسخة، ترتيب الأصناف المطبوع. الـ QR بيأشر عليها |
| `stock_counts` | الموقع، schedule_id، business_date، method (manual/photo)، status (draft/confirmed)، started_at (فتح الشاشة)، confirmed_at، counted_by، photo_path، form_version_id، is_opening |
| `stock_count_lines` | الصنف، batch_id (بالمصنع)، whole_cakes، loose_pieces، pieces_per_cake_snapshot، qty_pieces، ocr_whole، ocr_pieces، ocr_confidence لكل رقم |
| `batches` | product_id + production_date (فريدين)، day_number محسوب |
| `waste_records` | الموقع، الصنف، الدفعة (بالمصنع)، الكمية، entered_unit/entered_qty، reason (expired/broken/other)، ملاحظة، صورة |
| `stock_movements` | occurred_at، الموقع، الصنف، الدفعة، qty_pieces (±)، movement_type، عمود FK لكل نوع مستند مع CHECK إنه واحد بس معبّى، created_by |
| `audit_log` | table_name، row_id، old/new jsonb، reason، changed_by، changed_at |
| `push_subscriptions` · `notification_log` | اشتراكات Web Push، وسجل فريد (schedule_id, slot_date, kind) مشان التذكير ما يتكرر |
| `ai_usage_log` | الميزة، الموديل، التوكنز، الرد الخام |

أنواع الحركات: opening_balance، count_adjustment، waste، production، dispatch_out، receipt_in، return_to_stock، admin_correction، ولاحقاً sale.

### المرحلة 2
| الجدول | شو فيه |
| --- | --- |
| `par_levels` | (location, product) → par_pieces |
| `stock_requests` + `stock_request_lines` | من فرع لمصنع، الحالة، الكمية المقترحة وقت الطلب، موافقة الأدمن |
| `dispatches` + `dispatch_lines` | من أي موقع لأي موقع، request_id اختياري، kind (replenishment/transfer/return) |
| `dispatch_line_batches` | الدفعة والكمية، is_fefo_override ومين أكّد |
| `receipts` + `receipt_lines` | واحد لكل إخراج، الأسطر من أسطر الإخراج، الواصل، ملاحظة، قرار الأدمن على الفرق (waste/review/resolved) |
| `production_entries` + `production_lines` | تسجيلات اليوم، وكل سطر بيروح لدفعة اليوم |
| `return_dispositions` | قرار أمين المستودع: للستوك (أي دفعة) أو تالف |

خانة المرتجعات = صف بـ `locations` نوعه returns_bin، فالإرجاع إخراج عادي إله.

### المرحلة 3 و4
- `raw_materials` (الوحدة الأساسية، الحد الأدنى)، `raw_material_units` (الكيس = 25 كيلو)، `raw_movements` (receipt مع supplier_name وصورة فاتورة، issue، count_adjustment، correction)، `raw_counts` + `raw_count_lines`.
- `ai_conversations` + `ai_messages`.

### Views
الستوك الحالي (موقع × صنف × دفعة)، الاستهلاك، حالة جرودات اليوم، الإخراج اللي ما انستلم، عمر الكيك بالفروع (FIFO)، "بيكفي كم يوم". view عادي بالأول، وmaterialized إذا احتجنا.

### قواعد الجرد
- المتوقع وقت الجرد = جرد سابق + دخل − طلع − تالف. التعديل = العد − المتوقع، وبينسجل بوقت بداية الجرد.
- الاستهلاك = سالب التعديل. التعديل الموجب = رقم مستحيل (أحمر).
- أول جرد بكل موقع رصيد افتتاحي (`is_opening`) وما بيدخل بالاستهلاك.
- تصحيح الأدمن لجرد قديم: حركة على الجرد المصحح، وحركة معاكسة على الجرد اللي بعده (إذا موجود)، مشان الاستهلاك بالفترتين يضل صح.

### RLS
- دوال مساعدة `is_admin()`، `has_role()`، `my_location()`، وكلها بترجع لأ للموظف الموقوف.
- المرجعيات (مواقع، أصناف، إعدادات، مواعيد، حد مطلوب): قراءة لأي موظف فعّال، كتابة للأدمن.
- البيانات المرتبطة بموقع: الأدمن الكل، والموظف موقعه بس. الطلبات والإخراج والاستلام: موقع المصدر والوجهة.
- ما في INSERT/UPDATE مباشر على المستندات والحركات. trigger بيمنع UPDATE/DELETE على `stock_movements` والجرد المؤكد للكل، حتى service role.
- `staff`: كل واحد حاله، الأدمن الكل، والباقي الأسماء بس عن طريق view.
- Storage: buckets خاصة (count-photos، waste-photos، invoices)، المسار بيبلش بـ location_id، والعرض بروابط مؤقتة.

## 3. الدخول (معتمد)
- Supabase Auth بإيميل مركّب من رقم الجوال.
- كلمة السر = HMAC-SHA256(`AUTH_PIN_PEPPER`, staff_id + الرمز). المفتاح على السيرفر بس، فما حدا بيقدر يجرب رموز مباشرة على Supabase.
- الدخول كله على السيرفر: توحيد الرقم (9627XXXXXXXX)، فحص القفل، الاشتقاق، الدخول، الكوكيز.
- القفل: 5 غلط → 15 دقيقة. 5 غلط كمان → مقفول لحد ما الأدمن يعطي رمز جديد. وحد لكل IP.
- الرمز: 4 أرقام للموظفين، 6 للأدمن. النظام بيولده عشوائي (بدون الرموز السهلة)، بيبين للأدمن مرة وحدة، وما بينحفظ.
- الإيقاف: is_active=false (RLS بتسكّر فوراً) + حظر بـ Supabase Auth + proxy بيرجّع لشاشة الدخول.
- جلسة طويلة على جوالات الموظفين.

## 4. ترتيب الشغل للمرحلة الأولى
1. ✅ التجهيز: git، نقل design، Next.js 16 + TypeScript + Tailwind 4، الخطوط والألوان، RTL، المكونات الأساسية، Vitest وPlaywright.
2. قاعدة البيانات كاملة (المراحل 1–3 + سجلات 4) مع RLS والـ triggers والـ views والـ buckets والـ seed وفحوصات RLS.
3. الدخول والموظفين (شاشة الدخول، القفل، الرئيسية حسب الدور، شاشة الموظفين بلوحة الأدمن).
4. الإعدادات: الأصناف، العامة، مواعيد الجرد.
5. الجرد اليدوي: الفرع، والمصنع جرد أعمى بالدفعات، والرصيد الافتتاحي.
6. التالف.
7. فورم الجرد المطبوع (A4، QR، مربعات الزوايا، نسخة الفورم).
8. الجرد بالصورة (Claude vision، JSON مع ثقة، شاشة تأكيد، تسجيل التصحيحات).
9. المواعيد والإشعارات (حالة الجرد، PWA، Web Push، pg_cron).
10. لوحة الأدمن: النظرة العامة، الستوك والاستهلاك، الجرودات وتفاصيلها مع التعديل والسجل، التالف، تصدير Excel.
11. التسليم: مراجعة أمنية، اختبارات E2E، Vercel، قائمة فحص يدوي.
