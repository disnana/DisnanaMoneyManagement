CREATE TABLE IF NOT EXISTS users (
  id         BYTEA PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id         BYTEA PRIMARY KEY,
  user_id    BYTEA NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       BYTEA NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id);

-- Only a hash of the bearer token is stored, so a leaked database cannot be replayed.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash BYTEA PRIMARY KEY,
  user_id    BYTEA NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

-- Append-only log of end-to-end encrypted operations. The server never sees plaintext.
CREATE TABLE IF NOT EXISTS ops (
  user_id BYTEA NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts      BIGINT NOT NULL,
  id      TEXT NOT NULL,
  device  TEXT NOT NULL,
  payload BYTEA NOT NULL,
  PRIMARY KEY (user_id, ts, id),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  user_id    BYTEA PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  upto_ts    BIGINT NOT NULL,
  upto_id    TEXT NOT NULL,
  payload    BYTEA NOT NULL,
  updated_at BIGINT NOT NULL
);
