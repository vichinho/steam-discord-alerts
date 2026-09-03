import defaults from '../config/bot.json' with { type: 'json' };
export interface Config {
  version: number; enabled: boolean; sendEnabled: boolean; destinationId: string; webhookId: string | null;
  country: string; currency: string; amountScale: number; language: string; timezone: string;
  deals: { mode: 'instant' | 'daily-digest'; minDiscountPercent: number; maxAmount: number | null; genres: string[]; includeEarlyAccess: boolean; perRun: number; perDay: number; digestAt: string; maxItems: number; repeatWindowDays: number };
  releases: { genres: string[]; includeEarlyAccess: boolean; windowDays: number; discoveryHours: number; digestAt: string; maxItems: number };
  rustItems: {
    appId: number;
    officialStore: { enabled: boolean; accessReviewed: boolean; coverageAccepted: boolean; cloudValidated: boolean; checkHours: number; minDiscountPercent: number; maxAmount: number | null; includeNewItems: boolean; perRun: number; perDay: number };
    communityMarket: { enabled: boolean; accessReviewed: boolean; coverageAccepted: boolean; cloudValidated: boolean; currency: string; amountScale: number; digestAt: string; checkMinutes: number; minDropPercent: number; historyDays: number; maxAmount: number | null; minListings: number; watchedMarketHashNames: string[]; discoveryLimit: number; perRun: number; perDay: number };
  };
  source: { kind: string; enabled: boolean; accessReviewed: boolean; coverageAccepted: boolean; cloudValidated: boolean; pageSize: number; maxPages: number; coverage: string };
}
export function readConfig(input: unknown = defaults): Config {
  const c = structuredClone(input) as Config;
  const fail = () => { throw new Error('INVALID_CONFIG'); };
  if (!c || typeof c !== 'object' || !c.deals || !c.releases || !c.rustItems?.officialStore || !c.rustItems?.communityMarket || !c.source) fail();
  const int = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
  if (!int(c.version, 1, 1000000) || !/^[A-Z]{2}$/.test(c.country) || !/^[A-Z]{3}$/.test(c.currency)) fail();
  if (![1, 10, 100, 1000].includes(c.amountScale) || !/^[a-zA-Z0-9_-]{1,100}$/.test(c.destinationId)) fail();
  const official = c.rustItems.officialStore, market = c.rustItems.communityMarket;
  for (const flag of [c.enabled, c.sendEnabled, c.source.enabled, c.source.accessReviewed, c.source.coverageAccepted, c.source.cloudValidated, c.deals.includeEarlyAccess, c.releases.includeEarlyAccess,
    official.enabled, official.accessReviewed, official.coverageAccepted, official.cloudValidated, official.includeNewItems,
    market.enabled, market.accessReviewed, market.coverageAccepted, market.cloudValidated]) if (typeof flag !== 'boolean') fail();
  if (!['instant', 'daily-digest'].includes(c.deals.mode) || !int(c.deals.minDiscountPercent, 0, 100) || !int(c.deals.perRun, 1, 5) || !int(c.deals.perDay, 1, 20) || !int(c.deals.maxItems, 1, 10) || !int(c.deals.repeatWindowDays, 1, 30)) fail();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.deals.digestAt)) fail();
  if (c.deals.maxAmount !== null && !int(c.deals.maxAmount, 0, Number.MAX_SAFE_INTEGER)) fail();
  if (!int(c.releases.maxItems, 1, 10) || !int(c.releases.windowDays, 1, 7) || !int(c.releases.discoveryHours, 6, 168)) fail();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.releases.digestAt)) fail();
  if (c.rustItems.appId !== 252490 || !int(official.checkHours, 1, 168) || !int(official.minDiscountPercent, 1, 100) || !int(official.perRun, 1, 5) || !int(official.perDay, 1, 20)) fail();
  if (official.maxAmount !== null && !int(official.maxAmount, 0, Number.MAX_SAFE_INTEGER)) fail();
  if (market.currency !== 'USD' || market.amountScale !== 100 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(market.digestAt) || !int(market.checkMinutes, 30, 1440) || !int(market.minDropPercent, 1, 100) || !int(market.historyDays, 1, 90) || !int(market.minListings, 1, 1000000) || !int(market.discoveryLimit, 1, 50) || !int(market.perRun, 1, 5) || !int(market.perDay, 1, 20)) fail();
  if (market.maxAmount !== null && !int(market.maxAmount, 0, Number.MAX_SAFE_INTEGER)) fail();
  if (!Array.isArray(market.watchedMarketHashNames) || market.watchedMarketHashNames.length > 50 || new Set(market.watchedMarketHashNames).size !== market.watchedMarketHashNames.length || !market.watchedMarketHashNames.every(name => typeof name === 'string' && name.length >= 1 && name.length <= 120 && !/[\u0000-\u001f\u007f]/.test(name))) fail();
  if (!int(c.source.pageSize, 1, 10) || !int(c.source.maxPages, 1, 5) || c.source.kind !== 'steam-store-experimental') fail();
  for (const genres of [c.deals.genres, c.releases.genres]) if (!Array.isArray(genres) || !genres.every(g => typeof g === 'string' && /^\d{1,5}$/.test(g))) fail();
  try { new Intl.DateTimeFormat(c.language, { timeZone: c.timezone }); } catch { fail(); }
  if (c.webhookId !== null && !/^\d{17,22}$/.test(c.webhookId)) fail();
  if (c.sendEnabled && (!c.enabled || !c.source.enabled || !c.source.accessReviewed || !c.source.coverageAccepted || !c.source.cloudValidated || !c.webhookId || !/^\d{17,22}$/.test(c.destinationId))) fail();
  return c;
}
// Horarios y cupos no invalidan la historia. Cualquier cambio de filtros reconstruye la línea base.
export function configKey(c: Config): string {
  return JSON.stringify([c.destinationId, c.country, c.currency, c.amountScale,
    c.deals.mode, c.deals.minDiscountPercent, c.deals.maxAmount, [...c.deals.genres].sort(), c.deals.includeEarlyAccess,
    [...c.releases.genres].sort(), c.releases.includeEarlyAccess, c.releases.windowDays,
    c.source.kind, c.source.pageSize, c.source.maxPages]);
}
export function rustItemsConfigKey(c: Config): string {
  const o = c.rustItems.officialStore, m = c.rustItems.communityMarket;
  return JSON.stringify([c.destinationId, c.country, c.currency, c.amountScale, c.rustItems.appId,
    o.minDiscountPercent, o.maxAmount, o.includeNewItems,
    m.currency, m.amountScale, m.minDropPercent, m.maxAmount, m.minListings, m.discoveryLimit]);
}
