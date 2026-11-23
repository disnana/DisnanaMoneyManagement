CREATE TABLE IF NOT EXISTS shop_order_owners (
    id text PRIMARY KEY,
    subject text,
    created_at bigint
);

CREATE TABLE IF NOT EXISTS shop_orders (
    subject text,
    created_at bigint,
    id text,
    revision bigint,
    payload text,
    PRIMARY KEY (subject, created_at, id)
) WITH CLUSTERING ORDER BY (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS shop_oauth_attempts (
    id text PRIMARY KEY,
    verifier text,
    nonce text,
    claim_id text
) WITH default_time_to_live = 600;

CREATE TABLE IF NOT EXISTS shop_sessions (
    id text PRIMARY KEY,
    subject text
) WITH default_time_to_live = 28800;

CREATE TABLE IF NOT EXISTS shop_rate_windows (
    id text PRIMARY KEY,
    hits int
) WITH default_time_to_live = 180;

CREATE TABLE IF NOT EXISTS shop_stripe_events (
    id text PRIMARY KEY,
    received_at timestamp
) WITH default_time_to_live = 2592000;
