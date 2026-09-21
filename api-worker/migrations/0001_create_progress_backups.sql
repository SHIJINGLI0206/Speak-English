CREATE TABLE IF NOT EXISTS progress_backups (
  device_id TEXT PRIMARY KEY NOT NULL,
  secret_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
