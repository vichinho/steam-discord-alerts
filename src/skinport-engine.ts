import type { Config } from './config.ts';
import type { Budget } from './budget.ts';
import type { Database, SqlResult, Statement } from './storage/repository.ts';
import type { DiscordPayload, RustItem } from './types.ts';
import type { SendResult } from './notifications/discord.ts';
import { skinportDigestMessage } from './notifications/discord.ts';
import { rustItemRejection } from './domain/rust-items.ts';
import { localTime } from './domain/time.ts';
import { SkinportProvider } from './providers/skinport.ts';
import { SourceError } from './providers/http.ts';

interface State { lastScanDay: string | null; failures: number; paused: boolean; nextAt: number; lastSuccess: number | null; lastError?: string | null }
interface Row { key: string; day: string; payload: string; items: string; status: string; attempts: number; created_at: number; next_attempt_at: number; expires_at: number }
export interface SkinportStats { kind: 'skinport'; at: number; status: string; scanned: number; eligible: number; sent: number; failed: number; responseBytes: number; messageId?: string }
const counted = "('pending','retry','sending','sent','uncertain')";

export async function runSkinport(options: { config: Config; db: Database; budget: Budget; send: (payload: DiscordPayload) => Promise<SendResult>; now?: () => number; provider?: SkinportProvider }): Promise<SkinportStats> {
  const c = options.config, rules = c.rustItems.communityMarket, clock = options.now ?? Date.now, now = clock();
  const stats: SkinportStats = { kind: 'skinport', at: now, status: 'not_due', scanned: 0, eligible: 0, sent: 0, failed: 0, responseBytes: 0 };
  if (!rules.enabled || !rules.accessReviewed || !rules.coverageAccepted) return stats;
  const metrics = (results: SqlResult[]) => { for (const r of results) { if (!r.success) throw new Error('D1_FAILURE'); options.budget.rowsRead += r.meta.rows_read ?? 0; options.budget.rowsWritten += r.meta.rows_written ?? 0; } };
  const query = async (sql: string, ...args: unknown[]) => { options.budget.take(); const r = await cdb(sql, ...args).all<Record<string, unknown>>(); metrics([r]); return r.results; };
  const batch = async (statements: Statement[]) => { options.budget.take(); const r = await options.db.batch(statements); metrics(r); return r; };
  const cdb = (sql: string, ...args: unknown[]) => options.db.prepare(sql).bind(...args);
  const owner = crypto.randomUUID();
  const acquired = await query("INSERT INTO leases(name,owner,expires_at) VALUES('skinport',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=? RETURNING owner", owner, now + 10 * 60_000, now);
  if (acquired[0]?.owner !== owner) { stats.status = 'locked'; return stats; }
  try {
    const stateRow = await query("SELECT value FROM job_state WHERE key='skinport'");
    const state: State = stateRow[0] ? JSON.parse(String(stateRow[0].value)) : { lastScanDay: null, failures: 0, paused: false, nextAt: 0, lastSuccess: null, lastError: null };
    if (state.paused || state.nextAt > now) { stats.status = state.paused ? 'paused' : 'deferred'; return stats; }
    const local = localTime(now, c.timezone);
    let delivery = (await query("SELECT * FROM skinport_outbox WHERE status IN ('pending','retry') AND next_attempt_at<=? AND expires_at>? ORDER BY created_at LIMIT 1", now, now))[0] as unknown as Row | undefined;
    if (!delivery && local.time >= rules.digestAt && state.lastScanDay !== local.day) {
      try {
        const provider = options.provider ?? new SkinportProvider(c, options.budget);
        const found = await provider.opportunities(now); stats.scanned = found.length;
        const eligible = found.filter(item => rustItemRejection(item, c) === null); stats.eligible = eligible.length;
        const selected = eligible.slice(0, rules.perRun);
        state.lastScanDay = local.day; state.failures = 0; state.nextAt = 0; state.lastSuccess = now; state.lastError = null;
        const stateJson = JSON.stringify(state);
        if (rules.cloudValidated && c.sendEnabled && selected.length) {
          const key = `skinport-digest:${c.destinationId}:${local.day}`;
          const payload = skinportDigestMessage(selected, local.day, c);
          const result = await batch([
            cdb(`INSERT INTO skinport_outbox(key,day,payload,items,status,attempts,created_at,updated_at,next_attempt_at,expires_at)
              SELECT ?,?,?,?,'pending',0,?,?,?,? WHERE (SELECT COUNT(*) FROM skinport_outbox WHERE day=? AND status IN ${counted})<? ON CONFLICT(key) DO NOTHING RETURNING *`,
              key, local.day, JSON.stringify(payload), JSON.stringify(selected), now, now, now, now + 2 * 60 * 60_000, local.day, rules.perDay),
            cdb("INSERT INTO job_state(key,value,updated_at) VALUES('skinport',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", stateJson, now)
          ]);
          delivery = result[0]!.results[0] as unknown as Row | undefined;
        } else {
          await batch([cdb("INSERT INTO job_state(key,value,updated_at) VALUES('skinport',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", stateJson, now)]);
          stats.status = rules.cloudValidated ? 'no_matches' : 'validated_no_send';
        }
      } catch (error) {
        const code = error instanceof SourceError ? error.code : error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'SOURCE_ERROR';
        state.failures++; state.nextAt = error instanceof SourceError && error.retryAt !== null ? error.retryAt : now + 30 * 60_000 * 2 ** Math.min(state.failures - 1, 4); state.paused = state.failures >= 3; state.lastError = code;
        await batch([cdb("INSERT INTO job_state(key,value,updated_at) VALUES('skinport',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", JSON.stringify(state), now)]);
        stats.status = code; stats.failed++; return stats;
      }
    }
    if (delivery && rules.cloudValidated && c.sendEnabled) {
      const claimed = await query("UPDATE skinport_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE key=? AND status IN ('pending','retry') AND next_attempt_at<=? AND expires_at>? AND EXISTS(SELECT 1 FROM leases WHERE name='skinport' AND owner=? AND expires_at>?) RETURNING *", now, delivery.key, now, now, owner, now + 15_000);
      if (claimed.length) {
        const result = await options.send(JSON.parse(delivery.payload));
        const status = result.status === 'retry' && delivery.attempts + 1 >= 3 ? 'failed' : result.status;
        const nextAt = result.status === 'retry' ? Math.max(result.retryAt, now + 30 * 60_000 * 2 ** delivery.attempts) : now;
        const messageId = result.status === 'sent' ? result.messageId : null;
        await query("UPDATE skinport_outbox SET status=?,message_id=?,error=?,next_attempt_at=?,updated_at=? WHERE key=? AND status='sending' RETURNING key", status, messageId, result.status === 'sent' ? null : result.error, nextAt, now, delivery.key);
        if (result.status === 'sent') { stats.sent = 1; stats.messageId = result.messageId; stats.status = 'ok'; }
        else { stats.failed = 1; stats.status = 'delivery_error'; }
      }
    }
    return stats;
  } finally {
    stats.responseBytes = options.budget.responseBytes;
    try { await query("DELETE FROM leases WHERE name='skinport' AND owner=? RETURNING owner", owner); } catch { /* vence solo */ }
  }
}
