import type { Budget } from '../budget.ts';
export class SourceError extends Error {
  code: string; retryAt: number | null;
  constructor(code: string, retryAt: number | null = null) { super(code); this.code = code; this.retryAt = retryAt; }
}
export function retryTime(value: string | null, now: number): number {
  const n = value !== null && value.trim() !== '' ? Number(value) : NaN;
  if (Number.isFinite(n) && n >= 0) return now + Math.ceil(n * 1000);
  const date = Date.parse(value ?? '');
  return Number.isFinite(date) ? Math.max(now, date) : now + 30 * 60_000;
}
export async function limitedText(response: Response, max: number, budget?: Budget): Promise<string> {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new SourceError('RESPONSE_TOO_LARGE'); }
  if (!response.body) throw new SourceError('EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new SourceError('RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (budget) budget.responseBytes += size;
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function steamJson(url: URL, budget: Budget, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (url.protocol !== 'https:' || url.hostname !== 'store.steampowered.com' || url.port || url.username || url.password) throw new SourceError('SOURCE_HOST');
  budget.take();
  try {
    const r = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (r.status === 429) { await r.body?.cancel(); throw new SourceError('STEAM_429', retryTime(r.headers.get('retry-after'), Date.now())); }
    if (!r.ok || r.status >= 300) { await r.body?.cancel(); throw new SourceError(`STEAM_HTTP_${r.status}`); }
    const value = await limitedText(r, 256_000, budget);
    try { return JSON.parse(value); } catch { throw new SourceError('STEAM_SCHEMA'); }
  } catch (e) { if (e instanceof SourceError) throw e; throw new SourceError('STEAM_NETWORK'); }
}
