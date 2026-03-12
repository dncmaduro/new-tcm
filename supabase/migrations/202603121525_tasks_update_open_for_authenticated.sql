-- User-requested temporary mode: any authenticated user can update tasks.

alter table if exists public.tasks enable row level security;
grant update on table public.tasks to authenticated;

drop policy if exists tasks_update_by_creator_or_assignee on public.tasks;
drop policy if exists tasks_update_all_authenticated on public.tasks;

create policy tasks_update_all_authenticated
on public.tasks
for update
to authenticated
using (true)
with check (true);
