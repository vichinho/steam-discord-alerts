import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Budget } from '../src/budget.ts';
import { readConfig } from '../src/config.ts';
import { rustItemRejection } from '../src/domain/rust-items.ts';
import { localTime } from '../src/domain/time.ts';
import { sendDiscord, skinportDigestMessage, verifyDestination } from '../src/notifications/discord.ts';
import { SkinportProvider } from '../src/providers/skinport.ts';

interface State {
  lastSentDay: string | null;
  messageId: string | null;
  sentAt: string | null;
}

const config = readConfig();
const rules = config.rustItems.communityMarket;
if (!rules.accessReviewed || !rules.coverageAccepted) throw new Error('SKINPORT_ACCESS_NOT_ACCEPTED');

const statePath = process.env.SKINPORT_STATE_PATH?.trim() || 'data/skinport-state.json';
const send = process.env.SKINPORT_SEND_CONFIRM === 'YES';
const now = Date.now();
const local = localTime(now, config.timezone);
const day = local.day;
let state: State = { lastSentDay: null, messageId: null, sentAt: null };
try { state = JSON.parse(await readFile(statePath, 'utf8')) as State; } catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
}

if (send && process.env.SKINPORT_SCHEDULED === 'YES' && local.time < rules.digestAt) {
  console.log(JSON.stringify({ status: 'not_due', day, localTime: local.time, digestAt: rules.digestAt }));
  process.exit(0);
}
if (send && state.lastSentDay === day) {
  console.log(JSON.stringify({ status: 'already_sent', day }));
  process.exit(0);
}

const budget = new Budget();
const found = await new SkinportProvider(config, budget).opportunities(now);
const eligible = found.filter(item => rustItemRejection(item, config) === null);
const selected = eligible.slice(0, rules.perRun);
const payload = skinportDigestMessage(selected, day, config);

if (!send) {
  console.log(JSON.stringify({ status: 'preview', day, scanned: found.length, eligible: eligible.length, selected: selected.length, payload }, null, 2));
  process.exit(0);
}
if (!selected.length) {
  console.log(JSON.stringify({ status: 'no_matches', day, scanned: found.length }));
  process.exit(0);
}

const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
if (!webhook) throw new Error('DISCORD_WEBHOOK_URL_REQUIRED');
if (!config.webhookId || !(await verifyDestination(webhook, config, budget))) throw new Error('DISCORD_DESTINATION_MISMATCH');
const result = await sendDiscord(payload, webhook, config, budget, now);
if (result.status !== 'sent') throw new Error(`DISCORD_${result.status.toUpperCase()}:${result.error}`);

state = { lastSentDay: day, messageId: result.messageId, sentAt: new Date(now).toISOString() };
await mkdir(dirname(statePath), { recursive: true });
const temporaryPath = `${statePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await rename(temporaryPath, statePath);
console.log(JSON.stringify({ status: 'sent', day, scanned: found.length, eligible: eligible.length, selected: selected.length, messageId: result.messageId }));
