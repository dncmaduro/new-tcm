-- Repair and harden goal progress auto-recalculation.
-- Ensures trigger functions run with stable privileges even when RLS exists.

create or replace function public.recalculate_goal_progress(target_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  child_goal_count integer := 0;
  avg_child_task_progress numeric := 0;
  sum_child_goal_progress numeric := 0;
  computed_progress integer := 0;
begin
  if target_goal_id is null then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(coalesce(g.progress, 0)::numeric), 0)
  into child_goal_count, sum_child_goal_progress
  from public.goals g
  where g.parent_goal_id = target_goal_id;

  select
    coalesce(avg(coalesce(t.progress, 0)::numeric), 0)
  into avg_child_task_progress
  from public.tasks t
  where t.goal_id = target_goal_id;

  computed_progress := round(
    greatest(
      0::numeric,
      least(
        100::numeric,
        case
          when child_goal_count > 0
            then (avg_child_task_progress + sum_child_goal_progress) / (child_goal_count + 1)
          else avg_child_task_progress
        end
      )
    )
  )::integer;

  update public.goals g
  set progress = computed_progress
  where g.id = target_goal_id
    and g.progress is distinct from computed_progress;
end;
$$;

create or replace function public.trg_tasks_recalculate_goal_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_goal_progress(new.goal_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.recalculate_goal_progress(old.goal_id);
    return null;
  end if;

  if new.goal_id is distinct from old.goal_id then
    perform public.recalculate_goal_progress(old.goal_id);
    perform public.recalculate_goal_progress(new.goal_id);
    return null;
  end if;

  if new.progress is distinct from old.progress then
    perform public.recalculate_goal_progress(new.goal_id);
  end if;

  return null;
end;
$$;

create or replace function public.trg_goals_recalculate_parent_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_goal_progress(new.parent_goal_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.recalculate_goal_progress(old.parent_goal_id);
    return null;
  end if;

  if new.parent_goal_id is distinct from old.parent_goal_id then
    perform public.recalculate_goal_progress(old.parent_goal_id);
    perform public.recalculate_goal_progress(new.parent_goal_id);
    return null;
  end if;

  if new.progress is distinct from old.progress then
    perform public.recalculate_goal_progress(new.parent_goal_id);
  end if;

  return null;
end;
$$;

grant execute on function public.recalculate_goal_progress(uuid) to authenticated;

drop trigger if exists tasks_recalculate_goal_progress on public.tasks;
create trigger tasks_recalculate_goal_progress
after insert or update or delete on public.tasks
for each row
execute function public.trg_tasks_recalculate_goal_progress();

drop trigger if exists goals_recalculate_parent_progress on public.goals;
create trigger goals_recalculate_parent_progress
after insert or update or delete on public.goals
for each row
execute function public.trg_goals_recalculate_parent_progress();

-- Backfill all goals after deploying trigger repair.
do $$
declare
  current_goal_id uuid;
begin
  for current_goal_id in
    with recursive goal_tree as (
      select g.id, g.parent_goal_id, 0 as depth
      from public.goals g
      where g.parent_goal_id is null

      union all

      select child.id, child.parent_goal_id, parent.depth + 1
      from public.goals child
      join goal_tree parent on child.parent_goal_id = parent.id
    )
    select gt.id
    from goal_tree gt
    order by gt.depth desc
  loop
    perform public.recalculate_goal_progress(current_goal_id);
  end loop;
end;
$$;
