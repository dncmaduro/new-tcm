-- Demo payroll model. The formula is intentionally kept in application code so
-- it can be replaced when the official payroll policy is available.

CREATE TABLE IF NOT EXISTS public.payroll_compensations (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_base_salary numeric(14, 2) NOT NULL DEFAULT 30000000,
  currency text NOT NULL DEFAULT 'VND',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('bonus', 'penalty')),
  is_fixed boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustment_type_months (
  type_id uuid NOT NULL REFERENCES public.payroll_adjustment_types(id) ON DELETE CASCADE,
  month_number smallint NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (type_id, month_number)
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month date NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_id uuid REFERENCES public.payroll_adjustment_types(id) ON DELETE SET NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bonus', 'penalty')),
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('catalog', 'manual')),
  is_applied boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS payroll_adjustments_month_profile_idx
  ON public.payroll_adjustments(payroll_month, profile_id);

CREATE TABLE IF NOT EXISTS public.payroll_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month date NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  total_salary numeric(14, 2) NOT NULL DEFAULT 0,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS payroll_send_logs_month_profile_idx
  ON public.payroll_send_logs(payroll_month, profile_id, sent_at DESC);

-- Keep a usable demo salary for current profiles. Existing values are never
-- overwritten, so this is safe to run after a real salary has been configured.
INSERT INTO public.payroll_compensations (profile_id, monthly_base_salary)
SELECT id, 30000000
FROM public.profiles
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.payroll_adjustment_types (name, kind, is_fixed, sort_order)
VALUES
  ('Thưởng Quốc khánh', 'bonus', true, 10),
  ('Thưởng Tết', 'bonus', true, 20),
  ('Thưởng hiệu suất', 'bonus', false, 30),
  ('Phạt đi muộn/về sớm', 'penalty', false, 40)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.payroll_adjustment_type_months (type_id, month_number)
SELECT id, 9
FROM public.payroll_adjustment_types
WHERE name = 'Thưởng Quốc khánh'
ON CONFLICT (type_id, month_number) DO NOTHING;

INSERT INTO public.payroll_adjustment_type_months (type_id, month_number)
SELECT id, 1
FROM public.payroll_adjustment_types
WHERE name = 'Thưởng Tết'
ON CONFLICT (type_id, month_number) DO NOTHING;

ALTER TABLE public.payroll_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustment_type_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_send_logs ENABLE ROW LEVEL SECURITY;
