-- Generate weekly performance reports from tasks assigned in the week.
-- Rule:
--   For each assignee, average progress of tasks:
--   - assigned to that user (assignee_id)
--   - created within the target week (Mon 00:00 -> next Mon 00:00, Asia/Ho_Chi_Minh)
-- Then insert one row into public.performance_reports.
-- The function avoids duplicate rows for the same user in the same week window.

create extension if not exists pg_cron with schema extensions;

create or replace function public.generate_weekly_performance_reports(
  p_reference_at timestamptz default now(),
  p_timezone text default 'Asia/Ho_Chi_Minh'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start_local timestamp;
  week_end_local timestamp;
  week_start_utc timestamptz;
  week_end_utc timestamptz;
begin
  -- Previous full week based on local timezone.
  -- Example: run at Monday 00:05 local => summarize the week that just ended.
  week_end_local := date_trunc('week', p_reference_at at time zone p_timezone);
  week_start_local := week_end_local - interval '1 week';
  week_start_utc := week_start_local at time zone p_timezone;
  week_end_utc := week_end_local at time zone p_timezone;

  with weekly as (
    select
      t.assignee_id as user_id,
      round(avg(coalesce(t.progress, 0)::numeric), 2) as completed_percent,
      count(*)::int as tasks
    from public.tasks t
    where t.assignee_id is not null
      and t.created_at >= week_start_utc
      and t.created_at < week_end_utc
    group by t.assignee_id
  )
  insert into public.performance_reports (
    user_id,
    completed_percent,
    tasks,
    created_at,
    updated_at
  )
  select
    w.user_id,
    w.completed_percent,
    w.tasks,
    now(),
    now()
  from weekly w
  where not exists (
    select 1
    from public.performance_reports pr
    where pr.user_id = w.user_id
      and (pr.created_at at time zone p_timezone) >= week_start_local
      and (pr.created_at at time zone p_timezone) < week_end_local
  );
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'weekly_performance_reports'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

-- UTC schedule:
-- 17:05 Sunday UTC = 00:05 Monday Asia/Ho_Chi_Minh (week just ended).
select cron.schedule(
  'weekly_performance_reports',
  '5 17 * * 0',
  $$select public.generate_weekly_performance_reports();$$
);

-- Optional manual run:
-- select public.generate_weekly_performance_reports();
