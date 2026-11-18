PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id         BLOB PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id         BLOB PRIMARY KEY,
  user_id    BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id);

-- Only a hash of the bearer token is stored, so a leaked database cannot be replayed.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash BLOB PRIMARY KEY,
  user_id    BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

-- Append-only log of end-to-end encrypted operations. The server never sees plaintext.
CREATE TABLE IF NOT EXISTS ops (
  user_id    BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  id         TEXT NOT NULL,
  device     TEXT NOT NULL,
  payload    BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, seq),
  UNIQUE (user_id, id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS snapshots (
  user_id    BLOB PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  upto_seq   INTEGER NOT NULL,
  payload    BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
