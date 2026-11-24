CREATE TABLE IF NOT EXISTS receipt_ai_jobs (
    subject text,
    request_id text,
    revision bigint,
    payload text,
    PRIMARY KEY ((subject, request_id))
);

CREATE TABLE IF NOT EXISTS receipt_ai_pending (
    shard int,
    subject text,
    request_id text,
    details text,
    body blob,
    PRIMARY KEY (shard, subject, request_id)
);

CREATE TABLE IF NOT EXISTS receipt_ai_result_expiry (
    shard int,
    expires_at timestamp,
    subject text,
    request_id text,
    PRIMARY KEY (shard, expires_at, subject, request_id)
);
