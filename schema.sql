PRAGMA foreign_keys = ON;

-- Cloudflare D1 / SQLite schema. Date-time values are UTC ISO-8601 strings.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  email_verified TEXT,
  image TEXT,
  is_premium INTEGER NOT NULL DEFAULT 0 CHECK (is_premium IN (0, 1)),
  premium_until TEXT,
  guest_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (email IS NOT NULL OR guest_id IS NOT NULL),
  CHECK (password_hash IS NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (provider_id, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  user_name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (is_unlocked IN (0, 1)),
  active_until TEXT,
  unlocked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  status TEXT NOT NULL CHECK (
    status IN (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  stripe_customer_id TEXT,
  price_id TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  current_period_start TEXT,
  current_period_end TEXT,
  canceled_at TEXT,
  stripe_event_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON sessions (expires);
CREATE INDEX IF NOT EXISTS idx_rankings_score_created_at
  ON rankings (score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_rankings_user_id
  ON rankings (user_id);
CREATE INDEX IF NOT EXISTS idx_user_items_user_id
  ON user_items (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON stripe_webhook_events (processed_at);
