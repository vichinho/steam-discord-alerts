import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, game, NOW, config } from './helpers.ts';
import { Budget } from '../src/budget.ts';
import { Repository, newJob } from '../src/storage/repository.ts';
import { configKey } from '../src/config.ts';
import { DAY } from '../src/domain/time.ts';
import { verifyDestination } from '../src/notifications/discord.ts';
test('no se publica a un canal distinto aunque el webhook sea válido', async () => {
  let calls = 0;
  const okay = await verifyDestination('https://discord.com/api/webhooks/987654321098765432/FIXTURE', config(), new Budget(), async (_url, init) => {
    calls++; assert.notEqual(init?.method, 'POST');
    return Response.json({ id: config().webhookId, channel_id: '999999999999999999', type: 1 });
  });
  assert.equal(okay, false); assert.equal(calls, 1);
});
test('resolución manual de uncertain actualiza estado sin enviar ni perder deduplicación', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })]; h.result = { status: 'uncertain', error: 'NETWORK' };
    await h.run(); const key = String(h.rows('SELECT key FROM outbox')[0]!.key);
    const repo = new Repository(h.db, new Budget(), 'manual', () => h.now);
    assert.equal(await repo.resolveUncertain(key, 'sent', '111111111111111111'), true);
    assert.equal(h.rows('SELECT status FROM outbox')[0]!.status, 'sent');
    assert.equal((await h.run()).stats.sent, 0); assert.equal(h.sent.length, 1);
  } finally { h.close(); }
});
test('reservas lógicas únicas, cupos de cinco y reservas del nuevo día', async () => {
  const h = harness([]);
  try {
    await h.run(); h.now += DAY;
    h.games = Array.from({ length: 8 }, (_, i) => game({ appId: 10001 + i, releaseDate: '2010-01-01' }));
    h.result = { status: 'retry', retryAt: h.now + 3600000, error: 'DISCORD_429' };
    await h.run();
    assert.equal(h.rows("SELECT COUNT(*) AS n FROM outbox WHERE kind='deal'")[0]!.n, 5);
    h.now += 3600000;
    const repo = new Repository(h.db, new Budget(), 'test-reserve', () => h.now);
    assert.equal(await repo.acquire(), true);
    const due = await repo.due(h.c, h.now);
    assert.deepEqual(await repo.reserve(due, h.c), []);
    h.c.deals.perDay = 1;
    assert.equal(await repo.claim(due[0]!, h.c, '2026-09-02'), true);
    assert.equal(await repo.claim(due[1]!, h.c, '2026-09-02'), false);
    await repo.unlock();
  } finally { h.close(); }
});
test('pendientes de más de 24 horas caducan sin reintento', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    h.result = { status: 'retry', retryAt: h.now + DAY * 2, error: 'DISCORD_429' }; await h.run();
    h.now += DAY; await h.run(); assert.equal(h.rows('SELECT status FROM outbox')[0]!.status, 'expired'); assert.equal(h.sent.length, 1);
  } finally { h.close(); }
});
test('línea base parcial se conserva hasta recorrer la cobertura', async () => {
  const h = harness();
  try {
    const repo = new Repository(h.db, new Budget(), 'init', () => NOW);
    const job = newJob(configKey(h.c)); job.dealCursor = { offset: 10, pending: [10001], end: false };
    await repo.saveJob(job);
    assert.equal((await repo.loadJob())?.dealBaseline, false);
    const r = await h.run(); assert.equal(r.stats.sent, 0);
  } finally { h.close(); }
});
test('un envío ambiguo bloquea nuevas bajadas de ese período hasta revisarlo', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })]; h.result = { status: 'uncertain', error: 'TIMEOUT' }; await h.run();
    h.now += DAY; h.games = [game({ currentAmount: 600000, discountPercent: 70 })]; await h.run(); assert.equal(h.sent.length, 1);
  } finally { h.close(); }
});
test('D1 inaccesible antes de reservar impide cualquier publicación', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    h.db.batch = async () => { throw new Error('D1_UNAVAILABLE'); };
    assert.equal((await h.run()).stats.status, 'persistence_error'); assert.equal(h.sent.length, 0);
  } finally { h.close(); }
});
