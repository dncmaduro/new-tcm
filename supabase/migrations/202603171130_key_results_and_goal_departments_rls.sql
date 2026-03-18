-- Enable RLS access for the new goal structure tables:
-- 1) key_results
-- 2) goal_departments
--
-- Read access is open to authenticated users so the app can render goal detail,
-- goals canvas, and task forms.
-- Write access follows the existing app permission model: root leader only.

alter table if exists public.key_results enable row level security;
alter table if exists public.goal_departments enable row level security;

grant select, insert, update on table public.key_results to authenticated;
grant select, insert, update on table public.goal_departments to authenticated;

drop policy if exists key_results_select_all_authenticated on public.key_results;
create policy key_results_select_all_authenticated
on public.key_results
for select
to authenticated
using (true);

drop policy if exists key_results_insert_by_root_leader on public.key_results;
create policy key_results_insert_by_root_leader
on public.key_results
for insert
to authenticated
with check (
  public.current_actor_is_root_leader()
);

drop policy if exists key_results_update_by_root_leader on public.key_results;
create policy key_results_update_by_root_leader
on public.key_results
for update
to authenticated
using (
  public.current_actor_is_root_leader()
)
with check (
  public.current_actor_is_root_leader()
);

drop policy if exists goal_departments_select_all_authenticated on public.goal_departments;
create policy goal_departments_select_all_authenticated
on public.goal_departments
for select
to authenticated
using (true);

drop policy if exists goal_departments_insert_by_root_leader on public.goal_departments;
create policy goal_departments_insert_by_root_leader
on public.goal_departments
for insert
to authenticated
with check (
  public.current_actor_is_root_leader()
);

drop policy if exists goal_departments_update_by_root_leader on public.goal_departments;
create policy goal_departments_update_by_root_leader
on public.goal_departments
for update
to authenticated
using (
  public.current_actor_is_root_leader()
)
with check (
  public.current_actor_is_root_leader()
);
