-- RLS fallback for tasks: allow identity matching by user_id OR email.
-- This fixes cases where profiles.user_id is not populated yet.

alter table if exists public.tasks enable row level security;
grant update on table public.tasks to authenticated;

-- Keep creator column available for creator-based permission checks.
alter table if exists public.tasks
add column if not exists creator_profile_id uuid;

-- Insert policy: keep root-leader gate, and require creator_profile_id belongs to current user.
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
    where (p.user_id = auth.uid() or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and d.parent_department_id is null
      and lower(coalesce(r.name, '')) like '%leader%'
  )
  and exists (
    select 1
    from public.profiles p
    where (p.user_id = auth.uid() or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and p.id = creator_profile_id
  )
);

-- Update policy: creator or assignee can update status/progress/info.
drop policy if exists tasks_update_by_creator_or_assignee on public.tasks;
create policy tasks_update_by_creator_or_assignee
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.user_id = auth.uid() or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and (
        p.id = public.tasks.profile_id
        or p.id = coalesce(public.tasks.creator_profile_id, public.tasks.profile_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where (p.user_id = auth.uid() or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and (
        p.id = public.tasks.profile_id
        or p.id = coalesce(public.tasks.creator_profile_id, public.tasks.profile_id)
      )
  )
);
