-- المرحلة ب (8 نوفمبر 2026): القوائم اللي بيديرها الأدمن من اللوحة بدون مبرمج.
-- قائمة (lookup_lists) فيها خيارات (lookup_options): الاسم، الوصف، اللون، الأيقونة، الترتيب،
-- التشغيل، الأدوار المسموح إلها، والخيار الأب (تصنيف رئيسي وفرعي).
-- السجلات مربوطة بالخيار (id) مش بالنص، فإعادة التسمية بتبين بكل التاريخ.
-- الإيقاف بيخفي الخيار من الاختيار وبيخلي التاريخ. الحذف مسموح بس إذا ما انستعمل.

create table public.lookup_lists (
  key text primary key check (key ~ '^[a-z_]{3,40}$'),
  name text not null,
  description text,
  -- القائمة بتقبل تصنيفات فرعية؟
  allows_children boolean not null default false,
  -- القائمة بتقبل تحديد الأدوار؟
  allows_roles boolean not null default false,
  sort_order int not null default 0
);

alter table public.lookup_lists enable row level security;
create policy "active staff read lists" on public.lookup_lists
  for select to authenticated using (private.is_active_staff());

insert into public.lookup_lists (key, name, description, allows_children, allows_roles, sort_order) values
  ('waste_reasons', 'أسباب التالف', 'بتطلع للموظف لما يسجل تالف. "بدها ملاحظة" = لازم يكتب شو صار.', false, true, 1),
  ('product_categories', 'تصنيفات الأصناف', 'تجميع الكيك والصوصات بالطلب والتقارير.', true, false, 2),
  ('raw_categories', 'تصنيفات المواد الأولية', 'تجميع المواد الأولية.', true, false, 3),
  ('suppliers', 'الموردين', 'بيطلعوا لأمين المستودع لما يستلم مواد أولية.', false, false, 4);

create table public.lookup_options (
  id uuid primary key default gen_random_uuid(),
  list_key text not null references public.lookup_lists (key),
  parent_id uuid references public.lookup_options (id),
  -- رمز ثابت للخيارات اللي إلها معنى بالنظام (مثلاً expired)، ما بيتغير مع الاسم
  code text check (code is null or code ~ '^[a-z_]{2,30}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 200),
  color text check (color is null or color in ('gray', 'green', 'orange', 'red', 'blue', 'gold', 'purple')),
  icon text check (icon is null or length(icon) <= 8),
  sort_order int not null default 0,
  is_active boolean not null default true,
  requires_note boolean not null default false,
  -- null = كل الأدوار
  allowed_roles public.app_role[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lookup_option_not_own_parent check (parent_id is distinct from id)
);

create unique index lookup_options_name on public.lookup_options (list_key, lower(trim(name)));
create unique index lookup_options_code on public.lookup_options (list_key, code) where code is not null;
create index lookup_options_list on public.lookup_options (list_key, sort_order);

alter table public.lookup_options enable row level security;
create policy "active staff read options" on public.lookup_options
  for select to authenticated using (private.is_active_staff());
create policy "admin adds options" on public.lookup_options
  for insert to authenticated with check (private.is_admin());
create policy "admin edits options" on public.lookup_options
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create trigger lookup_options_audit after insert or update on public.lookup_options
  for each row execute function private.audit_row();

-- الأب لازم يكون من نفس القائمة، والقائمة بتقبل فرعي، ومستوى واحد بس (رئيسي ← فرعي)
create function private.check_option_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.parent_id is not null then
    if not (select l.allows_children from public.lookup_lists l where l.key = new.list_key) then
      raise exception 'this list has no sub-categories' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.lookup_options p
      where p.id = new.parent_id and p.list_key = new.list_key and p.parent_id is null
    ) then
      raise exception 'the parent must be a main option of the same list' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.lookup_options c where c.parent_id = new.id) then
      raise exception 'an option with sub-options cannot become a sub-option' using errcode = 'check_violation';
    end if;
  end if;
  if new.list_key is distinct from old.list_key and tg_op = 'UPDATE' then
    raise exception 'an option stays in its list' using errcode = 'check_violation';
  end if;
  if new.allowed_roles is not null
     and not (select l.allows_roles from public.lookup_lists l where l.key = new.list_key) then
    new.allowed_roles := null;
  end if;
  return new;
end;
$$;

create trigger lookup_options_parent before insert or update on public.lookup_options
  for each row execute function private.check_option_parent();

-- ─── الخيارات الأولى ─────────────────────────────────────────────────

insert into public.lookup_options (list_key, code, name, color, icon, sort_order, requires_note) values
  ('waste_reasons', 'expired', 'انتهت', 'orange', '⏰', 1, false),
  ('waste_reasons', 'broken', 'انكسرت', 'red', '💔', 2, false),
  ('waste_reasons', 'other', 'غيره', 'gray', null, 9, true);

-- ─── وين بتنستعمل ────────────────────────────────────────────────────

alter table public.waste_records add column reason_option_id uuid references public.lookup_options (id);
alter table public.products add column category_id uuid references public.lookup_options (id);
alter table public.raw_materials add column category_id uuid references public.lookup_options (id);
alter table public.raw_movements add column supplier_option_id uuid references public.lookup_options (id);

-- الخيار لازم يكون من القائمة الصح
create function private.option_in_list(opt uuid, wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select opt is null or exists (select 1 from public.lookup_options o where o.id = opt and o.list_key = wanted)
$$;

revoke execute on function private.option_in_list(uuid, text) from public, anon;
grant execute on function private.option_in_list(uuid, text) to authenticated, service_role;

alter table public.waste_records
  add constraint waste_reason_option_list check (private.option_in_list(reason_option_id, 'waste_reasons'));
alter table public.products
  add constraint product_category_list check (private.option_in_list(category_id, 'product_categories'));
alter table public.raw_materials
  add constraint raw_category_list check (private.option_in_list(category_id, 'raw_categories'));
alter table public.raw_movements
  add constraint raw_supplier_list check (private.option_in_list(supplier_option_id, 'suppliers'));

-- التالف القديم (والتالف من التوصيل) بالسبب الثابت: بنربطه بخياره
create function private.fill_waste_reason_option()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- log_waste بيحط الخيار المختار هون قبل record_waste (بنفس الـ transaction)
  if new.reason_option_id is null then
    new.reason_option_id := nullif(current_setting('mekasa.waste_reason_option', true), '')::uuid;
  end if;
  if new.reason_option_id is null then
    select o.id into new.reason_option_id
    from public.lookup_options o
    where o.list_key = 'waste_reasons' and o.code = new.reason::text;
  end if;
  return new;
end;
$$;

create trigger waste_records_reason_option before insert on public.waste_records
  for each row execute function private.fill_waste_reason_option();

-- السجلات القديمة (append-only) بتضل بدون خيار، والقراءة بتربطها بالرمز (reason).

-- استلام المواد: اسم المورد بيرتبط بخياره إذا موجود (بالاسم)
create function private.fill_raw_supplier_option()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.supplier_option_id is null and new.supplier_name is not null then
    select o.id into new.supplier_option_id
    from public.lookup_options o
    where o.list_key = 'suppliers' and lower(trim(o.name)) = lower(trim(new.supplier_name));
  end if;
  return new;
end;
$$;

create trigger raw_movements_supplier_option before insert on public.raw_movements
  for each row execute function private.fill_raw_supplier_option();

-- ─── التالف بسبب من القائمة ──────────────────────────────────────────
-- نفس record_waste، بس السبب خيار من "أسباب التالف": فعّال، ومسموح لدور الموظف،
-- وإذا "بدها ملاحظة" لازم تنكتب. العمود القديم reason بياخذ الرمز إذا كان من الثلاثة، وإلا other.
create function public.log_waste(
  p_location_id uuid,
  p_product_id uuid,
  p_unit public.entry_unit,
  p_qty int,
  p_reason_id uuid,
  p_note text default null,
  p_production_date date default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  opt public.lookup_options;
  record_id uuid;
begin
  select * into opt from public.lookup_options o
  where o.id = p_reason_id and o.list_key = 'waste_reasons' and o.is_active;
  if opt.id is null then
    raise exception 'pick a waste reason from the list' using errcode = 'check_violation';
  end if;
  if opt.allowed_roles is not null and not private.is_admin() and not exists (
    select 1 from unnest(opt.allowed_roles) r where private.has_role(r)
  ) then
    raise exception 'this reason is not for your role' using errcode = 'insufficient_privilege';
  end if;
  if opt.requires_note and coalesce(trim(p_note), '') = '' then
    raise exception 'this reason needs a note' using errcode = 'check_violation', hint = 'note_required';
  end if;

  perform set_config('mekasa.waste_reason_option', opt.id::text, true);
  record_id := public.record_waste(
    p_location_id, p_product_id, p_unit, p_qty,
    case when opt.code in ('expired', 'broken') then opt.code else 'other' end::public.waste_reason,
    -- السبب القديم "other" لازم ملاحظة: إذا الخيار جديد وما انكتب شي، ملاحظة تلقائية "[سبب] الاسم"
    -- (الشاشات بتخبيها، لأن اسم السبب بيبين من الخيار نفسه وبيتبع إعادة التسمية)
    case
      when opt.code in ('expired', 'broken') then p_note
      else coalesce(nullif(trim(p_note), ''), '[سبب] ' || opt.name)
    end,
    p_production_date, p_photo_path
  );
  perform set_config('mekasa.waste_reason_option', '', true);
  return record_id;
end;
$$;

revoke execute on function public.log_waste(uuid, uuid, public.entry_unit, int, uuid, text, date, text) from public, anon;
grant execute on function public.log_waste(uuid, uuid, public.entry_unit, int, uuid, text, date, text) to authenticated;

-- ─── الحذف: بس للخيار اللي ما انستعمل ولا مرة ────────────────────────

create function private.option_usage(opt uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.waste_records w where w.reason_option_id = opt) +
    (select count(*) from public.products p where p.category_id = opt) +
    (select count(*) from public.raw_materials m where m.category_id = opt) +
    (select count(*) from public.raw_movements m where m.supplier_option_id = opt) +
    (select count(*) from public.lookup_options c where c.parent_id = opt)
  )::int
$$;

revoke execute on function private.option_usage(uuid) from public, anon;
grant execute on function private.option_usage(uuid) to authenticated, service_role;

-- عدد الاستعمال لكل خيار (لشاشة الأدمن: الحذف بيبين بس للي صفر)
create view public.v_lookup_options with (security_invoker = true) as
select o.*, private.option_usage(o.id) as usage_count
from public.lookup_options o;

create function public.admin_delete_option(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  opt public.lookup_options;
begin
  if not private.is_admin() then
    raise exception 'only an admin can manage lists' using errcode = 'insufficient_privilege';
  end if;
  select * into opt from public.lookup_options o where o.id = p_option_id for update;
  if opt.id is null then
    raise exception 'option not found' using errcode = 'no_data_found';
  end if;
  if opt.code is not null then
    raise exception 'a built-in option can be switched off, not deleted' using errcode = 'check_violation',
      hint = 'built_in';
  end if;
  if private.option_usage(opt.id) > 0 then
    raise exception 'the option is in use: switch it off instead' using errcode = 'check_violation',
      hint = 'in_use';
  end if;
  -- بيبين بسجل التعديلات قبل ما ينحذف
  insert into public.audit_log (table_name, row_id, action, old_values, changed_by)
  values ('lookup_options', opt.id::text, 'delete', to_jsonb(opt), (select auth.uid()));
  delete from public.lookup_options where id = opt.id;
end;
$$;

revoke execute on function public.admin_delete_option(uuid) from public, anon;
grant execute on function public.admin_delete_option(uuid) to authenticated;
