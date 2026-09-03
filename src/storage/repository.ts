import type { Config } from '../config.ts';
import type { Budget } from '../budget.ts';
import type { DealState, Delivery, Game, Job, RunStats } from '../types.ts';
import { DAY } from '../domain/time.ts';
import { releaseKey } from '../domain/releases.ts';
import type { SendResult } from '../notifications/discord.ts';
export interface SqlResult<T = Record<string, unknown>> { results: T[]; success: boolean; meta: { changes?: number; rows_read?: number; rows_written?: number } }
export interface Statement { bind(...values: unknown[]): Statement; all<T = Record<string, unknown>>(): Promise<SqlResult<T>>; run(): Promise<SqlResult> }
export interface Database { prepare(sql: string): Statement; batch<T = Record<string, unknown>>(statements: Statement[]): Promise<SqlResult<T>[]> }
type Row = Record<string, unknown>;
const counted = "('pending','retry','sending','sent','uncertain')";
export function newJob(key: string): Job {
  return { configKey: key, dealCursor: { offset: 0, pending: [], end: false }, releaseCursor: { offset: 0, pending: [], end: false }, dealBaseline: false, releaseBaseline: false,
    dealDigestDay: null, releaseNextAt: 0, digestDay: null, sourceFailures: 0, sourcePaused: false, sourceNextAt: 0, lastSourceSuccess: null, deliveryPaused: false, discordNextAt: 0, watchAfter: 0 };
}
function delivery(row: Row): Delivery {
  return { key: String(row.key), kind: row.kind as Delivery['kind'], destination: String(row.destination), country: String(row.country), day: String(row.day), appId: row.app_id as number | null,
    period: row.period as number | null, amount: row.amount as number | null, currency: row.currency as string | null, scale: row.scale as number | null, payload: row.payload ? JSON.parse(String(row.payload)) : null,
    games: JSON.parse(String(row.games)), configKey: String(row.config_key), status: row.status as Delivery['status'], attempts: Number(row.attempts), createdAt: Number(row.created_at),
    nextAttemptAt: Number(row.next_attempt_at), expiresAt: Number(row.expires_at), messageId: row.message_id as string | null, error: row.error as string | null };
}
export class Repository {
  db: Database; budget: Budget; owner: string; clock: () => number;
  constructor(db: Database, budget: Budget, owner: string = crypto.randomUUID(), clock = Date.now) { this.db = db; this.budget = budget; this.owner = owner; this.clock = clock; }
  stmt(sql: string, ...args: unknown[]): Statement { return this.db.prepare(sql).bind(...args); }
  private metrics(results: SqlResult[]): void {
    for (const r of results) { if (!r.success) throw new Error('D1_FAILURE'); this.budget.rowsRead += r.meta.rows_read ?? 0; this.budget.rowsWritten += r.meta.rows_written ?? 0; }
  }
  async batch(statements: Statement[]): Promise<SqlResult[]> {
    if (!statements.length) return [];
    this.budget.take(); const results = await this.db.batch(statements); this.metrics(results); return results;
  }
  async query(sql: string, ...args: unknown[]): Promise<Row[]> {
    this.budget.take(); const result = await this.stmt(sql, ...args).all(); this.metrics([result]); return result.results;
  }
  async acquire(): Promise<boolean> {
    const now = this.clock();
    const rows = await this.query("INSERT INTO leases(name,owner,expires_at) VALUES('cron',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=? RETURNING owner", this.owner, now + 10 * 60_000, now);
    return rows[0]?.owner === this.owner;
  }
  async unlock(): Promise<void> { await this.query("DELETE FROM leases WHERE name='cron' AND owner=? RETURNING owner", this.owner); }
  async loadJob(): Promise<Job | null> { const r = await this.query("SELECT value FROM job_state WHERE key='main'"); return r[0] ? JSON.parse(String(r[0].value)) : null; }
  jobStatement(job: Job): Statement { return this.stmt("INSERT INTO job_state(key,value,updated_at) VALUES('main',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", JSON.stringify(job), this.clock()); }
  async saveJob(job: Job): Promise<void> { await this.batch([this.jobStatement(job)]); }
  async recover(configKey: string, now: number): Promise<void> {
    await this.batch([
      this.stmt("UPDATE outbox SET status='uncertain',error='ABANDONED_SENDING',updated_at=? WHERE status='sending'", now),
      this.stmt("UPDATE outbox SET status='expired',error='EXPIRED_OR_CONFIG_CHANGED',updated_at=? WHERE status IN ('pending','retry') AND (expires_at<=? OR config_key<>?)", now, now, configKey),
      this.stmt("UPDATE releases SET digest_key=NULL WHERE announced=0 AND digest_key IN (SELECT key FROM outbox WHERE status IN ('expired','failed'))")
    ]);
  }
  async due(c: Config, now: number): Promise<Delivery[]> {
    return (await this.query("SELECT * FROM outbox WHERE destination=? AND country=? AND status IN ('pending','retry') AND next_attempt_at<=? AND expires_at>? ORDER BY created_at,key LIMIT 6", c.destinationId, c.country, now, now)).map(delivery);
  }
  async dealStates(c: Config, ids: number[]): Promise<Map<number, DealState>> {
    if (!ids.length) return new Map();
    const rows = await this.query(`SELECT app_id,data FROM deal_state WHERE destination=? AND country=? AND app_id IN (${ids.map(() => '?').join(',')})`, c.destinationId, c.country, ...ids);
    return new Map(rows.map(r => [Number(r.app_id), JSON.parse(String(r.data))]));
  }
  async recentlySentDealIds(c: Config, since: number): Promise<Set<number>> {
    const rows = await this.query(`SELECT DISTINCT CAST(json_extract(item.value,'$.appId') AS INTEGER) AS app_id
      FROM outbox, json_each(outbox.games) AS item
      WHERE destination=? AND country=? AND kind='deal' AND status='sent' AND updated_at>?`, c.destinationId, c.country, since);
    return new Set(rows.map(r => Number(r.app_id)).filter(Number.isSafeInteger));
  }
  async watchIds(c: Config, after: number, limit: number): Promise<number[]> {
    return (await this.query("SELECT app_id FROM deal_state WHERE destination=? AND country=? AND json_extract(data,'$.active')=1 AND app_id>? ORDER BY app_id LIMIT ?", c.destinationId, c.country, after, limit)).map(r => Number(r.app_id));
  }
  async saveObservations(c: Config, games: Game[], states: DealState[], releases: { game: Game; baseline: boolean }[], job: Job): Promise<void> {
    const statements: Statement[] = games.map(g => this.stmt('INSERT INTO games(app_id,country,data,observed_at) VALUES(?,?,?,?) ON CONFLICT(app_id,country) DO UPDATE SET data=excluded.data,observed_at=excluded.observed_at', g.appId, g.country, JSON.stringify(g), g.observedAt));
    for (const s of states) statements.push(this.stmt('INSERT INTO deal_state(destination,country,app_id,data) VALUES(?,?,?,?) ON CONFLICT(destination,country,app_id) DO UPDATE SET data=excluded.data', c.destinationId, c.country, s.appId, JSON.stringify(s)));
    for (const { game: g, baseline } of releases) statements.push(this.stmt(`INSERT INTO releases(key,destination,country,app_id,release_date,config_key,data,baseline,observed_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET release_date=excluded.release_date,config_key=excluded.config_key,data=excluded.data,baseline=MAX(releases.baseline,excluded.baseline),observed_at=excluded.observed_at`, releaseKey(c.destinationId, c.country, g.appId), c.destinationId, c.country, g.appId, g.releaseDate, job.configKey, JSON.stringify(g), baseline ? 1 : 0, g.observedAt));
    statements.push(this.jobStatement(job)); await this.batch(statements);
  }
  async releaseCandidates(c: Config, key: string, minDay: string, day: string): Promise<{ games: Game[]; total: number }> {
    const rows = await this.query(`SELECT data,COUNT(*) OVER() AS total FROM releases WHERE destination=? AND country=? AND announced=0 AND baseline=0 AND config_key=? AND digest_key IS NULL AND release_date BETWEEN ? AND ? AND data IS NOT NULL ORDER BY release_date DESC,app_id LIMIT ?`, c.destinationId, c.country, key, minDay, day, c.releases.maxItems);
    return { games: rows.map(r => JSON.parse(String(r.data))), total: Number(rows[0]?.total ?? 0) };
  }
  async reserve(items: Delivery[], c: Config): Promise<Delivery[]> {
    const statements: Statement[] = [];
    for (const d of items) {
      statements.push(this.stmt(`INSERT INTO outbox(key,kind,destination,country,day,app_id,period,amount,currency,scale,payload,games,config_key,status,attempts,created_at,updated_at,next_attempt_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0,?,?,?,? WHERE (?='release' OR (SELECT COUNT(*) FROM outbox WHERE destination=? AND country=? AND kind='deal' AND day=? AND status IN ${counted})<?)
        AND (?='release' OR NOT EXISTS(SELECT 1 FROM outbox WHERE destination=? AND country=? AND kind='deal' AND app_id=? AND period=? AND status IN ('pending','retry','sending','uncertain')))
        AND EXISTS(SELECT 1 FROM leases WHERE name='cron' AND owner=? AND expires_at>?) ON CONFLICT(key) DO NOTHING RETURNING *`,
        d.key, d.kind, d.destination, d.country, d.day, d.appId, d.period, d.amount, d.currency, d.scale, JSON.stringify(d.payload), JSON.stringify(d.games), d.configKey, d.createdAt, d.createdAt, d.nextAttemptAt, d.expiresAt,
        d.kind, c.destinationId, c.country, d.day, c.deals.perDay, d.kind, d.destination, d.country, d.appId, d.period, this.owner, this.clock()));
      if (d.kind === 'release') for (const g of d.games) statements.push(this.stmt("UPDATE releases SET digest_key=? WHERE key=? AND announced=0 AND digest_key IS NULL AND EXISTS(SELECT 1 FROM outbox WHERE key=? AND status='pending')", d.key, releaseKey(c.destinationId, c.country, g.appId), d.key));
    }
    const results = await this.batch(statements);
    return results.flatMap(r => r.results.filter(v => 'kind' in v).map(delivery));
  }
  async claim(d: Delivery, c: Config, day: string): Promise<boolean> {
    const now = this.clock();
    const r = await this.query(`UPDATE outbox SET status='sending',attempts=attempts+1,day=?,updated_at=? WHERE key=? AND status IN ('pending','retry') AND next_attempt_at<=? AND expires_at>?
      AND (kind='release' OR (SELECT COUNT(*) FROM outbox WHERE destination=? AND country=? AND kind='deal' AND day=? AND key<>? AND status IN ${counted})<?)
      AND EXISTS(SELECT 1 FROM leases WHERE name='cron' AND owner=? AND expires_at>?) RETURNING key`, day, now, d.key, now, now, c.destinationId, c.country, day, d.key, c.deals.perDay, this.owner, now + 15_000);
    return r.length === 1;
  }
  async finish(d: Delivery, result: SendResult, job: Job): Promise<void> {
    const now = this.clock();
    const status = result.status === 'retry' && d.attempts + 1 >= 3 ? 'failed' : result.status;
    const statements = [this.stmt("UPDATE outbox SET status=?,message_id=?,error=?,next_attempt_at=?,updated_at=? WHERE key=? AND status='sending'", status, result.status === 'sent' ? result.messageId : null, result.status === 'sent' ? null : result.error,
      result.status === 'retry' ? Math.max(result.retryAt, now + 30 * 60_000 * 2 ** d.attempts) : now, now, d.key)];
    if (result.status === 'sent') {
      if (d.kind === 'deal') {
        for (const g of d.games) statements.push(this.stmt(`UPDATE deal_state SET data=json_set(data,'$.lastAmount',?,'$.lastNotifiedAt',?,'$.lastCurrency',?,'$.lastScale',?) WHERE destination=? AND country=? AND app_id=?`, g.currentAmount, now, g.currency, g.amountScale, d.destination, d.country, g.appId));
        if (d.appId === null) job.dealDigestDay = d.day;
      }
      else { statements.push(this.stmt('UPDATE releases SET announced=1 WHERE digest_key=?', d.key)); job.digestDay = d.day; }
    }
    if ('pause' in result && result.pause) job.deliveryPaused = true;
    if (result.status === 'retry') job.discordNextAt = result.retryAt;
    statements.push(this.jobStatement(job)); await this.batch(statements);
  }
  async expire(d: Delivery, reason: string): Promise<void> { await this.query("UPDATE outbox SET status='expired',error=?,updated_at=? WHERE key=? AND status IN ('pending','retry') RETURNING key", reason, this.clock(), d.key); }
  async defer(d: Delivery, now: number): Promise<void> { await this.query("UPDATE outbox SET status=CASE WHEN attempts+1>=3 THEN 'failed' ELSE 'retry' END,attempts=attempts+1,next_attempt_at=?,updated_at=?,error='REVALIDATION_FAILED' WHERE key=? AND status IN ('pending','retry') RETURNING key", now + 30 * 60_000 * 2 ** d.attempts, now, d.key); }
  async recordRun(stats: RunStats): Promise<void> { await this.batch([this.stmt('INSERT INTO runs(id,at,status,data) VALUES(?,?,?,?)', stats.id, stats.at, stats.status, JSON.stringify(stats))]); }
  async retain(now: number): Promise<void> {
    // Lotes limitados: el mantenimiento nunca borra claves de idempotencia ni precios anunciados.
    await this.batch([
      this.stmt('DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE at<? LIMIT 100)', now - 30 * DAY),
      this.stmt("UPDATE outbox SET payload=NULL,games='[]' WHERE key IN (SELECT key FROM outbox WHERE status IN ('sent','expired','failed') AND updated_at<? AND payload IS NOT NULL LIMIT 100)", now - 30 * DAY),
      this.stmt('DELETE FROM games WHERE (app_id,country) IN (SELECT app_id,country FROM games WHERE observed_at<? LIMIT 100)', now - 90 * DAY),
      this.stmt('UPDATE releases SET data=NULL WHERE key IN (SELECT key FROM releases WHERE observed_at<? AND data IS NOT NULL LIMIT 100)', now - 90 * DAY)
    ]);
  }
  async resolveUncertain(key: string, resolution: 'sent' | 'not_sent', messageId: string | null = null): Promise<boolean> {
    if (resolution === 'sent' && (!messageId || !/^\d{17,22}$/.test(messageId))) throw new Error('MESSAGE_ID_REQUIRED');
    if (!await this.acquire()) throw new Error('LEASE_BUSY');
    try {
      const rows = await this.query("SELECT * FROM outbox WHERE key=? AND status='uncertain'", key);
      if (!rows[0]) return false;
      const d = delivery(rows[0]); const now = this.clock(); const job = await this.loadJob();
      const statements = [this.stmt("UPDATE outbox SET status=?,message_id=?,error=?,updated_at=? WHERE key=? AND status='uncertain'", resolution === 'sent' ? 'sent' : 'failed', messageId, resolution === 'sent' ? 'MANUAL_CONFIRMED' : 'MANUAL_NOT_SENT', now, key)];
      if (resolution === 'sent') {
        if (d.kind === 'deal') {
          for (const g of d.games) statements.push(this.stmt("UPDATE deal_state SET data=json_set(data,'$.lastAmount',?,'$.lastNotifiedAt',?,'$.lastCurrency',?,'$.lastScale',?) WHERE destination=? AND country=? AND app_id=?", g.currentAmount, now, g.currency, g.amountScale, d.destination, d.country, g.appId));
          if (d.appId === null && job) job.dealDigestDay = d.day;
        }
        else { statements.push(this.stmt('UPDATE releases SET announced=1 WHERE digest_key=?', key)); if (job && (!job.digestDay || job.digestDay < d.day)) job.digestDay = d.day; }
      } else if (d.kind === 'release') statements.push(this.stmt('UPDATE releases SET digest_key=NULL WHERE digest_key=? AND announced=0', key));
      if (job) statements.push(this.jobStatement(job));
      await this.batch(statements); return true;
    } finally { await this.unlock(); }
  }
}
