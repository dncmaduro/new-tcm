-- Track task creator explicitly and allow updates by creator/assignee.

alter table if exists public.tasks enable row level security;

alter table if exists public.tasks
add column if not exists creator_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_creator_profile_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_creator_profile_id_fkey
      foreign key (creator_profile_id)
      references public.profiles(id)
      on delete set null;
  end if;
end;
$$;

-- Backfill old rows: no creator info before this migration,
-- temporarily assume creator = assignee for existing records.
update public.tasks
set creator_profile_id = profile_id
where creator_profile_id is null
  and profile_id is not null;

grant update on table public.tasks to authenticated;

-- Keep insert gate at root leader level and force creator_profile_id to be the current user profile.
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
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.id = creator_profile_id
  )
);

drop policy if exists tasks_update_by_creator_or_assignee on public.tasks;
create policy tasks_update_by_creator_or_assignee
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.id = public.tasks.creator_profile_id or p.id = public.tasks.profile_id)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (p.id = public.tasks.creator_profile_id or p.id = public.tasks.profile_id)
  )
);
