-- Add explicit reason field for time requests.

alter table if exists public.time_requests
add column if not exists reason text;
