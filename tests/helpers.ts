import fixture from './fixtures/appdetails.json' with { type: 'json' };
import { readConfig } from '../src/config.ts';
import { normalizeSteam } from '../src/providers/steam.ts';
import { Budget } from '../src/budget.ts';
import { Repository } from '../src/storage/repository.ts';
import type { Cursor, Game, Kind, Provider, Delivery } from '../src/types.ts';
import { LocalDatabase } from '../scripts/sqlite-local.ts';
import { runOnce } from '../src/engine.ts';
import type { SendResult } from '../src/notifications/discord.ts';
export const NOW = Date.parse('2026-08-31T22:00:00Z');
export function game(changes: Partial<Game> = {}): Game { return { ...normalizeSteam(fixture, 10001, 'CL', NOW), source: 'fixture', ...changes }; }
export function config() {
  const c = readConfig(); c.enabled = true; c.sendEnabled = true; c.destinationId = '123456789012345678'; c.webhookId = '987654321098765432';
  c.deals.mode = 'instant'; c.deals.perRun = 5; c.deals.perDay = 20;
  c.source.enabled = c.source.accessReviewed = c.source.coverageAccepted = c.source.cloudValidated = true;
  return c;
}
export class FixtureProvider implements Provider {
  games: Game[]; clock: () => number; budget: Budget; failure: Error | null = null;
  constructor(games: Game[], budget: Budget, clock: () => number) { this.games = games; this.budget = budget; this.clock = clock; }
  async discover(_kind: Kind, _cursor: Cursor, limit: number) {
    this.budget.take(); if (this.failure) throw this.failure;
    return { ids: this.games.slice(0, limit).map(g => g.appId), cursor: { offset: 0, pending: [], end: false }, completedCycle: true, discovered: this.games.length };
  }
  async detail(id: number) {
    this.budget.detail(); this.budget.take(); if (this.failure) throw this.failure;
    const g = this.games.find(g => g.appId === id); if (!g) throw new Error('FIXTURE_MISSING');
    return { ...g, observedAt: this.clock() };
  }
}
export function harness(initial: Game[] = [game()]) {
  const db = new LocalDatabase(); const c = config(); let now = NOW; let games = initial; let failure: Error | null = null;
  const sent: Delivery[] = []; let result: SendResult = { status: 'sent', messageId: '111111111111111111' };
  return {
    db, c, sent, get now() { return now; }, set now(value: number) { now = value; },
    set games(value: Game[]) { games = value; }, set failure(value: Error | null) { failure = value; }, set result(value: SendResult) { result = value; },
    async run() {
      const budget = new Budget(), repo = new Repository(db, budget, crypto.randomUUID(), () => now);
      const provider = new FixtureProvider(games, budget, () => now); provider.failure = failure;
      const stats = await runOnce({ config: c, repository: repo, provider, budget, now: () => now, send: async d => { budget.take(); sent.push(d); return result; } });
      return { stats, repo, budget };
    },
    rows(sql: string) { return db.sqlite.prepare(sql).all() as Record<string, unknown>[]; },
    close() { db.close(); }
  };
}
