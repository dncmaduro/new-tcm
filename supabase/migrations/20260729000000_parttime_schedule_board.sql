-- A schedule is a shared board: all authenticated users can inspect it before
-- it is finalized, while the existing RPCs remain the only way to register,
-- finalize, or alter entries.
drop policy if exists "Authenticated users can view part-time schedules" on public.parttime_schedules;
create policy "Authenticated users can view part-time schedules"
  on public.parttime_schedules
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can view part-time schedule entries" on public.parttime_schedule_entries;
create policy "Authenticated users can view part-time schedule entries"
  on public.parttime_schedule_entries
  for select
  to authenticated
  using (true);

-- Leaders create an empty weekly schedule explicitly. The existing
-- register_parttime_shift RPC still owns the validation that a registrant is
-- part-time and belongs to the selected department.
create or replace function public.create_parttime_schedule(
  p_department_id uuid,
  p_week_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id
  from public.profiles
  where user_id = auth.uid();

  if v_profile_id is null then
    raise exception 'profile not found';
  end if;

  if not exists (
    select 1
    from public.user_role_in_department membership
    join public.roles role on role.id = membership.role_id
    where membership.profile_id = v_profile_id
      and membership.department_id = p_department_id
      and lower(role.name) like '%leader%'
  ) then
    raise exception 'only leaders can create part-time schedules';
  end if;

  if p_week_start <> date_trunc('week', p_week_start)::date then
    raise exception 'week start must be a monday';
  end if;

  insert into public.parttime_schedules (department_id, week_start, status, created_by)
  values (p_department_id, p_week_start, 'open', v_profile_id)
  on conflict (department_id, week_start) do nothing;
end;
$$;

revoke all on function public.create_parttime_schedule(uuid, date) from public;
grant execute on function public.create_parttime_schedule(uuid, date) to authenticated;

-- Keep the registration eligibility rule at the database boundary as well as
-- in the UI. This also covers direct RPC calls.
create or replace function public.validate_parttime_schedule_entry_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department_id uuid;
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.profile_id
      and is_parttime = true
  ) then
    raise exception 'only part-time profiles can register shifts';
  end if;

  select department_id into v_department_id
  from public.parttime_schedules
  where id = new.schedule_id;

  if v_department_id is null or not exists (
    select 1
    from public.user_role_in_department
    where profile_id = new.profile_id
      and department_id = v_department_id
  ) then
    raise exception 'profile is not a member of this department';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_parttime_schedule_entry_access on public.parttime_schedule_entries;
create trigger validate_parttime_schedule_entry_access
  before insert or update of profile_id, schedule_id
  on public.parttime_schedule_entries
  for each row
  execute function public.validate_parttime_schedule_entry_access();
