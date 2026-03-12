-- Make task RLS robust by resolving actor profile via SECURITY DEFINER helpers.
-- This avoids cross-table RLS deadlocks when policies query profiles/roles/departments.

alter table if exists public.tasks enable row level security;
grant insert, update on table public.tasks to authenticated;

alter table if exists public.tasks
add column if not exists creator_profile_id uuid;

update public.tasks
set creator_profile_id = profile_id
where creator_profile_id is null
  and profile_id is not null;

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

create or replace function public.current_actor_is_root_leader()
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
    join public.departments d on d.id = urd.department_id
    where urd.profile_id in (select * from public.current_actor_profile_ids())
      and d.parent_department_id is null
      and lower(coalesce(r.name, '')) like '%leader%'
  );
$$;

revoke all on function public.current_actor_profile_ids() from public;
revoke all on function public.current_actor_is_root_leader() from public;
grant execute on function public.current_actor_profile_ids() to authenticated;
grant execute on function public.current_actor_is_root_leader() to authenticated;

-- Insert: root leader only; creator_profile_id must belong to current actor.
drop policy if exists tasks_insert_by_root_leader on public.tasks;
create policy tasks_insert_by_root_leader
on public.tasks
for insert
to authenticated
with check (
  public.current_actor_is_root_leader()
  and creator_profile_id in (select * from public.current_actor_profile_ids())
);

-- Update: creator or assignee can update; root leader can also update as fallback for old data.
drop policy if exists tasks_update_by_creator_or_assignee on public.tasks;
create policy tasks_update_by_creator_or_assignee
on public.tasks
for update
to authenticated
using (
  public.current_actor_is_root_leader()
  or exists (
    select 1
    from public.current_actor_profile_ids() actor_profile_id
    where actor_profile_id = public.tasks.profile_id
       or actor_profile_id = coalesce(public.tasks.creator_profile_id, public.tasks.profile_id)
  )
)
with check (
  public.current_actor_is_root_leader()
  or exists (
    select 1
    from public.current_actor_profile_ids() actor_profile_id
    where actor_profile_id = public.tasks.profile_id
       or actor_profile_id = coalesce(public.tasks.creator_profile_id, public.tasks.profile_id)
  )
);
