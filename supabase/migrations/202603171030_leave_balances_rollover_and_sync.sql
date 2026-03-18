-- Manage monthly leave balances for approved/unauthorized leave requests.
-- Assumption: each month grants 8 leave hours and carry-over is capped at 16 hours total.

create extension if not exists pg_cron with schema extensions;

alter table if exists public.leave_balances enable row level security;
alter table if exists public.leave_balances force row level security;

grant select on table public.leave_balances to authenticated;

create unique index if not exists leave_balances_profile_month_key
on public.leave_balances (profile_id, month);

create or replace function public.current_actor_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.current_actor_profile_ids() from public;
grant execute on function public.current_actor_profile_ids() to authenticated;

drop policy if exists leave_balances_select_own_profile on public.leave_balances;
drop policy if exists leave_balances_select_all_authenticated on public.leave_balances;
create policy leave_balances_select_all_authenticated
on public.leave_balances
for select
to authenticated
using (true);

create or replace function public.sync_leave_balance_for_month(
  p_profile_id uuid,
  p_month date,
  p_monthly_allowance_hours integer default 8,
  p_monthly_cap_hours integer default 16
)
returns public.leave_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_month date;
  previous_month date;
  carryover_hours integer := 0;
  target_total_hours integer := 0;
  calculated_used_hours integer := 0;
  result_row public.leave_balances%rowtype;
begin
  if p_profile_id is null or p_month is null then
    raise exception 'profile_id and month are required';
  end if;

  normalized_month := date_trunc('month', p_month::timestamp)::date;
  previous_month := (normalized_month - interval '1 month')::date;

  select greatest(coalesce(lb.total_hours, 0) - coalesce(lb.used_hours, 0), 0)::integer
  into carryover_hours
  from public.leave_balances lb
  where lb.profile_id = p_profile_id
    and lb.month = previous_month;

  carryover_hours := coalesce(carryover_hours, 0);
  target_total_hours := least(
    greatest(coalesce(p_monthly_cap_hours, 16), 0),
    greatest(coalesce(p_monthly_allowance_hours, 8), 0) + carryover_hours
  );

  insert into public.leave_balances (
    profile_id,
    month,
    total_hours,
    used_hours,
    created_at
  )
  values (
    p_profile_id,
    normalized_month,
    target_total_hours,
    0,
    now()
  )
  on conflict (profile_id, month)
  do update
  set total_hours = least(
    greatest(public.leave_balances.total_hours, excluded.total_hours),
    greatest(coalesce(p_monthly_cap_hours, 16), 0)
  )
  returning * into result_row;

  select coalesce(
    sum(
      ceil(greatest(coalesce(tr.minutes, 0), 0)::numeric / 60.0)
    ),
    0
  )::integer
  into calculated_used_hours
  from public.time_requests tr
  where tr.profile_id = p_profile_id
    and tr.date >= normalized_month
    and tr.date < (normalized_month + interval '1 month')::date
    and tr.type in ('approved_leave', 'unauthorized_leave')
    and not exists (
      select 1
      from public.time_request_reviewers trr
      where trr.time_request_id = tr.id
        and trr.is_approved = false
    );

  update public.leave_balances lb
  set used_hours = calculated_used_hours
  where lb.id = result_row.id
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.sync_leave_balance_for_month(uuid, date, integer, integer) from public;

create or replace function public.ensure_leave_balance_for_month(
  p_profile_id uuid,
  p_month date
)
returns public.leave_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.leave_balances%rowtype;
begin
  if auth.role() = 'authenticated'
     and p_profile_id not in (select * from public.current_actor_profile_ids()) then
    raise exception 'Bạn không có quyền xem quỹ phép của hồ sơ này.';
  end if;

  select *
  into result_row
  from public.sync_leave_balance_for_month(p_profile_id, p_month);

  return result_row;
end;
$$;

revoke all on function public.ensure_leave_balance_for_month(uuid, date) from public;
grant execute on function public.ensure_leave_balance_for_month(uuid, date) to authenticated;

drop function if exists public.ensure_leave_balance_for_month(date, uuid);

create or replace function public.ensure_leave_balance_for_profile_month(
  p_profile_id uuid,
  p_month date
)
returns public.leave_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.leave_balances%rowtype;
begin
  select *
  into result_row
  from public.ensure_leave_balance_for_month(p_profile_id, p_month);

  return result_row;
end;
$$;

revoke all on function public.ensure_leave_balance_for_profile_month(uuid, date) from public;
grant execute on function public.ensure_leave_balance_for_profile_month(uuid, date) to authenticated;

create or replace function public.trg_time_requests_sync_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     and old.profile_id is not null
     and old.date is not null
     and old.type in ('approved_leave', 'unauthorized_leave') then
    perform public.sync_leave_balance_for_month(old.profile_id, old.date);
  end if;

  if tg_op = 'UPDATE'
     and old.profile_id is not null
     and old.date is not null
     and (
       old.type in ('approved_leave', 'unauthorized_leave')
       or new.profile_id is distinct from old.profile_id
       or new.date is distinct from old.date
       or new.type is distinct from old.type
     ) then
    perform public.sync_leave_balance_for_month(old.profile_id, old.date);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.profile_id is not null
     and new.date is not null
     and new.type in ('approved_leave', 'unauthorized_leave') then
    perform public.sync_leave_balance_for_month(new.profile_id, new.date);
  end if;

  return null;
end;
$$;

drop trigger if exists time_requests_sync_leave_balance on public.time_requests;
create trigger time_requests_sync_leave_balance
after insert or update or delete on public.time_requests
for each row
execute function public.trg_time_requests_sync_leave_balance();

create or replace function public.trg_time_request_reviewers_sync_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.time_requests%rowtype;
  target_request_id uuid;
begin
  target_request_id := case
    when tg_op = 'DELETE' then old.time_request_id
    else new.time_request_id
  end;

  select *
  into target_request
  from public.time_requests tr
  where tr.id = target_request_id;

  if target_request.id is null
     or target_request.profile_id is null
     or target_request.date is null
     or target_request.type not in ('approved_leave', 'unauthorized_leave') then
    return null;
  end if;

  perform public.sync_leave_balance_for_month(target_request.profile_id, target_request.date);

  return null;
end;
$$;

drop trigger if exists time_request_reviewers_sync_leave_balance on public.time_request_reviewers;
create trigger time_request_reviewers_sync_leave_balance
after insert or update or delete on public.time_request_reviewers
for each row
execute function public.trg_time_request_reviewers_sync_leave_balance();

create or replace function public.rollover_leave_balances(
  p_reference_at timestamptz default now(),
  p_timezone text default 'Asia/Ho_Chi_Minh',
  p_monthly_allowance_hours integer default 8,
  p_monthly_cap_hours integer default 16
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_local timestamp;
  target_month date;
  profile_row record;
begin
  reference_local := p_reference_at at time zone p_timezone;

  -- Run safely every day but only materialize balances on the first local day of the month.
  if extract(day from reference_local) <> 1 then
    return;
  end if;

  target_month := date_trunc('month', reference_local)::date;

  for profile_row in
    select p.id
    from public.profiles p
  loop
    perform public.sync_leave_balance_for_month(
      profile_row.id,
      target_month,
      p_monthly_allowance_hours,
      p_monthly_cap_hours
    );
  end loop;
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'monthly_leave_balance_rollover'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

-- 17:05 UTC = 00:05 Asia/Ho_Chi_Minh next day.
select cron.schedule(
  'monthly_leave_balance_rollover',
  '5 17 * * *',
  $$select public.rollover_leave_balances();$$
);

-- Backfill current month balances immediately after deploy.
do $$
declare
  current_month date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  profile_row record;
begin
  for profile_row in
    select p.id
    from public.profiles p
  loop
    perform public.sync_leave_balance_for_month(profile_row.id, current_month);
  end loop;
end;
$$;
