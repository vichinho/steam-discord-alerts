import type { Game } from '../types.ts';
export function cleanText(value: unknown, length = 180): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, length) : '';
}
export function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const u = new URL(value);
    const hosts = ['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com', 'store.akamai.steamstatic.com', 'steamcdn-a.akamaihd.net'];
    return u.protocol === 'https:' && hosts.includes(u.hostname) && !u.username && !u.password && !u.port ? u.href : null;
  } catch { return null; }
}
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function releaseDate(value: unknown): Pick<Game, 'releaseDate' | 'releasePrecision'> {
  const unknown = { releaseDate: null, releasePrecision: 'unknown' } as const;
  if (typeof value !== 'string') return unknown;
  let iso: string | null = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const a = /^(\d{1,2}) ([A-Z][a-z]{2}),? (\d{4})$/.exec(value);
  const b = /^([A-Z][a-z]{2}) (\d{1,2}),? (\d{4})$/.exec(value);
  const m = a ? months.indexOf(a[2]!) : b ? months.indexOf(b[1]!) : -1;
  if (m >= 0) iso = `${(a ?? b)![3]}-${String(m + 1).padStart(2, '0')}-${String(a ? a[1] : b![2]).padStart(2, '0')}`;
  if (iso) {
    const date = new Date(iso);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso) return { releaseDate: iso, releasePrecision: 'day' };
    return unknown;
  }
  if (/^\d{4}$/.test(value)) return { releaseDate: value, releasePrecision: 'year' };
  if (/^[A-Z][a-z]{2} \d{4}$/.test(value) && months.includes(value.slice(0, 3))) return { releaseDate: value, releasePrecision: 'month' };
  return unknown;
}
export function priceValid(g: Game): boolean {
  const { originalAmount: o, currentAmount: p, discountPercent: d } = g;
  if (o === null || p === null || d === null || !Number.isSafeInteger(o) || !Number.isSafeInteger(p) || !Number.isSafeInteger(d) || o < 0 || p < 0 || p > o || d < 0 || d > 100) return false;
  if (o === 0) return p === 0 && d === 0;
  if (d === 0) return p === o;
  if (d === 100) return p === 0;
  if (p === o || p === 0) return false;
  // Comparación entera; admite truncamiento/redondeo del porcentaje hasta un punto.
  const diff = BigInt(o - p) * 100n - BigInt(d) * BigInt(o);
  return (diff < 0n ? -diff : diff) <= BigInt(o);
}
