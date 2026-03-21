-- Allow edit-goal flow to remove old participating departments before/after upsert.
-- Without DELETE access, stale goal_departments rows remain and later writes can drift.

alter table if exists public.goal_departments enable row level security;

grant delete on table public.goal_departments to authenticated;

drop policy if exists goal_departments_delete_all_authenticated on public.goal_departments;

create policy goal_departments_delete_all_authenticated
on public.goal_departments
for delete
to authenticated
using (true);
