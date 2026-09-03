PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS job_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games (
  app_id INTEGER NOT NULL, country TEXT NOT NULL, data TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (app_id, country)
);
CREATE INDEX IF NOT EXISTS games_observed ON games(observed_at);
CREATE TABLE IF NOT EXISTS deal_state (
  destination TEXT NOT NULL, country TEXT NOT NULL, app_id INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY(destination, country, app_id)
);
CREATE TABLE IF NOT EXISTS releases (
  key TEXT PRIMARY KEY, destination TEXT NOT NULL, country TEXT NOT NULL, app_id INTEGER NOT NULL,
  release_date TEXT NOT NULL, config_key TEXT NOT NULL, data TEXT,
  announced INTEGER NOT NULL DEFAULT 0, baseline INTEGER NOT NULL DEFAULT 0,
  digest_key TEXT, observed_at INTEGER NOT NULL,
  UNIQUE(destination, country, app_id)
);
CREATE INDEX IF NOT EXISTS deals_active ON deal_state(destination,country,json_extract(data,'$.active'),app_id);
CREATE INDEX IF NOT EXISTS releases_eligible ON releases(destination, country, announced, baseline, config_key, release_date DESC);
CREATE INDEX IF NOT EXISTS releases_digest ON releases(digest_key);
CREATE INDEX IF NOT EXISTS releases_observed ON releases(observed_at);
CREATE TABLE IF NOT EXISTS outbox (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('deal', 'release')),
  destination TEXT NOT NULL, country TEXT NOT NULL, day TEXT NOT NULL,
  app_id INTEGER, period INTEGER, amount INTEGER, currency TEXT, scale INTEGER,
  payload TEXT, games TEXT NOT NULL, config_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','retry','uncertain','expired','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, message_id TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox(destination, country, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS outbox_game_pending ON outbox(destination,country,kind,app_id,period,status);
CREATE INDEX IF NOT EXISTS outbox_quota ON outbox(destination, country, kind, day, status);
CREATE INDEX IF NOT EXISTS outbox_expiry ON outbox(status, expires_at);
CREATE INDEX IF NOT EXISTS outbox_retention ON outbox(status, updated_at);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, at INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS runs_at ON runs(at);

-- Una confirmación manual por una única sentencia conserva los mismos invariantes
-- que la transacción de entrega. No requiere un endpoint de administración.
CREATE TRIGGER IF NOT EXISTS outbox_confirmed AFTER UPDATE OF status ON outbox
WHEN NEW.status='sent' AND OLD.status<>'sent'
BEGIN
  UPDATE deal_state SET data=json_set(data,
    '$.lastAmount',NEW.amount,'$.lastNotifiedAt',NEW.updated_at,
    '$.lastCurrency',NEW.currency,'$.lastScale',NEW.scale)
  WHERE NEW.kind='deal' AND destination=NEW.destination AND country=NEW.country
    AND app_id=NEW.app_id AND json_extract(data,'$.period')=NEW.period;
  UPDATE releases SET announced=1 WHERE NEW.kind='release' AND digest_key=NEW.key;
  UPDATE job_state SET value=json_set(value,'$.digestDay',NEW.day),updated_at=NEW.updated_at
  WHERE key='main' AND NEW.kind='release' AND (json_extract(value,'$.digestDay') IS NULL OR json_extract(value,'$.digestDay')<NEW.day);
  UPDATE job_state SET value=json_set(value,'$.dealDigestDay',NEW.day),updated_at=NEW.updated_at
  WHERE key='main' AND NEW.kind='deal' AND NEW.app_id IS NULL
    AND (json_extract(value,'$.dealDigestDay') IS NULL OR json_extract(value,'$.dealDigestDay')<NEW.day);
END;
CREATE TRIGGER IF NOT EXISTS outbox_not_delivered AFTER UPDATE OF status ON outbox
WHEN NEW.status IN ('expired','failed') AND NEW.kind='release'
BEGIN
  UPDATE releases SET digest_key=NULL WHERE digest_key=NEW.key AND announced=0;
END;
