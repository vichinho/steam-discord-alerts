import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSteam, searchIds, SteamProvider } from '../src/providers/steam.ts';
import { Budget } from '../src/budget.ts';
import { config, NOW } from './helpers.ts';
import fixture from './fixtures/appdetails.json' with { type: 'json' };
import { steamJson, SourceError } from '../src/providers/http.ts';
test('adaptador verifica appid, CLP, escala y no toma ficha vacía por disponible', () => {
  const g = normalizeSteam(fixture, 10001, 'CL', NOW); assert.equal(g.amountScale, 100); assert.equal(g.currency, 'CLP');
  assert.equal(normalizeSteam({ 10001: { success: false } }, 10001, 'CL', NOW).availableInRegion, null);
  assert.throws(() => normalizeSteam({ 10001: { success: true, data: { ...fixture['10001'].data, steam_appid: 2 } } }, 10001, 'CL', NOW), /STEAM_SCHEMA/);
  const noPrice = { ...fixture['10001'].data, price_overview: undefined };
  assert.equal(normalizeSteam({ 10001: { success: true, data: noPrice } }, 10001, 'CL', NOW).availableInRegion, null);
});
test('búsqueda rota no se presenta como cero resultados', () => {
  assert.throws(() => searchIds({ success: true, total_count: 5, results_html: '<p>nuevo esquema</p>' }), /SCHEMA/);
  assert.deepEqual(searchIds({ success: true, total_count: 0, results_html: '' }), { ids: [], total: 0 });
  assert.deepEqual(searchIds({ success: 1, total_count: 2, results_html: '<a data-ds-appid="10001"></a><a data-ds-appid="10002"></a>' }).ids, [10001,10002]);
});
test('paginación conserva IDs no enriquecidos y no completa línea base prematuramente', async () => {
  const c = config(); c.source.pageSize = 2; c.source.maxPages = 1;
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ success: 1, total_count: 50, results_html: '<a data-ds-appid="10001"></a><a data-ds-appid="10002"></a>' }); };
  const p = new SteamProvider(c, new Budget(), fetcher);
  const one = await p.discover('deal', { offset: 0, pending: [], end: false }, 1);
  assert.equal(one.completedCycle, false); assert.deepEqual(one.ids, [10001]);
  const two = await p.discover('deal', one.cursor, 1);
  assert.equal(two.completedCycle, true); assert.deepEqual(two.ids, [10002]); assert.equal(calls, 1);
});
test('se rechazan destinos y redirecciones; 429 queda diferido', async () => {
  const budget = new Budget();
  await assert.rejects(steamJson(new URL('https://evil.invalid/'), budget), /SOURCE_HOST/);
  await assert.rejects(steamJson(new URL('https://store.steampowered.com/api/appdetails'), budget, async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } })), /STEAM_HTTP_302/);
  await assert.rejects(steamJson(new URL('https://store.steampowered.com/api/appdetails'), budget, async () => new Response(null, { status: 429, headers: { 'retry-after': '3600' } })), e => e instanceof SourceError && e.retryAt !== null);
});
test('presupuestos de respuesta y detalles se aplican', async () => {
  await assert.rejects(steamJson(new URL('https://store.steampowered.com/api/appdetails'), new Budget(), async () => new Response('x', { headers: { 'content-length': '300000' } })), /RESPONSE_TOO_LARGE/);
  const b = new Budget(); for (let i = 0; i < 10; i++) b.detail(); assert.throws(() => b.detail(), /DETAIL_BUDGET/);
  b.take(40); assert.throws(() => b.take(), /REQUEST_BUDGET/);
});
test('Steam puede ignorar count: se recorta antes de guardar cursor', async () => {
  const p = new SteamProvider(config(), new Budget(), async () => Response.json({ success: 1, total_count: 100, results_html: Array.from({length: 25}, (_, i) => `<a data-ds-appid="${10001 + i}"></a>`).join('') }));
  const page = await p.discover('deal', { offset: 0, pending: [], end: false }, 2);
  assert.equal(page.cursor.pending.length, 8); assert.equal(page.cursor.offset, 10); assert.deepEqual(page.ids, [10001,10002]);
});
