import { readConfig } from '../src/config.ts';
import { Budget } from '../src/budget.ts';
import { rejection, sortDeals } from '../src/domain/filters.ts';
import { money } from '../src/notifications/discord.ts';
import { SteamProvider } from '../src/providers/steam.ts';

const c = readConfig();
if (!c.source.accessReviewed || !c.source.coverageAccepted) throw new Error('STEAM_SOURCE_NOT_ACCEPTED');
const budget = new Budget();
const provider = new SteamProvider(c, budget);
const page = await provider.discover('deal', { offset: 0, pending: [], end: false }, c.deals.maxItems);
const checked = [];
for (const appId of page.ids) checked.push(await provider.detail(appId));
const eligible = checked.filter(game => !rejection(game, c, 'deal', Date.now())).sort(sortDeals);
console.log(JSON.stringify({
  observedAt: new Date().toISOString(), country: c.country, currency: c.currency,
  coverage: c.source.coverage, discoveredOnPage: page.discovered, checked: checked.length,
  omitted: checked.length - eligible.length,
  deals: eligible.map(game => ({ appId: game.appId, title: game.title, discountPercent: game.discountPercent,
    previous: money(game.originalAmount!, game.amountScale, game.currency!), current: money(game.currentAmount!, game.amountScale, game.currency!), url: game.storeUrl })),
  metrics: { requests: budget.requests, details: budget.details, responseBytes: budget.responseBytes }
}, null, 2));
