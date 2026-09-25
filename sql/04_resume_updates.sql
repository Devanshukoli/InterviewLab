-- ====================================================================
-- InterviewLab - Migration Script: Resume Library File Uploads & Edits
-- Run this script directly in your Supabase SQL Editor
-- ====================================================================

-- 1. Add file metadata columns and updated_at timestamp to public.resumes
ALTER TABLE public.resumes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 2. Automatic updated_at trigger for public.resumes
CREATE OR REPLACE FUNCTION update_resumes_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_resumes_updated_at ON public.resumes;
CREATE TRIGGER trigger_resumes_updated_at
BEFORE UPDATE ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION update_resumes_updated_at_column();

-- 3. Enable Supabase Storage Bucket for Resumes (Optional)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;
