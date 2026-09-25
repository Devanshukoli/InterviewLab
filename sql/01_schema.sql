-- ====================================================================
-- InterviewLab - Supabase Database Schema
-- Run this script in the Supabase SQL Editor to initialize all tables
-- ====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. ENUMS
-- --------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE question_type AS ENUM ('technical', 'behavioral', 'situational', 'background');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('draft', 'in_progress', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE clarity_rating AS ENUM ('poor', 'fair', 'good', 'excellent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- --------------------------------------------------------------------
-- 2. USERS & PROFILES (USER LOGINS / AUTH SYNC)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE, -- Links to auth.users(id) in Supabase
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_id ON public.profiles(auth_id);

-- --------------------------------------------------------------------
-- 3. USER LOGINS / AUDIT HISTORY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_logins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    login_provider TEXT NOT NULL DEFAULT 'email',
    status TEXT NOT NULL DEFAULT 'success',
    logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON public.user_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_logged_in_at ON public.user_logins(logged_in_at DESC);

-- --------------------------------------------------------------------
-- 4. BILLING & SUBSCRIPTIONS HISTORY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan subscription_plan NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS public.billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    status payment_status NOT NULL DEFAULT 'paid',
    description TEXT NOT NULL,
    invoice_url TEXT,
    receipt_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON public.billing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON public.billing_history(created_at DESC);

-- --------------------------------------------------------------------
-- 5. RESUMES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Resume',
    raw_text TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf',
    skills TEXT[] DEFAULT '{}',
    experience_years INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);

-- --------------------------------------------------------------------
-- 6. JOB DESCRIPTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_descriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    requirements TEXT[] DEFAULT '{}',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON public.job_descriptions(user_id);

-- --------------------------------------------------------------------
-- 7. INTERVIEW SESSIONS HISTORY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    resume_title TEXT,
    job_description_id UUID REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
    job_title TEXT,
    status session_status NOT NULL DEFAULT 'draft',
    options JSONB DEFAULT '{}'::jsonb,
    coaching_summary TEXT,
    overall_score INTEGER,
    coaching_report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON public.interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at ON public.interview_sessions(created_at DESC);

-- --------------------------------------------------------------------
-- 8. GENERATED QUESTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    type question_type NOT NULL DEFAULT 'technical',
    topic TEXT NOT NULL,
    difficulty difficulty_level NOT NULL DEFAULT 'medium',
    expected_concepts TEXT[] DEFAULT '{}',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_questions_session_id ON public.generated_questions(session_id);

-- --------------------------------------------------------------------
-- 9. USER ANSWERS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.generated_questions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    audio_url TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_session_id ON public.answers(session_id);

-- --------------------------------------------------------------------
-- 10. EVALUATIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID UNIQUE NOT NULL REFERENCES public.generated_questions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    clarity_rating clarity_rating NOT NULL DEFAULT 'good',
    feedback TEXT NOT NULL,
    missing_points TEXT[] DEFAULT '{}',
    suggested_answer TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_question_id ON public.evaluations(question_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_session_id ON public.evaluations(session_id);

-- --------------------------------------------------------------------
-- 11. LEARNING PROGRESS STATUS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    confidence_score INTEGER NOT NULL DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    session_count INTEGER NOT NULL DEFAULT 1,
    last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_topic UNIQUE (user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_learning_progress_user_id ON public.learning_progress(user_id);

-- --------------------------------------------------------------------
-- 12. PROMPT VERSIONS & AGENT CONFIG
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    version TEXT NOT NULL,
    template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_version UNIQUE (agent_name, version)
);

-- --------------------------------------------------------------------
-- 13. AI USAGE METRICS & OBSERVABILITY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    agent_name TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usages_user_id ON public.ai_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usages_timestamp ON public.ai_usages(timestamp DESC);

CREATE TABLE IF NOT EXISTS public.trace_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    service_name TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    status_code TEXT NOT NULL DEFAULT 'OK',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trace_metadata_trace_id ON public.trace_metadata(trace_id);

-- --------------------------------------------------------------------
-- 14. USER SETTINGS & PREFERENCES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    gemini_api_key TEXT,
    notifications_enabled BOOLEAN DEFAULT true,
    theme TEXT DEFAULT 'light',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
