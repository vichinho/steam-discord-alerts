import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, game, NOW, config } from './helpers.ts';
import { DAY } from '../src/domain/time.ts';
import { Repository } from '../src/storage/repository.ts';
import { Budget } from '../src/budget.ts';
import { SourceError } from '../src/providers/http.ts';
import { LocalDatabase } from '../scripts/sqlite-local.ts';
test('primera ejecución crea línea base; repetir y redeploy no anuncian históricos', async () => {
  const h = harness();
  try {
    for (let i = 0; i < 3; i++) { const r = await h.run(); assert.equal(r.stats.status, 'ok'); assert.equal(r.stats.sent, 0); }
    assert.equal(h.sent.length, 0); assert.equal(h.rows('SELECT * FROM deal_state').length, 1); assert.equal(h.rows('SELECT baseline FROM releases')[0]!.baseline, 1);
  } finally { h.close(); }
});
test('bajada adicional espera 24h, publica una vez y conserva precio anunciado', async () => {
  const h = harness();
  try {
    await h.run(); h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    h.now += DAY - 1; assert.equal((await h.run()).stats.sent, 0);
    h.now++; const run = await h.run(); assert.equal(run.stats.sent, 1); assert.ok(run.budget.requests <= 40);
    assert.equal((await h.run()).stats.sent, 0);
    assert.equal(h.rows("SELECT status FROM outbox WHERE kind='deal'")[0]!.status, 'sent');
    assert.equal(JSON.parse(String(h.rows('SELECT data FROM deal_state')[0]!.data)).lastAmount, 800000);
  } finally { h.close(); }
});
test('nueva oferta y estreno sin descuento se manejan independientemente', async () => {
  const h = harness();
  try {
    await h.run(); h.now = Date.parse('2026-09-02T00:00:00Z');
    h.games = [game(), game({ appId: 10002, title: 'Nuevo sin rebaja', currentAmount: 2000000, discountPercent: 0, releaseDate: '2026-09-01' }), game({ appId: 10003, title: 'Nueva oferta', releaseDate: '2010-01-01' })];
    const r = await h.run(); assert.equal(r.stats.sent, 2);
    const digest = h.sent.find(d => d.kind === 'release'); assert.ok(digest); assert.equal(digest.games[0]!.appId, 10002);
    assert.equal((await h.run()).stats.sent, 0);
  } finally { h.close(); }
});
test('cambio de filtros y de región reconstruye línea base; horario conserva historial', async () => {
  const h = harness();
  try {
    await h.run(); h.games = [game({ currentAmount: 800000, discountPercent: 60 })]; h.now += DAY;
    h.c.deals.minDiscountPercent = 40; assert.equal((await h.run()).stats.sent, 0);
    h.c.releases.digestAt = '21:00'; assert.equal((await h.run()).stats.sent, 0);
    h.c.country = 'US'; h.c.currency = 'USD'; h.games = [game({ country: 'US', currency: 'USD' })];
    assert.equal((await h.run()).stats.sent, 0);
    assert.equal(h.rows('SELECT * FROM deal_state').length, 2);
  } finally { h.close(); }
});
test('fin observado explícitamente permite otra oferta con mismo precio', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 2000000, discountPercent: 0 })]; await h.run();
    h.now += 30 * 60000; h.games = [game()]; assert.equal((await h.run()).stats.sent, 1);
    assert.equal(h.sent[0]!.period, 2);
  } finally { h.close(); }
});
test('429 conserva reserva, respeta espera, cuota diaria y tope por ejecución', async () => {
  const h = harness();
  try {
    h.c.deals.perDay = 1; await h.run(); h.now += DAY;
    h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    h.result = { status: 'retry', retryAt: h.now + 3_600_000, error: 'DISCORD_429' };
    assert.equal((await h.run()).stats.sent, 0); assert.equal(h.sent.length, 1);
    h.now += 30 * 60000; await h.run(); assert.equal(h.sent.length, 1);
    h.now += 30 * 60000; h.result = { status: 'sent', messageId: '111111111111111111' };
    assert.equal((await h.run()).stats.sent, 1);
    assert.equal(h.rows('SELECT * FROM outbox').length, 1);
    h.games = [game({ currentAmount: 800000, discountPercent: 60 }), game({ appId: 10002, releaseDate: '2010-01-01' })];
    await h.run(); assert.equal(h.sent.length, 2);
  } finally { h.close(); }
});
test('oferta pendiente cambia: no publica datos antiguos', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    h.result = { status: 'retry', retryAt: h.now + 3600000, error: 'DISCORD_429' }; await h.run();
    h.games = [game({ currentAmount: 2000000, discountPercent: 0 })]; h.now += 3600000;
    await h.run(); assert.equal(h.sent.length, 1); assert.equal(h.rows('SELECT status FROM outbox')[0]!.status, 'expired');
  } finally { h.close(); }
});
test('fuente rota queda visible, conserva cursor y se pausa tras tres fallos', async () => {
  const h = harness();
  try {
    await h.run(); h.failure = new SourceError('STEAM_SEARCH_SCHEMA');
    for (let i = 0; i < 3; i++) { h.now += DAY; assert.equal((await h.run()).stats.status, 'source_error'); }
    const job = JSON.parse(String(h.rows('SELECT value FROM job_state')[0]!.value)); assert.equal(job.sourcePaused, true); assert.equal(job.sourceFailures, 3);
    assert.equal((await h.run()).stats.source, 'paused_after_failures'); assert.equal(h.sent.length, 0);
  } finally { h.close(); }
});
test('lease atómico permite un solo propietario y protege contra desbloqueo ajeno', async () => {
  const db = new LocalDatabase(); let now = NOW;
  try {
    const a = new Repository(db, new Budget(), 'a', () => now), b = new Repository(db, new Budget(), 'b', () => now);
    const owned = await Promise.all([a.acquire(), b.acquire()]); assert.deepEqual(owned, [true,false]);
    await b.unlock(); assert.equal(await b.acquire(), false);
    now += 11 * 60000; assert.equal(await b.acquire(), true); await a.unlock();
    assert.equal((await b.query('SELECT owner FROM leases'))[0]!.owner, 'b');
  } finally { db.close(); }
});
test('caída después de Discord y antes de D1 produce uncertain sin reenvío', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })];
    // Simula fallo de la transacción de confirmación después de un POST exitoso.
    const batch = h.db.batch.bind(h.db); let failNext = false;
    h.db.batch = async statements => { if (failNext) { failNext = false; throw new Error('D1_OFFLINE'); } return batch(statements); };
    const sentPush = h.sent.push.bind(h.sent); h.sent.push = (...d) => { failNext = true; return sentPush(...d); };
    assert.equal((await h.run()).stats.status, 'run_error'); assert.equal(h.rows('SELECT status FROM outbox')[0]!.status, 'sending');
    h.sent.push = sentPush; await h.run(); assert.equal(h.rows('SELECT status FROM outbox')[0]!.status, 'uncertain'); assert.equal(h.sent.length, 1);
  } finally { h.close(); }
});
test('retención elimina payloads pero conserva deduplicación y estados compactos', async () => {
  const h = harness();
  try {
    await h.run(); h.now += DAY; h.games = [game({ currentAmount: 800000, discountPercent: 60 })]; await h.run();
    h.now += 31 * DAY;
    const repo = new Repository(h.db, new Budget(), 'maintenance', () => h.now); await repo.retain(h.now);
    assert.equal(h.rows('SELECT payload FROM outbox')[0]!.payload, null);
    assert.equal(h.rows('SELECT * FROM deal_state').length, 1);
    assert.equal((await h.run()).stats.sent, 0);
  } finally { h.close(); }
});
test('pausa global no toca red ni base de datos', async () => {
  const h = harness(); try { h.c.enabled = false; const r = await h.run(); assert.equal(r.stats.status, 'disabled'); assert.equal(r.budget.requests, 0); } finally { h.close(); }
});
test('resumen diario agrupa ofertas y no se repite el mismo día', async () => {
  const h = harness(Array.from({ length: 4 }, (_, i) => game({ appId: 10001 + i, title: `Oferta ${i + 1}`, discountPercent: 50 + i, currentAmount: 1000000 - i * 20000 })));
  try {
    h.c.deals.mode = 'daily-digest'; h.c.deals.maxItems = 3; h.c.deals.perRun = 1; h.c.deals.perDay = 1; h.c.deals.digestAt = '12:00';
    const first = await h.run(); assert.equal(first.stats.sent, 1); assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0]!.appId, null); assert.equal(h.sent[0]!.games.length, 3);
    assert.match(h.sent[0]!.payload!.content!, /Ofertas destacadas de Steam/);
    assert.match(h.sent[0]!.payload!.embeds![0]!.title, /^1\. Oferta/);
    assert.equal((await h.run()).stats.sent, 0);
    h.now += DAY; assert.equal((await h.run()).stats.sent, 1); assert.equal(h.sent.length, 2);
    assert.deepEqual(h.sent[1]!.games.map(g => g.appId), [10001]);
    h.now += DAY; assert.equal((await h.run()).stats.sent, 0); assert.equal(h.sent.length, 2);
  } finally { h.close(); }
});

test('resumen diario excluye juegos enviados durante siete días y luego permite reutilizarlos', async () => {
  const h = harness([game()]);
  try {
    h.c.deals.mode = 'daily-digest'; h.c.deals.maxItems = 10; h.c.deals.digestAt = '12:00';
    assert.equal((await h.run()).stats.sent, 1);
    h.now += DAY; const repeated = await h.run();
    assert.equal(repeated.stats.sent, 0); assert.equal(repeated.stats.omitted.recently_sent, 1);
    h.now += 6 * DAY; assert.equal((await h.run()).stats.sent, 1);
    assert.equal(h.sent.length, 2);
  } finally { h.close(); }
});
