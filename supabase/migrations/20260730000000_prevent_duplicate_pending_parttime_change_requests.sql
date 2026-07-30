-- A person may have only one unresolved change request for the same schedule.
-- The UI mirrors this rule, while the trigger protects direct RPC calls too.
create or replace function public.prevent_duplicate_pending_parttime_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.parttime_schedule_change_requests request
    left join public.parttime_schedule_entries original_entry
      on original_entry.id = request.original_entry_id
    where request.profile_id = new.profile_id
      and request.schedule_id = new.schedule_id
      and request.status = 'pending'
      and (
        (new.requested_work_date is not null and new.requested_shift is not null and (
          (request.requested_work_date = new.requested_work_date and request.requested_shift = new.requested_shift)
          or (original_entry.work_date = new.requested_work_date and original_entry.shift = new.requested_shift)
        ))
        or exists (
          select 1
          from public.parttime_schedule_entries new_original_entry
          where new_original_entry.id = new.original_entry_id
            and (
              (request.requested_work_date = new_original_entry.work_date and request.requested_shift = new_original_entry.shift)
              or (original_entry.work_date = new_original_entry.work_date and original_entry.shift = new_original_entry.shift)
            )
        )
      )
  ) then
    raise exception 'a pending schedule change request already exists for this shift';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_pending_parttime_change_request on public.parttime_schedule_change_requests;
create trigger prevent_duplicate_pending_parttime_change_request
  before insert on public.parttime_schedule_change_requests
  for each row
  execute function public.prevent_duplicate_pending_parttime_change_request();
