-- ====================================================================
-- InterviewOps - Migration Script: Security, 2FA, and Session Management
-- Run this script directly in your Supabase SQL Editor
-- ====================================================================

-- 1. Add 2FA and Security columns to public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS pending_two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS backup_codes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ DEFAULT NOW();

-- 2. Create public.user_sessions table for tracking active logged-in devices/sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    device_type TEXT DEFAULT 'desktop',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- Index for session verification
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);

-- Enable RLS on public.user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_sessions
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can revoke their own sessions" ON public.user_sessions;
CREATE POLICY "Users can revoke their own sessions" ON public.user_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- 3. Create public.security_audit_logs table for compliance tracking
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g. 'PASSWORD_CHANGE', '2FA_ENABLED', '2FA_DISABLED', 'SESSION_REVOKED'
    ip_address TEXT,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for security audit search
CREATE INDEX IF NOT EXISTS idx_security_audit_user_id ON public.security_audit_logs(user_id);

-- Enable RLS on public.security_audit_logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their security audit logs" ON public.security_audit_logs;
CREATE POLICY "Users can view their security audit logs" ON public.security_audit_logs
    FOR SELECT USING (auth.uid() = user_id);
