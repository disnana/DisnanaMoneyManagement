CREATE TABLE IF NOT EXISTS credit_wallet_entries (
    subject text,
    entry text,
    revision bigint,
    lots text,
    operation text,
    PRIMARY KEY (subject, entry)
);
