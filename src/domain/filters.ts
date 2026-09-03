import type { Config } from '../config.ts';
import type { Game, Kind } from '../types.ts';
import { priceValid } from './normalize.ts';
import { dayAge, localTime } from './time.ts';
export function rejection(g: Game, c: Config, kind: Kind, now: number, maxAge = 30 * 60_000): string | null {
  if (!Number.isSafeInteger(g.appId) || g.appId <= 0 || !g.title) return 'identity';
  if (g.productType !== 'game') return 'product_type';
  if (g.availableInRegion !== true || g.country !== c.country) return 'region';
  if (!Number.isFinite(g.observedAt) || g.observedAt > now || now - g.observedAt > maxAge) return 'stale';
  const f = kind === 'deal' ? c.deals : c.releases;
  if (!f.includeEarlyAccess && g.earlyAccess !== false) return 'early_access';
  if (f.genres.length && (g.genres === null || !g.genres.some(v => (f.genres as string[]).includes(v)))) return 'genre';
  if (kind === 'release') {
    if (g.comingSoon !== false || !g.releaseDate || g.releasePrecision !== 'day') return 'release_unconfirmed';
    const age = dayAge(g.releaseDate, localTime(now, c.timezone).day);
    if (!Number.isInteger(age) || age < 0 || age >= c.releases.windowDays) return 'release_window';
    return null;
  }
  if (g.currency !== c.currency || g.amountScale !== c.amountScale) return 'currency';
  if (!priceValid(g) || g.originalAmount === 0) return 'price';
  if (g.discountPercent! <= 0 || g.discountPercent! < c.deals.minDiscountPercent) return 'discount';
  if (c.deals.maxAmount !== null && g.currentAmount! > c.deals.maxAmount) return 'max_price';
  return null;
}
export function sortDeals(a: Game, b: Game): number { return b.discountPercent! - a.discountPercent! || a.currentAmount! - b.currentAmount! || a.appId - b.appId; }
