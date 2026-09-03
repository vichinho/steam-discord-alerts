import type { Config } from '../config.ts';
import type { Budget } from '../budget.ts';
import type { RustItem } from '../types.ts';
import { limitedText, retryTime, SourceError } from './http.ts';

type RawItem = Record<string, unknown>;
const integerAmount = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;

export class SkinportProvider {
  config: Config; budget: Budget; fetcher: typeof fetch;
  constructor(config: Config, budget: Budget, fetcher: typeof fetch = fetch) { this.config = config; this.budget = budget; this.fetcher = fetcher; }
  async opportunities(now = Date.now()): Promise<RustItem[]> {
    const url = new URL('https://api.skinport.com/v1/items');
    url.searchParams.set('app_id', String(this.config.rustItems.appId));
    url.searchParams.set('currency', this.config.rustItems.communityMarket.currency);
    url.searchParams.set('tradable', '1');
    this.budget.take();
    let response: Response;
    try { response = await this.fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json', 'Accept-Encoding': 'br' } }); }
    catch { throw new SourceError('SKINPORT_NETWORK'); }
    if (response.status === 429) { await response.body?.cancel(); throw new SourceError('SKINPORT_429', retryTime(response.headers.get('retry-after'), now)); }
    if (!response.ok || response.status >= 300) { await response.body?.cancel(); throw new SourceError(`SKINPORT_HTTP_${response.status}`); }
    let raw: unknown;
    try { raw = JSON.parse(await limitedText(response, 4_000_000, this.budget)); } catch (error) { if (error instanceof SourceError) throw error; throw new SourceError('SKINPORT_SCHEMA'); }
    if (!Array.isArray(raw) || raw.length > 10_000) throw new SourceError('SKINPORT_SCHEMA');
    const rules = this.config.rustItems.communityMarket;
    const items: RustItem[] = [];
    for (const value of raw as RawItem[]) {
      const current = integerAmount(value.min_price), reference = integerAmount(value.suggested_price);
      const listings = value.quantity;
      if (typeof value.market_hash_name !== 'string' || current === null || reference === null || reference <= current || !Number.isSafeInteger(listings)) continue;
      const drop = Math.floor((reference - current) * 100 / reference);
      const item: RustItem = { sourceKind: 'skinport_market', itemId: value.market_hash_name, marketHashName: value.market_hash_name, title: value.market_hash_name,
        category: null, itemUrl: typeof value.item_page === 'string' ? value.item_page : '', imageUrl: null, country: 'GLOBAL', currency: value.currency === rules.currency ? rules.currency : null,
        amountScale: rules.amountScale, currentAmount: current, referenceAmount: reference, dropPercent: drop, listings: Number(listings),
        firstSeenAt: typeof value.created_at === 'number' ? value.created_at * 1000 : null, observedAt: now, sourceUrl: url.href, newItem: false };
      items.push(item);
    }
    return items.sort((a, b) => b.dropPercent! - a.dropPercent! || a.currentAmount! - b.currentAmount! || a.title.localeCompare(b.title));
  }
}
