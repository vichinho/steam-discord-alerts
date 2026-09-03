import { configKey, type Config } from './config.ts';
import { Budget } from './budget.ts';
import type { Delivery, Game, Job, Provider, RunStats } from './types.ts';
import { Repository, newJob } from './storage/repository.ts';
import { observeDeal, shouldAnnounce, dealKey } from './domain/deals.ts';
import { rejection, sortDeals } from './domain/filters.ts';
import { DAY, HOUR, localTime } from './domain/time.ts';
import { dealDigestMessage, dealMessage, releaseMessage, type SendResult } from './notifications/discord.ts';
import { SourceError } from './providers/http.ts';
export interface EngineOptions {
  config: Config; repository: Repository; provider: Provider; budget: Budget;
  send: (delivery: Delivery) => Promise<SendResult>;
  now?: () => number; log?: (stats: RunStats) => void;
}
function makeDelivery(c: Config, key: string, day: string, config: string, games: Game[], now: number, period: number | null, omitted = 0): Delivery {
  const kind = period === null ? 'release' : 'deal'; const g = games[0]!;
  return { key, kind, destination: c.destinationId, country: c.country, day, appId: kind === 'deal' ? g.appId : null, period,
    amount: kind === 'deal' ? g.currentAmount : null, currency: kind === 'deal' ? g.currency : null, scale: kind === 'deal' ? g.amountScale : null,
    payload: kind === 'deal' ? dealMessage(g, c) : releaseMessage(games, omitted, day, c), games, configKey: config, status: 'pending', attempts: 0,
    createdAt: now, nextAttemptAt: now, expiresAt: now + DAY, messageId: null, error: null };
}
function makeDealDigestDelivery(c: Config, day: string, config: string, games: Game[], now: number, omitted = 0): Delivery {
  return { key: `deal-digest:${c.destinationId}:${c.country}:${day}`, kind: 'deal', destination: c.destinationId, country: c.country, day,
    appId: null, period: null, amount: null, currency: null, scale: null, payload: dealDigestMessage(games, omitted, day, c), games, configKey: config,
    status: 'pending', attempts: 0, createdAt: now, nextAttemptAt: now, expiresAt: now + DAY, messageId: null, error: null };
}
export async function runOnce(o: EngineOptions): Promise<RunStats> {
  const c = o.config, repo = o.repository, budget = o.budget, clock = o.now ?? Date.now, started = clock();
  const stats: RunStats = { id: crypto.randomUUID(), at: started, status: 'ok', discovered: 0, eligible: 0, omitted: {}, pending: 0, sent: 0, failed: 0, source: 'not_queried', lastSourceSuccess: null, durationMs: 0, requests: 0, rowsRead: 0, rowsWritten: 0, responseBytes: 0 };
  const omit = (reason: string, n = 1) => { stats.omitted[reason] = (stats.omitted[reason] ?? 0) + n; };
  if (!c.enabled) { stats.status = 'disabled'; o.log?.(stats); return stats; }
  if (!await repo.acquire()) { stats.status = 'locked'; o.log?.(stats); return stats; }
  let job: Job | null = null;
  try {
    const key = configKey(c); const previous = await repo.loadJob();
    job = previous?.configKey === key ? structuredClone(previous) : { ...newJob(key), deliveryPaused: previous?.deliveryPaused ?? false, discordNextAt: previous?.discordNextAt ?? 0, digestDay: previous?.digestDay ?? null, dealDigestDay: previous?.dealDigestDay ?? null };
    job.dealDigestDay ??= null;
    const local = localTime(started, c.timezone);
    await repo.recover(key, started);
    const due = c.sendEnabled && !job.deliveryPaused ? await repo.due(c, started) : [];
    const current = new Map<number, Game>();
    const get = async (id: number) => {
      if (clock() - started > 4 * 60_000) throw new SourceError('RUN_DEADLINE');
      const cached = current.get(id); if (cached) return cached;
      const g = await o.provider.detail(id); current.set(id, g); return g;
    };
    const sourceReady = c.source.enabled && c.source.accessReviewed && c.source.coverageAccepted && !job.sourcePaused && job.sourceNextAt <= started;
    let sourceFailure: unknown = null;
    const dealGames: Game[] = [], releaseGames: Game[] = [];
    const dealWasBaseline = !job.dealBaseline, releaseWasBaseline = !job.releaseBaseline;
    const validPending: Delivery[] = [];
    if (sourceReady) {
      try {
        // Reintentos reservados tienen prioridad y comparten las diez comprobaciones de la invocación.
        for (const d of due) {
          if (d.kind === 'release') { validPending.push(d); continue; }
          if (d.appId === null) {
            const refreshed: Game[] = []; let changed = false;
            for (const old of d.games) {
              const g = started - old.observedAt > 30 * 60_000 ? await get(old.appId) : old;
              if (rejection(g, c, 'deal', clock()) || g.currentAmount !== old.currentAmount || g.currency !== old.currency || g.amountScale !== old.amountScale || g.originalAmount !== old.originalAmount || g.discountPercent !== old.discountPercent) { changed = true; break; }
              refreshed.push(g);
            }
            if (changed || refreshed.length !== d.games.length) { await repo.expire(d, 'DEAL_DIGEST_CHANGED'); omit('pending_changed'); }
            else validPending.push({ ...d, games: refreshed, payload: dealDigestMessage(refreshed, 0, d.day, c) });
            continue;
          }
          const old = d.games[0];
          if (!old) { await repo.expire(d, 'MISSING_OBSERVATION'); continue; }
          const g = started - old.observedAt > 30 * 60_000 ? await get(old.appId) : old;
          if (rejection(g, c, 'deal', clock()) || g.currentAmount !== d.amount || g.currency !== d.currency || g.amountScale !== d.scale || g.originalAmount !== old.originalAmount || g.discountPercent !== old.discountPercent) {
            await repo.expire(d, 'DEAL_CHANGED'); omit('pending_changed');
          } else validPending.push(d);
        }
        // Seguimiento acotado permite observar el fin real de ofertas ausentes de la búsqueda.
        const dailyPending = validPending.some(d => d.kind === 'deal' && d.appId === null);
        const dailyDue = c.deals.mode === 'daily-digest' && local.time >= c.deals.digestAt && job.dealDigestDay !== local.day && !dailyPending;
        const watched = c.deals.mode === 'instant' ? await repo.watchIds(c, job.watchAfter ?? 0, Math.min(2, 10 - budget.details)) : [];
        for (const id of watched) dealGames.push(await get(id));
        job.watchAfter = watched.length === 2 ? watched[watched.length - 1]! : 0;
        const remaining = 10 - budget.details;
        const releaseDue = started >= job.releaseNextAt;
        const releaseLimit = releaseDue && !dailyDue ? Math.min(5, Math.floor(remaining / 2)) : 0;
        const dealLimit = c.deals.mode === 'daily-digest' ? (dailyDue ? remaining : 0) : remaining - releaseLimit;
        if (dealLimit > 0) {
          if (c.deals.mode === 'daily-digest') {
            const recent = await repo.recentlySentDealIds(c, started - c.deals.repeatWindowDays * DAY);
            const candidates: number[] = [], seen = new Set<number>();
            let cursor = { offset: 0, pending: [] as number[], end: false };
            let pages = 0;
            while (candidates.length < dealLimit && pages < c.source.maxPages) {
              pages++;
              const found = await o.provider.discover('deal', cursor, c.source.pageSize);
              stats.discovered += found.discovered; cursor = found.cursor;
              for (const id of found.ids) {
                if (seen.has(id)) continue;
                seen.add(id);
                if (recent.has(id)) { omit('recently_sent'); continue; }
                candidates.push(id);
                if (candidates.length >= dealLimit) break;
              }
              if (found.completedCycle) break;
            }
            for (const id of candidates) dealGames.push(await get(id));
            job.dealBaseline = true;
          } else {
            const found = await o.provider.discover('deal', job.dealCursor, dealLimit);
            stats.discovered += found.discovered;
            for (const id of found.ids) dealGames.push(await get(id));
            job.dealCursor = found.cursor;
            if (found.completedCycle) job.dealBaseline = true;
          }
        }
        if (releaseLimit > 0) {
          const found = await o.provider.discover('release', job.releaseCursor, releaseLimit);
          stats.discovered += found.discovered;
          for (const id of found.ids) releaseGames.push(await get(id));
          job.releaseCursor = found.cursor;
          if (found.completedCycle) job.releaseBaseline = true;
          // Un descubrimiento cada seis horas; el cursor conserva lo que no cupo.
          job.releaseNextAt = started + c.releases.discoveryHours * HOUR;
        }
        job.sourceFailures = 0; job.sourceNextAt = 0; job.lastSourceSuccess = started; stats.source = 'ok';
      } catch (error) {
        sourceFailure = error; job.sourceFailures++;
        job.sourceNextAt = error instanceof SourceError && error.retryAt !== null ? error.retryAt : started + 30 * 60_000 * 2 ** Math.min(job.sourceFailures - 1, 4);
        if (job.sourceFailures >= 3) job.sourcePaused = true;
        stats.source = error instanceof SourceError ? error.code : 'SOURCE_FAILURE'; stats.failed++; stats.status = 'source_error';
      }
    } else { stats.source = job.sourcePaused ? 'paused_after_failures' : 'gated_or_deferred'; stats.status = 'source_paused'; }
    // No confirmar cursores parciales tras fallos: reobservar es seguro y no pierde candidatos.
    if (sourceFailure) {
      const reset = previous?.configKey === key ? previous : newJob(key);
      job.dealCursor = reset.dealCursor; job.releaseCursor = reset.releaseCursor; job.releaseNextAt = reset.releaseNextAt;
      job.dealBaseline = reset.dealBaseline; job.releaseBaseline = reset.releaseBaseline;
      dealGames.length = 0; releaseGames.length = 0;
    }
    const uniqueDeals = [...new Map(dealGames.map(g => [g.appId, g])).values()];
    const oldStates = await repo.dealStates(c, uniqueDeals.map(g => g.appId));
    const states = uniqueDeals.filter(g => g.country === c.country && g.currency === c.currency && g.amountScale === c.amountScale).map(g => observeDeal(g, oldStates.get(g.appId), dealWasBaseline || !c.sendEnabled));
    const statesById = new Map(states.map(s => [s.appId, s]));
    const eligibleDeals = uniqueDeals.filter(g => { const reason = rejection(g, c, 'deal', clock()); if (reason) { omit(reason); return false; } stats.eligible++; return true; }).sort(sortDeals);
    const eligibleReleases = releaseGames.filter(g => { const reason = rejection(g, c, 'release', clock()); if (reason) { omit(reason); return false; } stats.eligible++; return true; });
    await repo.saveObservations(c, [...current.values()], states, eligibleReleases.map(game => ({ game, baseline: releaseWasBaseline || !c.sendEnabled })), job);
    let sendQueue = validPending;
    const sendsReady = c.sendEnabled && !job.deliveryPaused && job.discordNextAt <= clock() && sourceReady && !sourceFailure;
    if (sendsReady) {
      const reservations: Delivery[] = [];
      if (c.deals.mode === 'daily-digest') {
        const alreadyPending = validPending.some(d => d.kind === 'deal' && d.appId === null);
        if (!alreadyPending && local.time >= c.deals.digestAt && job.dealDigestDay !== local.day) {
          const offers = eligibleDeals.slice(0, c.deals.maxItems);
          omit('quota', Math.max(0, eligibleDeals.length - offers.length));
          if (offers.length) reservations.push(makeDealDigestDelivery(c, local.day, key, offers, clock(), eligibleDeals.length - offers.length));
          else { job.dealDigestDay = local.day; await repo.saveJob(job); }
        }
      } else {
        const slots = Math.max(0, c.deals.perRun - validPending.filter(d => d.kind === 'deal').length);
        const offers = dealWasBaseline ? [] : eligibleDeals.filter(g => shouldAnnounce(g, statesById.get(g.appId)!, clock()));
        omit('quota', Math.max(0, offers.length - slots));
        reservations.push(...offers.slice(0, slots).map(g => makeDelivery(c, dealKey(c.destinationId, g, statesById.get(g.appId)!), local.day, key, [g], clock(), statesById.get(g.appId)!.period)));
      }
      if (!releaseWasBaseline && local.time >= c.releases.digestAt && job.digestDay !== local.day && !validPending.some(d => d.kind === 'release')) {
        const minDay = new Date(Date.parse(local.day) - (c.releases.windowDays - 1) * DAY).toISOString().slice(0, 10);
        const found = await repo.releaseCandidates(c, key, minDay, local.day);
        const games = found.games.filter(g => !rejection(g, c, 'release', clock(), c.releases.windowDays * DAY));
        if (games.length) reservations.push(makeDelivery(c, `digest:${c.destinationId}:${c.country}:${local.day}`, local.day, key, games, clock(), null, found.total - found.games.length));
      }
      const reserved = await repo.reserve(reservations, c);
      omit('quota_or_duplicate', reservations.length - reserved.length);
      sendQueue = [...validPending, ...reserved];
      let dealAttempts = 0;
      for (const d of sendQueue) {
        // Reserva seis operaciones para registro, cierre y errores; deja margen de plataforma.
        if (!budget.canSpend(9) || clock() - started > 4 * 60_000) { omit('budget'); break; }
        if (d.kind === 'deal' && dealAttempts >= c.deals.perRun) continue;
        if (d.kind === 'release' && (job.digestDay === local.day || d.games.some(g => rejection(g, c, 'release', clock(), c.releases.windowDays * DAY)))) { await repo.expire(d, 'DIGEST_STALE_OR_ALREADY_SENT'); continue; }
        if (!await repo.claim(d, c, local.day)) { omit('quota_or_lease'); continue; }
        if (d.kind === 'deal') dealAttempts++;
        // Después de claim, cualquier excepción deja sending: siguiente ejecución lo vuelve uncertain.
        const result = await o.send(d);
        await repo.finish({ ...d, day: local.day }, result, job);
        if (result.status === 'sent') stats.sent++; else { stats.failed++; stats.status = 'delivery_error'; }
        if (result.status === 'retry' || ('pause' in result && result.pause)) break;
      }
    }
    if (c.deals.mode === 'daily-digest' && !c.sendEnabled && local.time >= c.deals.digestAt && job.dealDigestDay !== local.day) { job.dealDigestDay = local.day; await repo.saveJob(job); }
    if (sourceFailure) {
      for (const d of due.filter(d => d.kind === 'deal' && !validPending.includes(d)).slice(0, 3)) {
        if (!budget.canSpend(5)) break;
        await repo.defer(d, clock());
      }
    }
    stats.pending = Math.max(0, sendQueue.length - stats.sent);
    if (budget.canSpend(5)) await repo.retain(clock());
    if (budget.canSpend(3)) {
      const counts = await repo.query("SELECT COUNT(*) AS n FROM outbox WHERE destination=? AND country=? AND status IN ('pending','retry','sending')", c.destinationId, c.country);
      stats.pending = Number(counts[0]?.n ?? 0);
    }
  } catch {
    stats.status = 'run_error'; stats.failed++;
    // Nunca serializar excepciones externas: pueden contener URL secretas.
  } finally {
    stats.lastSourceSuccess = job?.lastSourceSuccess ?? null;
    stats.durationMs = clock() - started; stats.requests = budget.requests; stats.rowsRead = budget.rowsRead; stats.rowsWritten = budget.rowsWritten; stats.responseBytes = budget.responseBytes;
    try { if (budget.canSpend(2)) await repo.recordRun(stats); } catch { stats.status = 'persistence_error'; }
    try { if (budget.canSpend(1)) await repo.unlock(); } catch { /* Lease vence sin intervención. */ }
    stats.requests = budget.requests; stats.rowsRead = budget.rowsRead; stats.rowsWritten = budget.rowsWritten;
    o.log?.(stats);
  }
  return stats;
}
