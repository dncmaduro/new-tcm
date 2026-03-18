-- Match the current goals creation flow at DB level:
-- keep read access for authenticated users and allow authenticated writes
-- so key_results / goal_departments are not stricter than goals.

alter table if exists public.key_results enable row level security;
alter table if exists public.goal_departments enable row level security;

grant select, insert, update on table public.key_results to authenticated;
grant select, insert, update on table public.goal_departments to authenticated;

drop policy if exists key_results_insert_by_root_leader on public.key_results;
drop policy if exists key_results_update_by_root_leader on public.key_results;
drop policy if exists key_results_insert_all_authenticated on public.key_results;
drop policy if exists key_results_update_all_authenticated on public.key_results;

create policy key_results_insert_all_authenticated
on public.key_results
for insert
to authenticated
with check (true);

create policy key_results_update_all_authenticated
on public.key_results
for update
to authenticated
using (true)
with check (true);

drop policy if exists goal_departments_insert_by_root_leader on public.goal_departments;
drop policy if exists goal_departments_update_by_root_leader on public.goal_departments;
drop policy if exists goal_departments_insert_all_authenticated on public.goal_departments;
drop policy if exists goal_departments_update_all_authenticated on public.goal_departments;

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
