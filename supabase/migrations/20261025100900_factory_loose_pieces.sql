-- ملاحظات 25 أكتوبر: الأدمن بيقرر إذا المصنع بيطلّع قطع ولا كيكات كاملة بس.
-- إذا موقوف، خانة "قطع" بتختفي من الطلب من المصنع والإخراج وتوزيع اليوم (للأصناف اللي إلها كيكة).
-- الأصناف اللي قطع بس (متل التشيز كيك) ما بتتأثر.
alter table public.app_settings
  add column factory_loose_pieces_enabled boolean not null default true;
