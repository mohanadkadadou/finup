ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Single-use, expiring tokens for password reset and email verification. Only a SHA-256 hash is stored.
CREATE TABLE user_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_tokens_user_idx ON user_tokens(user_id, purpose);
