-- Allow authenticated users to read tasks list/detail.
-- Without a SELECT policy, RLS returns empty rows even when data exists.

alter table if exists public.tasks enable row level security;

grant select on table public.tasks to authenticated;

drop policy if exists tasks_select_all_authenticated on public.tasks;
create policy tasks_select_all_authenticated
on public.tasks
for select
to authenticated
using (true);
