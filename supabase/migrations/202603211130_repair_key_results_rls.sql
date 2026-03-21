-- Repair key_results RLS so the current goal/KR flow matches app permissions.
-- If the environment still keeps older root-leader-only policies,
-- inserts from users who can create goals will fail with 403 / 42501.

alter table if exists public.key_results enable row level security;

grant select, insert, update, delete on table public.key_results to authenticated;

drop policy if exists key_results_select_all_authenticated on public.key_results;
drop policy if exists key_results_insert_by_root_leader on public.key_results;
drop policy if exists key_results_update_by_root_leader on public.key_results;
drop policy if exists key_results_insert_all_authenticated on public.key_results;
drop policy if exists key_results_update_all_authenticated on public.key_results;
drop policy if exists key_results_delete_all_authenticated on public.key_results;

create policy key_results_select_all_authenticated
on public.key_results
for select
to authenticated
using (true);

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

create policy key_results_delete_all_authenticated
on public.key_results
for delete
to authenticated
using (true);
