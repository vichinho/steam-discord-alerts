DROP TRIGGER IF EXISTS outbox_confirmed;
CREATE TRIGGER outbox_confirmed AFTER UPDATE OF status ON outbox
WHEN NEW.status='sent' AND OLD.status<>'sent'
BEGIN
  UPDATE deal_state SET data=json_set(data,
    '$.lastAmount',NEW.amount,'$.lastNotifiedAt',NEW.updated_at,
    '$.lastCurrency',NEW.currency,'$.lastScale',NEW.scale)
  WHERE NEW.kind='deal' AND NEW.app_id IS NOT NULL
    AND destination=NEW.destination AND country=NEW.country
    AND app_id=NEW.app_id AND json_extract(data,'$.period')=NEW.period;
  UPDATE releases SET announced=1 WHERE NEW.kind='release' AND digest_key=NEW.key;
  UPDATE job_state SET value=json_set(value,'$.digestDay',NEW.day),updated_at=NEW.updated_at
  WHERE key='main' AND NEW.kind='release' AND (json_extract(value,'$.digestDay') IS NULL OR json_extract(value,'$.digestDay')<NEW.day);
  UPDATE job_state SET value=json_set(value,'$.dealDigestDay',NEW.day),updated_at=NEW.updated_at
  WHERE key='main' AND NEW.kind='deal' AND NEW.app_id IS NULL
    AND (json_extract(value,'$.dealDigestDay') IS NULL OR json_extract(value,'$.dealDigestDay')<NEW.day);
END;
