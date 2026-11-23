CREATE TABLE IF NOT EXISTS android_account_sessions (
    id text PRIMARY KEY,
    subject text,
    device text,
    device_key text,
    refresh_hash text,
    refresh_expiry timestamp
) WITH default_time_to_live = 1209600;
