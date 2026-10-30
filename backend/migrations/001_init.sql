CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('statement', 'bank', 'demo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX accounts_user_idx ON accounts(user_id);

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'pdf')),
  status TEXT NOT NULL CHECK (status IN ('needs_mapping', 'review', 'committed', 'discarded')),
  -- Parsed source grid (rows of cells) so a column mapping can be re-applied without the file.
  grid JSONB NOT NULL DEFAULT '[]',
  mapping JSONB,
  notes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ
);
CREATE INDEX batches_user_idx ON import_batches(user_id);

CREATE TABLE staged_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_ref INT NOT NULL,
  raw JSONB NOT NULL,
  booked_on DATE,
  description TEXT NOT NULL DEFAULT '',
  amount_minor BIGINT,
  currency CHAR(3),
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  status TEXT NOT NULL CHECK (status IN ('ok', 'flagged', 'duplicate', 'invalid')),
  issues JSONB NOT NULL DEFAULT '[]',
  include BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  dedupe_key TEXT,
  UNIQUE (batch_id, row_ref)
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  booked_on DATE NOT NULL,
  description TEXT NOT NULL,
  -- Signed integer minor units: negative = money out, positive = money in.
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  currency CHAR(3) NOT NULL,
  category TEXT NOT NULL,
  source_ref TEXT,
  dedupe_key TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX tx_user_date_idx ON transactions(user_id, booked_on DESC);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_minor BIGINT NOT NULL CHECK (target_minor > 0),
  current_minor BIGINT NOT NULL DEFAULT 0 CHECK (current_minor >= 0),
  currency CHAR(3) NOT NULL,
  deadline DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_minor BIGINT NOT NULL CHECK (limit_minor > 0),
  currency CHAR(3) NOT NULL,
  UNIQUE (user_id, category, currency)
);

-- Reserved for a real Open Banking provider adapter. Stays empty until one is configured and verified.
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'error')),
  -- Encrypted at the application layer before storage; never returned to clients.
  token_ciphertext TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
