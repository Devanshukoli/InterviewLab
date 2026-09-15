ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Existing rows keep the column default (false). Assign exactly one primary per user:
-- keep a unique existing primary when present; otherwise the newest valid key.
-- Tie-break: updated_at, then created_at, then id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        is_primary DESC,
        is_valid DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM user_api_keys
)
UPDATE user_api_keys AS k
SET is_primary = (ranked.rn = 1)
FROM ranked
WHERE k.id = ranked.id
  AND k.is_primary IS DISTINCT FROM (ranked.rn = 1);

CREATE UNIQUE INDEX IF NOT EXISTS user_api_keys_one_primary_per_user
  ON user_api_keys (user_id)
  WHERE is_primary;
