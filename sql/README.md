# InterviewLab - Supabase Database Setup & SQL Migration Scripts

This directory contains standalone SQL scripts designed for **Supabase SQL Editor** to set up a complete relational PostgreSQL database schema for **InterviewLab**.

---

## 🗄️ Database Architecture Overview

The database stores all application state:

| Table Name | Description | Key Stored Fields |
| :--- | :--- | :--- |
| `profiles` | User profiles & authentication mapping | `id`, `auth_id`, `email`, `name`, `role` |
| `user_logins` | User login audit history & access logs | `id`, `user_id`, `ip_address`, `login_provider`, `logged_in_at` |
| `user_subscriptions` | Active plans & billing subscription states | `id`, `user_id`, `plan`, `status`, `current_period_end` |
| `billing_history` | Invoice payment records & receipt links | `id`, `user_id`, `amount`, `currency`, `status`, `invoice_url` |
| `resumes` | Uploaded resume candidate profiles | `id`, `user_id`, `title`, `raw_text`, `skills`, `experience_years` |
| `job_descriptions` | Target position job descriptions | `id`, `user_id`, `title`, `company`, `raw_text`, `requirements` |
| `interview_sessions` | Mock interview practice sessions & coaching | `id`, `user_id`, `resume_id`, `job_description_id`, `status`, `coaching_report` |
| `generated_questions` | AI-generated technical & behavioral questions | `id`, `session_id`, `question_text`, `type`, `topic`, `difficulty` |
| `answers` | User responses (text & audio transcripts) | `id`, `question_id`, `session_id`, `answer_text`, `submitted_at` |
| `evaluations` | AI coaching feedback, scores & recommendations | `id`, `question_id`, `score`, `clarity_rating`, `feedback`, `missing_points` |
| `learning_progress` | Skill topic mastery & confidence status | `id`, `user_id`, `topic`, `confidence_score`, `session_count` |
| `prompt_versions` | Agent prompt templates & versioning | `id`, `agent_name`, `version`, `template`, `is_active` |
| `ai_usages` | LLM token consumption & latency telemetry | `id`, `user_id`, `agent_name`, `input_tokens`, `output_tokens`, `latency_ms` |
| `trace_metadata` | OpenTelemetry distributed trace spans | `id`, `trace_id`, `span_id`, `service_name`, `duration_ms` |
| `user_settings` | User API keys & preference configurations | `id`, `user_id`, `gemini_api_key`, `notifications_enabled`, `theme` |

---

## 🚀 Execution Instructions for Supabase SQL Editor

1. **Log in to Supabase Dashboard** and select your project.
2. Go to the **SQL Editor** tab on the left sidebar.
3. Click **New Query**.
4. Paste and run the scripts in the following exact order:

### Step 1: Execute `01_schema.sql`
Creates custom PostgreSQL ENUM types, tables, primary/foreign keys, CASCADE constraints, and performance indexes.

### Step 2: Execute `02_rls_policies.sql`
Enables Row Level Security (RLS) policies for user data isolation and attaches an automatic trigger on `auth.users` to provision user profiles and free subscriptions upon signup.

### Step 3 (Optional): Execute `03_seed_data.sql`
Populates initial demo user (`architect@InterviewLab.io`), active prompt versions, sample resume/JD, learning progress status, and billing invoice history.

---

## 🔑 Environment Setup

In your project `.env` or host platform secrets, set:

```env
SUPABASE_URL="https://<your-project-ref>.supabase.co"
SUPABASE_ANON_KEY="<your-supabase-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<your-supabase-service-role-key>"
```
