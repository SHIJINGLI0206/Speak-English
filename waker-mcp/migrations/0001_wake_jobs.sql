CREATE TABLE IF NOT EXISTS wake_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'packet_sent', 'failed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  updated_at INTEGER NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS wake_jobs_queue_idx ON wake_jobs(status, expires_at, created_at);
CREATE INDEX IF NOT EXISTS wake_jobs_owner_idx ON wake_jobs(owner_id, created_at DESC);
