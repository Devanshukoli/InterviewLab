-- ====================================================================
-- InterviewLab - Seed Data
-- Run this script in Supabase SQL Editor to seed initial demo data
-- ====================================================================

-- 1. Seed Principal Architect Demo User Profile
INSERT INTO public.profiles (id, email, password_hash, name, role)
VALUES (
    'a1b2c3d4-0000-0000-0000-000000000001',
    'architect@InterviewLab.io',
    '$2b$10$abcdefghijklmnopqrstuv',
    'Principal SRE Architect',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- 2. Seed Prompt Versions for Agent Orchestration
INSERT INTO public.prompt_versions (agent_name, version, template, is_active)
VALUES
('resume-agent', '1.2.0', 'Extract key experience, technologies, and career progression from applicant resume.', true),
('jd-agent', '1.0.4', 'Parse the job description and extract critical skill requirements and responsibilities.', true),
('gap-agent', '2.1.0', 'Compare candidate profile against job description and identify matching skills and skill gaps.', true),
('question-generator', '3.0.0', 'Generate tailored technical and behavioral questions targeted at candidate weakness areas.', true)
ON CONFLICT (agent_name, version) DO NOTHING;

-- 3. Seed Subscription & Billing History
INSERT INTO public.user_subscriptions (id, user_id, plan, status)
VALUES (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'a1b2c3d4-0000-0000-0000-000000000001',
    'pro',
    'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_history (user_id, amount, currency, status, description, receipt_number)
VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 29.00, 'usd', 'paid', 'InterviewLab Pro Monthly Subscription', 'INV-2026-001'),
('a1b2c3d4-0000-0000-0000-000000000001', 29.00, 'usd', 'paid', 'InterviewLab Pro Monthly Subscription', 'INV-2026-002')
ON CONFLICT DO NOTHING;

-- 4. Seed User Logins History
INSERT INTO public.user_logins (user_id, ip_address, user_agent, login_provider)
VALUES
('a1b2c3d4-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'email'),
('a1b2c3d4-0000-0000-0000-000000000001', '192.168.1.50', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'email')
ON CONFLICT DO NOTHING;

-- 5. Seed Sample Resume & Job Description
INSERT INTO public.resumes (id, user_id, title, raw_text, file_type, skills, experience_years)
VALUES (
    'c1b2c3d4-0000-0000-0000-000000000001',
    'a1b2c3d4-0000-0000-0000-000000000001',
    'Senior_Backend_Engineer_Resume.pdf',
    'Experienced Backend Engineer specializing in Distributed Systems, Node.js, TypeScript, PostgreSQL, and Cloud Native Architectures.',
    'pdf',
    ARRAY['Node.js', 'TypeScript', 'PostgreSQL', 'Distributed Systems', 'Docker', 'Kubernetes'],
    6
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.job_descriptions (id, user_id, title, company, raw_text, requirements)
VALUES (
    'd1b2c3d4-0000-0000-0000-000000000001',
    'a1b2c3d4-0000-0000-0000-000000000001',
    'Staff Distributed Systems Engineer',
    'CloudScale Systems',
    'Looking for a Staff Engineer to lead distributed storage architectures, high-throughput microservices, and observable infrastructure.',
    ARRAY['Distributed Systems', 'TypeScript', 'PostgreSQL / Supabase', 'Observability (OpenTelemetry)']
) ON CONFLICT (id) DO NOTHING;

-- 6. Seed Learning Progress Status
INSERT INTO public.learning_progress (user_id, topic, confidence_score, session_count)
VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 'Distributed Systems & Consensus', 85, 4),
('a1b2c3d4-0000-0000-0000-000000000001', 'PostgreSQL Indexing & Partitioning', 92, 5),
('a1b2c3d4-0000-0000-0000-000000000001', 'System Design & Tradeoffs', 78, 3),
('a1b2c3d4-0000-0000-0000-000000000001', 'Behavioral Leadership & STAR Technique', 88, 2)
ON CONFLICT (user_id, topic) DO UPDATE SET confidence_score = EXCLUDED.confidence_score;
