-- Task-first mode + backlog management
--
-- Run this migration in Supabase before deploying the UI changes. It preserves
-- all existing Goal/KR data; only future tasks are allowed to omit a KR.

alter table public.tasks
  alter column key_result_id drop not null,
  alter column assignee_id drop not null,
  alter column profile_id drop not null;

alter table public.tasks
  add column if not exists is_backlog boolean not null default false;

create index if not exists tasks_backlog_created_at_idx
  on public.tasks (created_at desc)
  where is_backlog = true;

-- A backlog item can be partially planned (assignee or deadline entered), but
-- must never be re-linked to a KR. It is promoted automatically once both
-- assignee and deadline are set.
alter table public.tasks
  drop constraint if exists tasks_backlog_has_no_key_result;

alter table public.tasks
  add constraint tasks_backlog_has_no_key_result
  check (not is_backlog or key_result_id is null);

create or replace function public.current_actor_is_backlog_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role_in_department urd
    join public.roles r on r.id = urd.role_id
    where urd.profile_id in (select * from public.current_actor_profile_ids())
      and (
        lower(coalesce(r.name, '')) like '%leader%'
        or lower(coalesce(r.name, '')) like '%director%'
        or lower(coalesce(r.name, '')) like '%giam doc%'
        or lower(coalesce(r.name, '')) like '%giám đốc%'
      )
  );
$$;

revoke all on function public.current_actor_is_backlog_manager() from public;
grant execute on function public.current_actor_is_backlog_manager() to authenticated;

create or replace function public.create_backlog_task(
  p_name text,
  p_description text default null,
  p_priority public.task_priority default 'medium'::public.task_priority
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  created_task public.tasks;
begin
  if not public.current_actor_is_backlog_manager() then
    raise exception 'only directors or leaders can manage backlog';
  end if;

  select profile_id into actor_profile_id
  from public.user_role_in_department
  where profile_id in (select * from public.current_actor_profile_ids())
  limit 1;

  if actor_profile_id is null then
    raise exception 'current user has no profile';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'task name is required';
  end if;

  insert into public.tasks (
    name,
    description,
    key_result_id,
    assignee_id,
    profile_id,
    creator_profile_id,
    type,
    priority,
    unit,
    target,
    current,
    weight,
    start_date,
    end_date,
    is_backlog
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    null,
    null,
    null,
    actor_profile_id,
    'kpi',
    p_priority,
    'count',
    1,
    0,
    1,
    null,
    null,
    true
  )
  returning * into created_task;

  return created_task;
end;
$$;

create or replace function public.schedule_backlog_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_end_date date
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_task public.tasks;
begin
  if not public.current_actor_is_backlog_manager() then
    raise exception 'only directors or leaders can manage backlog';
  end if;

  if p_assignee_id is not null and not exists (select 1 from public.profiles where id = p_assignee_id) then
    raise exception 'assignee does not exist';
  end if;

  update public.tasks
  set
    assignee_id = p_assignee_id,
    profile_id = p_assignee_id,
    end_date = p_end_date,
    is_backlog = p_assignee_id is null or p_end_date is null
  where id = p_task_id
    and is_backlog = true
  returning * into updated_task;

  if updated_task.id is null then
    raise exception 'backlog task not found or already scheduled';
  end if;

  return updated_task;
end;
$$;

revoke all on function public.create_backlog_task(text, text, public.task_priority) from public;
revoke all on function public.schedule_backlog_task(uuid, uuid, date) from public;
grant execute on function public.create_backlog_task(text, text, public.task_priority) to authenticated;
grant execute on function public.schedule_backlog_task(uuid, uuid, date) to authenticated;

-- The historical app policy made every task editable by every authenticated
-- user. Retain normal-task behaviour for compatibility, but prevent anyone
-- except a Director/Leader from modifying a backlog item directly.
drop policy if exists tasks_update_all_authenticated on public.tasks;
drop policy if exists tasks_update_by_creator_or_assignee on public.tasks;
drop policy if exists tasks_update_backlog_managed on public.tasks;

create policy tasks_update_backlog_managed
on public.tasks
for update
to authenticated
using (not is_backlog or public.current_actor_is_backlog_manager())
with check (not is_backlog or public.current_actor_is_backlog_manager());
