-- Fix create_backlog_task for databases where tasks.priority uses the
-- public.task_priority enum rather than text. Run this after the initial
-- task-first backlog migration if it was already applied.

drop function if exists public.create_backlog_task(text, text, text);

create function public.create_backlog_task(
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
    name, description, key_result_id, assignee_id, profile_id, creator_profile_id,
    type, priority, unit, target, current, weight, start_date, end_date, is_backlog
  )
  values (
    trim(p_name), nullif(trim(coalesce(p_description, '')), ''), null, null, null, actor_profile_id,
    'kpi', p_priority, 'count', 1, 0, 1, null, null, true
  )
  returning * into created_task;

  return created_task;
end;
$$;

revoke all on function public.create_backlog_task(text, text, public.task_priority) from public;
grant execute on function public.create_backlog_task(text, text, public.task_priority) to authenticated;
