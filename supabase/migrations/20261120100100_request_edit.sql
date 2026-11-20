-- 20 نوفمبر 2026: تعديل الطلب خلال ربع ساعة، والحذف (الإلغاء) للأدمن والمدير العام، والقطع لحد 99.
-- أسطر الطلب append-only، فالتعديل = الطلب القديم بينلغى وطلب جديد بنفس وقت الطلب الأصلي
-- (replaces_request_id)، فالربع ساعة ما بتتجدد مع كل تعديل، والتاريخ كله بيضل.

alter table public.stock_requests
  add column replaces_request_id uuid unique references public.stock_requests (id);

-- كم دقيقة بيقدر الفرع يعدّل أو يلغي طلبه
create function private.request_edit_minutes()
returns int
language sql
immutable
set search_path = ''
as $$
  select 15
$$;

revoke execute on function private.request_edit_minutes() from public, anon;
grant execute on function private.request_edit_minutes() to authenticated, service_role;

-- القطع بطلب الكيك والصوصات لحد 99 (التغليف بالحبة ممكن يكون بالمية)
create function private.check_request_line_pieces()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.loose_pieces > 99
     and (select p.kind from public.products p where p.id = new.product_id) <> 'packaging' then
    raise exception 'pieces in a request go up to 99' using errcode = 'check_violation', hint = 'too_many_pieces';
  end if;
  return new;
end;
$$;

create trigger stock_request_lines_pieces
before insert on public.stock_request_lines
for each row execute function private.check_request_line_pieces();

-- الإلغاء: الأدمن والمدير العام بأي وقت قبل ما يطلع، والفرع خلال ربع ساعة بس
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stock_requests r
  set status = 'cancelled'
  where r.id = p_request_id
    and r.status in ('pending_approval', 'sent')
    and (
      private.is_admin()
      or private.has_role('general_manager')
      or (private.has_role('branch_staff')
          and r.requesting_location_id = private.my_location_id()
          and now() - r.requested_at <= make_interval(mins => private.request_edit_minutes()))
    );
  if not found then
    raise exception 'the request cannot be cancelled' using errcode = 'check_violation', hint = 'not_editable';
  end if;
end;
$$;

-- التعديل: نفس مدخلات create_request. بيرجع رقم الطلب الجديد.
create function public.edit_request(
  p_request_id uuid,
  p_lines jsonb,
  p_note text default null,
  p_missing jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.stock_requests;
  request uuid;
begin
  select * into old from public.stock_requests r where r.id = p_request_id for update;
  if old.id is null
     or not private.has_role('branch_staff')
     or old.requesting_location_id is distinct from private.my_location_id() then
    raise exception 'this request is not yours' using errcode = 'insufficient_privilege';
  end if;
  if old.status not in ('pending_approval', 'sent')
     or now() - old.requested_at > make_interval(mins => private.request_edit_minutes()) then
    raise exception 'the request can no longer be changed' using errcode = 'check_violation', hint = 'not_editable';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a request needs at least one line' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(p_missing, '[]')) is distinct from 'array' then
    raise exception 'forgotten items must be a list' using errcode = 'check_violation';
  end if;

  update public.stock_requests set status = 'cancelled' where id = old.id;

  insert into public.stock_requests
    (requesting_location_id, supplying_location_id, status, requested_by, requested_at, note, replaces_request_id)
  values (old.requesting_location_id, old.supplying_location_id, old.status, (select auth.uid()),
          old.requested_at, nullif(trim(p_note), ''), old.id)
  returning id into request;

  insert into public.stock_request_lines (request_id, product_id, whole_cakes, loose_pieces, pieces_per_cake_snapshot, suggested_pieces)
  select request, p.id, coalesce((e ->> 'whole_cakes')::int, 0), coalesce((e ->> 'loose_pieces')::int, 0),
         p.effective_pieces_per_cake, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(p_lines) e
  join public.v_products p on p.id = (e ->> 'product_id')::uuid and p.is_active;

  if (select count(*) from public.stock_request_lines l where l.request_id = request) <> jsonb_array_length(p_lines) then
    raise exception 'every line needs an active product' using errcode = 'check_violation';
  end if;

  insert into public.stock_request_missing (request_id, product_id, suggested_pieces)
  select request, p.id, (e ->> 'suggested_pieces')::int
  from jsonb_array_elements(coalesce(p_missing, '[]')) e
  join public.products p on p.id = (e ->> 'product_id')::uuid and p.is_active
  where not exists (
    select 1 from public.stock_request_lines l where l.request_id = request and l.product_id = p.id
  );
  return request;
end;
$$;

revoke execute on function public.edit_request(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.edit_request(uuid, jsonb, text, jsonb) to authenticated;
