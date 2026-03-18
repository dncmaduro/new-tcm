-- RLS policies for time request creation/review flow.
-- This fixes "new row violates row-level security policy for table time_requests".

alter table if exists public.time_requests enable row level security;
alter table if exists public.time_request_reviewers enable row level security;

grant select, insert on table public.time_requests to authenticated;
grant select, insert, update on table public.time_request_reviewers to authenticated;

-- Ensure helper exists (used by several policies in this project).
create or replace function public.current_actor_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.current_actor_profile_ids() from public;
grant execute on function public.current_actor_profile_ids() to authenticated;

-- time_requests
drop policy if exists time_requests_select_all_authenticated on public.time_requests;
drop policy if exists time_requests_insert_own_profile on public.time_requests;

create policy time_requests_select_all_authenticated
on public.time_requests
for select
to authenticated
using (true);

create policy time_requests_insert_own_profile
on public.time_requests
for insert
to authenticated
with check (
  profile_id in (select * from public.current_actor_profile_ids())
);

-- time_request_reviewers
drop policy if exists time_request_reviewers_select_all_authenticated on public.time_request_reviewers;
drop policy if exists time_request_reviewers_insert_by_requester_or_reviewer on public.time_request_reviewers;
drop policy if exists time_request_reviewers_update_by_reviewer on public.time_request_reviewers;

create policy time_request_reviewers_select_all_authenticated
on public.time_request_reviewers
for select
to authenticated
using (true);

-- Allow:
-- 1) requester creates reviewer rows for a request they just created.
-- 2) reviewer creates own review row if missing.
create policy time_request_reviewers_insert_by_requester_or_reviewer
on public.time_request_reviewers
for insert
to authenticated
with check (
  profile_id in (select * from public.current_actor_profile_ids())
  or exists (
    select 1
    from public.time_requests tr
    where tr.id = time_request_reviewers.time_request_id
      and tr.profile_id in (select * from public.current_actor_profile_ids())
  )
);

-- Reviewer can update only their own review decision.
create policy time_request_reviewers_update_by_reviewer
on public.time_request_reviewers
for update
to authenticated
using (
  profile_id in (select * from public.current_actor_profile_ids())
)
with check (
  profile_id in (select * from public.current_actor_profile_ids())
);
