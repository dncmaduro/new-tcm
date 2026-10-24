-- Keep the owner of an attendance row independent from the current
-- attendance-id link. The link can be disabled or reassigned later, while a
-- historical attendance row must continue to belong to its original profile.

ALTER TABLE public.times
  ADD COLUMN IF NOT EXISTS profile_id uuid;

ALTER TABLE public.times
  DROP CONSTRAINT IF EXISTS times_profile_id_fkey;

ALTER TABLE public.times
  ADD CONSTRAINT times_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS times_profile_id_date_idx
  ON public.times(profile_id, date);

-- Backfill the rows that still have a resolvable owner. Prefer the
-- attendance/device link because it is more specific than profiles.attendance_id.
UPDATE public.times AS t
SET profile_id = (
  SELECT tp.profile_id
  FROM public.times_profiles AS tp
  WHERE tp.profile_id IS NOT NULL
    AND t.attendance_id = tp.attendance_id
    AND t.device_id = tp.device_id
  ORDER BY tp.created_at DESC
  LIMIT 1
)
WHERE t.profile_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.times_profiles AS tp
    WHERE tp.profile_id IS NOT NULL
      AND t.attendance_id = tp.attendance_id
      AND t.device_id = tp.device_id
  );

UPDATE public.times AS t
SET profile_id = (
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.attendance_id IS NOT NULL
    AND t.attendance_id = p.attendance_id
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1
)
WHERE t.profile_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.attendance_id IS NOT NULL
      AND t.attendance_id = p.attendance_id
  );

CREATE OR REPLACE FUNCTION public.assign_times_profile_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Never overwrite an owner already captured on the attendance row. This is
  -- what prevents a later badge/id reassignment from moving old attendance.
  IF NEW.profile_id IS NULL THEN
    SELECT tp.profile_id
    INTO NEW.profile_id
    FROM public.times_profiles AS tp
    WHERE tp.profile_id IS NOT NULL
      AND tp.attendance_id = NEW.attendance_id
      AND tp.device_id = NEW.device_id
    ORDER BY tp.created_at DESC
    LIMIT 1;
  END IF;

  IF NEW.profile_id IS NULL THEN
    SELECT p.id
    INTO NEW.profile_id
    FROM public.profiles AS p
    WHERE p.attendance_id IS NOT NULL
      AND p.attendance_id = NEW.attendance_id
    ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS times_assign_profile_id ON public.times;

CREATE TRIGGER times_assign_profile_id
BEFORE INSERT OR UPDATE OF attendance_id, device_id
ON public.times
FOR EACH ROW
EXECUTE FUNCTION public.assign_times_profile_id();
