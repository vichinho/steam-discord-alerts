import type { DealState, Game } from '../types.ts';
import { DAY } from './time.ts';
import { priceValid } from './normalize.ts';
export function observeDeal(g: Game, previous: DealState | undefined, baseline: boolean): DealState {
  const s: DealState = previous ? { ...previous } : { appId: g.appId, country: g.country, period: 1, active: false, lastAmount: null, lastNotifiedAt: null, lastCurrency: null, lastScale: null };
  if (g.availableInRegion !== true || !g.currency || !priceValid(g)) return s;
  if (g.discountPercent === 0) s.active = false;
  else {
    if (!s.active && previous) { s.period++; s.lastAmount = null; s.lastNotifiedAt = null; }
    s.active = true;
    if (baseline) { s.lastAmount = g.currentAmount; s.lastNotifiedAt = g.observedAt; s.lastCurrency = g.currency; s.lastScale = g.amountScale; }
  }
  return s;
}
export function shouldAnnounce(g: Game, s: DealState, now: number): boolean {
  return s.active && (s.lastAmount === null || (s.lastCurrency === g.currency && s.lastScale === g.amountScale && g.currentAmount! < s.lastAmount && s.lastNotifiedAt !== null && now - s.lastNotifiedAt >= DAY));
}
export function dealKey(destination: string, g: Game, state: DealState): string {
  return `deal:${destination}:${g.country}:${g.appId}:${state.period}:${g.currency}:${g.amountScale}:${g.currentAmount}`;
}
