-- الدفعة لازم تاريخ إنتاجها يكون معقول: مش بالمستقبل، ومش أقدم من 60 يوم.
-- بيحمي كل الطرق اللي بتعمل دفعة (الجرد، التالف، الإنتاج، المرتجعات).
create function private.check_batch_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.production_date > public.amman_today() or new.production_date < public.amman_today() - 60 then
    raise exception 'a batch production date must be within the last 60 days' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger batches_date_in_range
before insert on public.batches
for each row execute function private.check_batch_date();

revoke execute on function private.check_batch_date() from public, anon;
grant execute on function private.check_batch_date() to authenticated, service_role;
