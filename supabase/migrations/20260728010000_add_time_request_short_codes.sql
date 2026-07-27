alter table public.time_requests
  add column if not exists short_code text;

create or replace function public.generate_time_request_short_code()
returns text
language plpgsql
volatile
as $$
declare
  candidate text;
begin
  loop
    candidate := substring(md5(random()::text || clock_timestamp()::text) from 1 for 10);
    exit when not exists (
      select 1
      from public.time_requests
      where short_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create unique index if not exists time_requests_short_code_key
  on public.time_requests (short_code);

alter table public.time_requests
  add constraint time_requests_short_code_format
  check (short_code ~ '^[a-f0-9]{10}$');

create or replace function public.set_time_request_short_code()
returns trigger
language plpgsql
as $$
begin
  if new.short_code is null or btrim(new.short_code) = '' then
    new.short_code := public.generate_time_request_short_code();
  else
    new.short_code := lower(btrim(new.short_code));
  end if;

  return new;
end;
$$;

drop trigger if exists set_time_request_short_code_before_insert on public.time_requests;

create trigger set_time_request_short_code_before_insert
before insert on public.time_requests
for each row
execute function public.set_time_request_short_code();
