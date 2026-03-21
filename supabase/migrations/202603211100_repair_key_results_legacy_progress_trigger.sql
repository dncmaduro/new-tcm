-- Some environments still have legacy triggers on public.key_results
-- that reference NEW.progress / OLD.progress.
-- The current schema does not have a progress column on key_results,
-- so inserts fail with:
--   record "new" has no field "progress"
--
-- Key result progress is now derived from linked tasks or current/target values
-- in app logic, so these legacy triggers are no longer compatible.

do $$
declare
  trigger_row record;
  function_def text;
begin
  for trigger_row in
    select
      table_ns.nspname as table_schema,
      table_rel.relname as table_name,
      trigger_def.tgname as trigger_name,
      function_ns.nspname as function_schema,
      function_proc.proname as function_name,
      pg_get_functiondef(function_proc.oid) as function_def
    from pg_trigger trigger_def
    join pg_class table_rel
      on table_rel.oid = trigger_def.tgrelid
    join pg_namespace table_ns
      on table_ns.oid = table_rel.relnamespace
    join pg_proc function_proc
      on function_proc.oid = trigger_def.tgfoid
    join pg_namespace function_ns
      on function_ns.oid = function_proc.pronamespace
    where not trigger_def.tgisinternal
      and table_ns.nspname = 'public'
      and table_rel.relname = 'key_results'
  loop
    function_def := coalesce(trigger_row.function_def, '');

    if function_def ilike '%new.progress%' or function_def ilike '%old.progress%' then
      execute format(
        'drop trigger if exists %I on %I.%I',
        trigger_row.trigger_name,
        trigger_row.table_schema,
        trigger_row.table_name
      );
    end if;
  end loop;
end
$$;
