-- 25 نوفمبر 2026: مواد بتنعدّ مع بعض بنفس السطر بجرد المواد (مثلاً "قواعد كيك كبير" و"قواعد كيك وسط").
-- كل مادة ستوكها وحدها الأدنى لحالها، بس بالجرد بيبينوا بكرت واحد جنب بعض. فراغ = مادة لحالها.
alter table public.raw_materials
  add column count_group text check (count_group is null or length(trim(count_group)) between 1 and 40);
