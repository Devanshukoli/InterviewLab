-- User-owned, encrypted API keys per provider
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
  encrypted_key TEXT NOT NULL,
  key_last_four TEXT NOT NULL,
  preferred_model TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_provider ON user_api_keys (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_valid ON user_api_keys (user_id, is_valid);

-- Enable RLS
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own API keys"
  ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Legacy cleanup from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS gemini_api_key;
ALTER TABLE profiles DROP COLUMN IF EXISTS openai_api_key;
ALTER TABLE profiles DROP COLUMN IF EXISTS anthropic_api_key;
