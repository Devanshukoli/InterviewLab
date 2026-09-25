-- ====================================================================
-- InterviewLab - Row Level Security (RLS) & Auth Triggers
-- Run this script in Supabase SQL Editor after 01_schema.sql
-- ====================================================================

-- Enable RLS on all user-facing tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- RLS POLICIES FOR PROFILES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by self and admins" ON public.profiles;
CREATE POLICY "Public profiles are viewable by self and admins"
ON public.profiles FOR SELECT
USING (auth.uid() = auth_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = auth_id OR auth.uid() = id);

-- --------------------------------------------------------------------
-- RLS POLICIES FOR RESUMES & JOB DESCRIPTIONS
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own resumes" ON public.resumes;
CREATE POLICY "Users can view own resumes"
ON public.resumes FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own resumes" ON public.resumes;
CREATE POLICY "Users can insert own resumes"
ON public.resumes FOR INSERT
WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own job descriptions" ON public.job_descriptions;
CREATE POLICY "Users can view own job descriptions"
ON public.job_descriptions FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own job descriptions" ON public.job_descriptions;
CREATE POLICY "Users can insert own job descriptions"
ON public.job_descriptions FOR INSERT
WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

-- --------------------------------------------------------------------
-- RLS POLICIES FOR SESSIONS, QUESTIONS, ANSWERS, EVALUATIONS
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own interview sessions" ON public.interview_sessions;
CREATE POLICY "Users can view own interview sessions"
ON public.interview_sessions FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own interview sessions" ON public.interview_sessions;
CREATE POLICY "Users can manage own interview sessions"
ON public.interview_sessions FOR ALL
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can access questions for their sessions" ON public.generated_questions;
CREATE POLICY "Users can access questions for their sessions"
ON public.generated_questions FOR ALL
USING (session_id IN (SELECT id FROM public.interview_sessions WHERE user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid())));

DROP POLICY IF EXISTS "Users can access answers for their sessions" ON public.answers;
CREATE POLICY "Users can access answers for their sessions"
ON public.answers FOR ALL
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can access evaluations for their sessions" ON public.evaluations;
CREATE POLICY "Users can access evaluations for their sessions"
ON public.evaluations FOR ALL
USING (session_id IN (SELECT id FROM public.interview_sessions WHERE user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid())));

-- --------------------------------------------------------------------
-- RLS POLICIES FOR PROGRESS, BILLING & LOGINS
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own progress" ON public.learning_progress;
CREATE POLICY "Users can view own progress"
ON public.learning_progress FOR ALL
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own billing history" ON public.billing_history;
CREATE POLICY "Users can view own billing history"
ON public.billing_history FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
ON public.user_subscriptions FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own logins" ON public.user_logins;
CREATE POLICY "Users can view own logins"
ON public.user_logins FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE auth_id = auth.uid() OR id = auth.uid()));

-- --------------------------------------------------------------------
-- TRIGGER: AUTO-CREATE PROFILE & FREE SUBSCRIPTION ON SUPABASE AUTH SIGNUP
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, auth_id, email, name, role)
  VALUES (
    new.id,
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'user'
  )
  ON CONFLICT (email) DO UPDATE SET auth_id = new.id;

  INSERT INTO public.user_subscriptions (user_id, plan, status)
  VALUES (new.id, 'free', 'active')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution link on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
