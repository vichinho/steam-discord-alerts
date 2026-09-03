import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDiscord, webhookUrl, dealMessage } from '../src/notifications/discord.ts';
import { Budget } from '../src/budget.ts';
import { config, game, NOW } from './helpers.ts';
const secret = 'https://discord.com/api/webhooks/987654321098765432/FIXTURE_NOT_A_REAL_TOKEN';
test('webhook restringido al ID configurado y wait=true', () => {
  assert.equal(webhookUrl(secret, config().webhookId!).search, '?wait=true');
  assert.throws(() => webhookUrl(secret, '111111111111111111'));
  assert.throws(() => webhookUrl(secret + '?thread_id=123', config().webhookId!));
  assert.throws(() => webhookUrl(secret.replace('discord.com', 'discord.com.evil.invalid'), config().webhookId!));
});
test('Discord publica con menciones desactivadas y guarda identificador', async () => {
  const result = await sendDiscord(dealMessage(game(), config()), secret, config(), new Budget(), NOW, async (_url, init) => {
    assert.equal(init!.redirect, 'manual'); assert.deepEqual(JSON.parse(String(init!.body)).allowed_mentions, { parse: [] });
    return Response.json({ id: '111111111111111111', channel_id: config().destinationId });
  });
  assert.deepEqual(result, { status: 'sent', messageId: '111111111111111111' });
});
test('429 difiere, permisos pausan y timeouts/5xx/missing ID son ambiguos', async () => {
  const run = (response: () => Promise<Response>) => sendDiscord(dealMessage(game(), config()), secret, config(), new Budget(), NOW, response);
  const rate = await run(async () => Response.json({ retry_after: 4000 }, { status: 429 }));
  assert.equal(rate.status, 'retry'); if (rate.status === 'retry') assert.equal(rate.retryAt, NOW + 4000000);
  const denied = await run(async () => new Response(null, { status: 403 })); assert.equal('pause' in denied && denied.pause, true);
  for (const response of [async () => { throw new Error(secret); }, async () => new Response(null, { status: 502 }), async () => Response.json({})]) {
    const result = await run(response); assert.equal(result.status, 'uncertain'); assert.equal(JSON.stringify(result).includes('FIXTURE'), false);
  }
});
