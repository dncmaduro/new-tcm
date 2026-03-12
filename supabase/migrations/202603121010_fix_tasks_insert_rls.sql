-- Fix missing INSERT permission on public.tasks for authenticated users
-- who have Leader role in a root department.
-- This matches the current app-level permission gate in tasks/new.

alter table if exists public.tasks enable row level security;
alter table if exists public.profiles enable row level security;

grant insert on table public.tasks to authenticated;

drop policy if exists tasks_insert_by_root_leader on public.tasks;
create policy tasks_insert_by_root_leader
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    join public.user_role_in_department urd on urd.profile_id = p.id
    join public.roles r on r.id = urd.role_id
    join public.departments d on d.id = urd.department_id
    where p.user_id = auth.uid()
      and d.parent_department_id is null
      and lower(coalesce(r.name, '')) like '%leader%'
  )
);

-- Allow tasks/new to fetch all assignees (all profiles) for searchable select.
drop policy if exists profiles_select_all_authenticated on public.profiles;
create policy profiles_select_all_authenticated
on public.profiles
for select
to authenticated
using (true);
