import { readConfig } from './config.ts';
import { Budget } from './budget.ts';
import { runOnce } from './engine.ts';
import { SteamProvider } from './providers/steam.ts';
import { Repository, type Database } from './storage/repository.ts';
import { sendDiscord, webhookUrl, verifyDestination, type SendResult } from './notifications/discord.ts';
import type { DiscordPayload } from './types.ts';
import { SourceError } from './providers/http.ts';
import { runSkinport } from './skinport-engine.ts';
interface Env { DB: Database; DISCORD_WEBHOOK_URL?: string }
export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const c = readConfig();
    if (c.sendEnabled) webhookUrl(env.DISCORD_WEBHOOK_URL ?? '', c.webhookId!);
    const budget = new Budget(); const repository = new Repository(env.DB, budget);
    let destinationVerified = false;
    const send = async (payload: DiscordPayload): Promise<SendResult> => {
        try {
          if (!destinationVerified) destinationVerified = await verifyDestination(env.DISCORD_WEBHOOK_URL!, c, budget);
        } catch (error) {
          return { status: 'retry', retryAt: error instanceof SourceError && error.retryAt !== null ? error.retryAt : Date.now() + 30 * 60_000, error: 'WEBHOOK_PREFLIGHT_RETRY' };
        }
        if (!destinationVerified) return { status: 'failed', pause: true, error: 'WEBHOOK_DESTINATION_UNVERIFIED' };
        return sendDiscord(payload, env.DISCORD_WEBHOOK_URL!, c, budget, Date.now());
      };
    await runOnce({ config: c, repository, budget, provider: new SteamProvider(c, budget),
      send: async d => send(d.payload!),
      log: stats => console.log(JSON.stringify(stats)) });
    const skinport = await runSkinport({ config: c, db: env.DB, budget, send });
    if (skinport.status !== 'not_due') console.log(JSON.stringify(skinport));
  }
  // Sin fetch handler ni rutas HTTP de administración.
};
