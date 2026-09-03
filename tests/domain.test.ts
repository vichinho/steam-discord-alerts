import test from 'node:test';
import assert from 'node:assert/strict';
import { config, game, NOW } from './helpers.ts';
import { readConfig, configKey } from '../src/config.ts';
import { rejection } from '../src/domain/filters.ts';
import { priceValid, releaseDate, safeImage } from '../src/domain/normalize.ts';
import { observeDeal, shouldAnnounce } from '../src/domain/deals.ts';
import { DAY, localTime } from '../src/domain/time.ts';
import { dealDigestMessage, dealMessage, money, releaseMessage } from '../src/notifications/discord.ts';
test('49 % no pasa; 50 % inclusive y máximo inclusive', () => {
  const c = config();
  assert.equal(rejection(game({ currentAmount: 1020000, discountPercent: 49 }), c, 'deal', NOW), 'discount');
  c.deals.maxAmount = 1000000; assert.equal(rejection(game(), c, 'deal', NOW), null);
  c.deals.maxAmount--; assert.equal(rejection(game(), c, 'deal', NOW), 'max_price');
});
test('moneda, región, desconocidos y ausencia de precio se rechazan', () => {
  const c = config();
  for (const [change, reason] of [[{ currency: 'USD' }, 'currency'], [{ country: 'US' }, 'region'], [{ availableInRegion: null }, 'region'], [{ originalAmount: null }, 'price'], [{ productType: 'dlc' }, 'product_type'], [{ productType: 'unknown' }, 'product_type']] as const) assert.equal(rejection(game(change), c, 'deal', NOW), reason);
  c.deals.genres = ['1']; assert.equal(rejection(game({ genres: null }), c, 'deal', NOW), 'genre');
  assert.equal(rejection(game({ genres: ['2','1'] }), c, 'deal', NOW), null);
});
test('cero no implica regalo ni permite porcentajes inventados', () => {
  assert.equal(rejection(game({ originalAmount: 0, currentAmount: 0, discountPercent: 0 }), config(), 'deal', NOW), 'price');
  const zero = game({ currentAmount: 0, discountPercent: 100 });
  assert.equal(rejection(zero, config(), 'deal', NOW), null);
  assert.match(dealMessage(zero, config()).embeds![0]!.description, /no confirma un regalo/);
  assert.equal(priceValid(game({ currentAmount: -1 })), false);
  assert.equal(priceValid(game({ discountPercent: 70 })), false);
  assert.equal(priceValid(game({ currentAmount: 1999999, discountPercent: 0 })), false);
});
test('fechas incompletas o inválidas nunca se completan por inferencia', () => {
  assert.deepEqual(releaseDate('31 Aug, 2026'), { releaseDate: '2026-08-31', releasePrecision: 'day' });
  assert.equal(releaseDate('Aug 31, 2026').releaseDate, '2026-08-31');
  assert.equal(releaseDate('Feb 31, 2026').releasePrecision, 'unknown');
  assert.equal(releaseDate('2026-02-31').releasePrecision, 'unknown');
  assert.equal(releaseDate('Aug 2026').releasePrecision, 'month');
  assert.equal(releaseDate('2026').releasePrecision, 'year');
});
test('estrenos tienen filtros independientes y no necesitan reseñas o precio', () => {
  const c = config(); c.deals.minDiscountPercent = 90; c.deals.maxAmount = 1;
  assert.equal(rejection(game({ discountPercent: 0, currentAmount: null, currency: null }), c, 'release', NOW), null);
  for (const change of [{ comingSoon: true }, { comingSoon: null }, { releasePrecision: 'month' as const }, { releaseDate: '2026-09-01' }, { releaseDate: '2026-08-24' }]) assert.notEqual(rejection(game(change), c, 'release', NOW), null);
  assert.equal(rejection(game({ releaseDate: '2026-08-25' }), c, 'release', NOW), null);
});
test('ausencia no termina oferta; fin explícito abre un período nuevo', () => {
  const g = game(); const baseline = observeDeal(g, undefined, true);
  assert.equal(shouldAnnounce(g, baseline, NOW + DAY), false);
  const lower = game({ currentAmount: 800000, discountPercent: 60 });
  assert.equal(shouldAnnounce(lower, baseline, NOW + DAY - 1), false);
  assert.equal(shouldAnnounce(lower, baseline, NOW + DAY), true);
  const ended = observeDeal(game({ currentAmount: 2000000, discountPercent: 0 }), baseline, false);
  assert.equal(ended.active, false);
  const again = observeDeal(g, ended, false); assert.equal(again.period, 2); assert.equal(shouldAnnounce(g, again, NOW), true);
});
test('configuración cambia línea base por filtros pero no por horario', () => {
  const c = config(), key = configKey(c); c.releases.digestAt = '21:00'; assert.equal(configKey(c), key);
  c.deals.minDiscountPercent = 40; assert.notEqual(configKey(c), key);
  assert.throws(() => readConfig({ ...c, sendEnabled: true, webhookId: null }), /INVALID_CONFIG/);
  assert.throws(() => readConfig({ ...c, deals: { ...c.deals, perRun: 6 } }), /INVALID_CONFIG/);
});
test('Santiago calcula fecha y horario a ambos lados de sus cambios de hora', () => {
  assert.deepEqual(localTime(Date.parse('2026-09-06T03:30:00Z'), 'America/Santiago'), { day: '2026-09-05', time: '23:30' });
  assert.deepEqual(localTime(Date.parse('2026-09-06T04:30:00Z'), 'America/Santiago'), { day: '2026-09-06', time: '01:30' });
  assert.equal(localTime(Date.parse('2026-04-05T02:30:00Z'), 'America/Santiago').day, localTime(Date.parse('2026-04-05T03:30:00Z'), 'America/Santiago').day);
});
test('mensajes seguros, escala monetaria entera y límites compactos', () => {
  assert.equal(money(575000, 100, 'CLP'), '$5.750 CLP');
  assert.equal(money(12345, 100, 'USD'), '$123,45 USD');
  const g = game({ title: '@everyone [enlace](https://evil.invalid) **x**', imageUrl: 'https://evil.invalid/pixel' });
  const payload = dealMessage(g, config());
  assert.deepEqual(payload.allowed_mentions, { parse: [] }); assert.equal(payload.embeds![0]!.image, undefined);
  assert.equal(payload.embeds![0]!.title.includes('@everyone'), false);
  const digest = releaseMessage(Array.from({ length: 10 }, (_, i) => game({ appId: 20000 + i, title: '['.repeat(500) })), 6, '2026-08-31', config());
  assert.ok(digest.embeds![0]!.description.length < 4096);
  assert.match(digest.embeds![0]!.description, /6 candidatos/);
  const dealDigest = dealDigestMessage(Array.from({ length: 10 }, (_, i) => game({ appId: 30000 + i, title: '['.repeat(500) })), 0, '2026-08-31', config());
  assert.equal(dealDigest.embeds!.length, 10);
  assert.match(dealDigest.content!, /Ofertas destacadas de Steam/);
  assert.match(dealDigest.content!, /CLP/);
  assert.match(dealDigest.embeds![0]!.description, /Ver en Steam/);
  assert.match(dealDigest.embeds![0]!.description, /~~Antes: \$20\.000 CLP~~/);
  assert.match(dealDigest.embeds![0]!.description, /### Ahora: \$10\.000 CLP/);
  assert.doesNotMatch(dealDigest.embeds![0]!.description, /🟩/);
  assert.match(dealDigest.content!, /Próxima revisión mañana/);
  assert.ok(dealDigest.embeds!.reduce((total, embed) => total + embed.title.length + embed.description.length + (embed.footer?.text.length ?? 0), 0) < 6000);
  const shortDigest = dealDigestMessage([game()], 2, '2026-08-31', config());
  assert.equal(shortDigest.embeds!.length, 2);
  assert.match(shortDigest.embeds![1]!.title, /Selección diaria/);
  assert.match(shortDigest.embeds![1]!.description, /2 candidatos omitidos/);
  assert.equal(safeImage('http://shared.fastly.steamstatic.com/image'), null);
});
