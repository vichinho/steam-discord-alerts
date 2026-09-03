CREATE TABLE IF NOT EXISTS skinport_outbox (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  items TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','retry','uncertain','expired','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  message_id TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS skinport_outbox_due ON skinport_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS skinport_outbox_retention ON skinport_outbox(status,updated_at);
