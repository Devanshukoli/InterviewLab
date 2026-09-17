ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pending_two_factor_secret TEXT;
