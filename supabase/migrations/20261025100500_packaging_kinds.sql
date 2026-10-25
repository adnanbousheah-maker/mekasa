-- ملاحظات ميكاسا (25 أكتوبر 2026): مستودع التغليف. الأنواع الجديدة بملف لحالها لأنه قيم الـ enum
-- الجديدة ما بتنستعمل بنفس الـ transaction اللي انضافت فيها.

alter type public.location_kind add value if not exists 'packaging';
alter type public.app_role add value if not exists 'packaging_keeper';

-- مواد التغليف (علب، أكياس…) أصناف من نوع packaging: بتنعد بالحبة (قطع بس)،
-- والفروع بتطلبها من مستودع التغليف وبتستلمها بنفس مستندات الطلب والإخراج والاستلام.
create type public.product_kind as enum ('cake', 'packaging');

alter table public.products
  add column kind public.product_kind not null default 'cake',
  add constraint packaging_is_counted_in_units check (kind = 'cake' or sell_mode = 'pieces_only');

-- p.* بينحسب وقت إنشاء الـ view، فلازم ينعمل من جديد مشان يبين kind
drop view public.v_products;
create view public.v_products with (security_invoker = true) as
select
  p.*,
  case when p.sell_mode = 'pieces_only' then null
       else coalesce(p.pieces_per_cake, s.default_pieces_per_cake)
  end as effective_pieces_per_cake
from public.products p
cross join public.app_settings s;

revoke all on public.v_products from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_products from authenticated;
