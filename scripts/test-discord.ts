import { Budget } from '../src/budget.ts';
import { readConfig } from '../src/config.ts';
import { sendDiscord, verifyDestination } from '../src/notifications/discord.ts';
import type { DiscordPayload } from '../src/types.ts';

const payload: DiscordPayload = {
  embeds: [{
    title: 'PRUEBA · Avisos Steam',
    description: [
      'El webhook del canal quedó configurado correctamente.',
      'Este mensaje usa datos ficticios: no proviene de Steam ni de IsThereAnyDeal.',
      'El servicio automático permanece desactivado.'
    ].join('\n'),
    color: 0x66c0f4
  }],
  allowed_mentions: { parse: [] }
};

if (!process.argv.includes('--send')) {
  console.log('VISTA PREVIA · sin red · no se envió ningún mensaje');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (process.env.DISCORD_TEST_CONFIRM !== 'YES') {
  throw new Error('DISCORD_TEST_CONFIRM_REQUIRED');
}

const secret = process.env.DISCORD_WEBHOOK_URL?.trim();
if (!secret) throw new Error('DISCORD_WEBHOOK_URL_REQUIRED');

const config = readConfig();
if (!config.webhookId) throw new Error('WEBHOOK_ID_REQUIRED');

const budget = new Budget();
if (!await verifyDestination(secret, config, budget)) {
  throw new Error('DISCORD_DESTINATION_MISMATCH');
}

const result = await sendDiscord(payload, secret, config, budget, Date.now());
if (result.status !== 'sent') throw new Error(`DISCORD_TEST_${result.status.toUpperCase()}:${result.error}`);

console.log(JSON.stringify({ status: result.status, messageId: result.messageId, channelId: config.destinationId }));
