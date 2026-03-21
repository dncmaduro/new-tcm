-- Repair goal_departments RLS so the create-goal flow can always persist
-- participating departments after the goal row has been inserted.

alter table if exists public.goal_departments enable row level security;

grant select, insert, update on table public.goal_departments to authenticated;

drop policy if exists goal_departments_select_all_authenticated on public.goal_departments;
drop policy if exists goal_departments_insert_by_root_leader on public.goal_departments;
drop policy if exists goal_departments_update_by_root_leader on public.goal_departments;
drop policy if exists goal_departments_insert_all_authenticated on public.goal_departments;
drop policy if exists goal_departments_update_all_authenticated on public.goal_departments;

create policy goal_departments_select_all_authenticated
on public.goal_departments
for select
to authenticated
using (true);

create policy goal_departments_insert_all_authenticated
on public.goal_departments
for insert
to authenticated
with check (true);

create policy goal_departments_update_all_authenticated
on public.goal_departments
for update
to authenticated
using (true)
with check (true);
