import type { Config } from '../config.ts';
import type { Budget } from '../budget.ts';
import type { Cursor, Discovery, Game, Kind, Provider } from '../types.ts';
import { cleanText, releaseDate, safeImage } from '../domain/normalize.ts';
import { SourceError, steamJson } from './http.ts';
type ObjectValue = Record<string, unknown>;
const obj = (v: unknown): ObjectValue | null => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as ObjectValue : null;
const integer = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function normalizeSteam(raw: unknown, appId: number, country: string, now: number): Game {
  const envelope = obj(obj(raw)?.[String(appId)]);
  if (!envelope || typeof envelope.success !== 'boolean') throw new SourceError('STEAM_SCHEMA');
  const sourceUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${country.toLowerCase()}&l=english`;
  const base: Game = { appId, title: '', storeUrl: `https://store.steampowered.com/app/${appId}/`, imageUrl: null, productType: 'unknown', genres: null, earlyAccess: null,
    country, currency: null, originalAmount: null, currentAmount: null, discountPercent: null, amountScale: 100,
    releaseDate: null, releasePrecision: 'unknown', comingSoon: null, availableInRegion: null, observedAt: now, source: 'steam-store-experimental', sourceUrl, promotionEndsAt: null };
  // success=false no distingue restricción regional, app retirada y datos ausentes.
  if (!envelope.success) return base;
  const d = obj(envelope.data);
  if (!d || d.steam_appid !== appId || typeof d.name !== 'string' || typeof d.type !== 'string') throw new SourceError('STEAM_SCHEMA');
  const price = obj(d.price_overview), release = obj(d.release_date);
  const genres = Array.isArray(d.genres) && d.genres.every(v => typeof obj(v)?.id === 'string') ? d.genres.map(v => String(obj(v)!.id)) : null;
  // Una ficha accesible no demuestra que el juego pueda adquirirse en la región.
  // Precio regional explícito, o is_free=true y ficha disponible, son la evidencia del adaptador experimental.
  const availability = typeof price?.currency === 'string' || d.is_free === true ? true : null;
  return { ...base, title: cleanText(d.name), productType: ['game','dlc','demo','software','music'].includes(d.type) ? d.type as Game['productType'] : 'unknown',
    genres, earlyAccess: genres ? genres.includes('70') : null, imageUrl: safeImage(d.header_image),
    currency: typeof price?.currency === 'string' ? price.currency : null,
    originalAmount: integer(price?.initial), currentAmount: integer(price?.final), discountPercent: integer(price?.discount_percent),
    ...releaseDate(release?.date), comingSoon: typeof release?.coming_soon === 'boolean' ? release.coming_soon : null, availableInRegion: availability };
}
export function searchIds(raw: unknown): { ids: number[]; total: number } {
  const d = obj(raw);
  if (!d || ![1, true].includes(d.success as number) || typeof d.results_html !== 'string' || integer(d.total_count) === null) throw new SourceError('STEAM_SEARCH_SCHEMA');
  const html = d.results_html;
  const ids = [...html.matchAll(/<a\b[^>]*\bdata-ds-appid="(\d+)"[^>]*>/g)].map(m => Number(m[1])).filter(Number.isSafeInteger);
  if (Number(d.total_count) > 0 && !ids.length) throw new SourceError('STEAM_SEARCH_SCHEMA');
  return { ids: [...new Set(ids)], total: Number(d.total_count) };
}
export class SteamProvider implements Provider {
  config: Config; budget: Budget; fetcher: typeof fetch; clock: () => number;
  constructor(config: Config, budget: Budget, fetcher: typeof fetch = fetch, clock = Date.now) { this.config = config; this.budget = budget; this.fetcher = fetcher; this.clock = clock; }
  async discover(kind: Kind, input: Cursor, limit: number): Promise<Discovery> {
    const c = this.config; const cursor = structuredClone(input); let discovered = 0;
    if (!cursor.pending.length) {
      const u = new URL('https://store.steampowered.com/search/results/');
      for (const [k, v] of Object.entries({ query: '', start: String(cursor.offset), count: String(c.source.pageSize), category1: '998', cc: c.country.toLowerCase(), l: 'english', json: '1', infinite: '1', sort_by: kind === 'release' ? 'Released_DESC' : 'Reviews_DESC', ...(kind === 'deal' ? { specials: '1' } : {}) })) u.searchParams.set(k, v);
      const page = searchIds(await steamJson(u, this.budget, this.fetcher));
      // La tienda puede ignorar count y devolver 25 filas. Solo admitimos la ventana solicitada.
      discovered = page.ids.length; cursor.pending = page.ids.slice(0, c.source.pageSize);
      cursor.offset += c.source.pageSize;
      cursor.end = cursor.offset >= Math.min(page.total, c.source.pageSize * c.source.maxPages);
    }
    const ids = cursor.pending.splice(0, limit);
    const completedCycle = cursor.end && cursor.pending.length === 0;
    return { ids, discovered, completedCycle, cursor: completedCycle ? { offset: 0, pending: [], end: false } : cursor };
  }
  async detail(appId: number): Promise<Game> {
    if (!Number.isSafeInteger(appId) || appId <= 0) throw new SourceError('INVALID_APP_ID');
    this.budget.detail();
    return normalizeSteam(await steamJson(new URL(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${this.config.country.toLowerCase()}&l=english`), this.budget, this.fetcher), appId, this.config.country, this.clock());
  }
}
