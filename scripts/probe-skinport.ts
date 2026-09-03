const url = new URL('https://api.skinport.com/v1/items');
url.searchParams.set('app_id', '252490');
url.searchParams.set('currency', 'USD');
url.searchParams.set('tradable', '1');

const response = await fetch(url, {
  redirect: 'error',
  signal: AbortSignal.timeout(20_000),
  headers: { Accept: 'application/json', 'Accept-Encoding': 'br' }
});
if (!response.ok) throw new Error(`SKINPORT_${response.status}`);
const text = await response.text();
const bytes = Buffer.byteLength(text);
if (bytes > 16_000_000) throw new Error('SKINPORT_RESPONSE_TOO_LARGE');
const data = JSON.parse(text);
if (!Array.isArray(data)) throw new Error('SKINPORT_SCHEMA');

const opportunities = data.flatMap((item: any) => {
  const suggested = item?.suggested_price;
  const current = item?.min_price;
  const quantity = item?.quantity;
  if (item?.currency !== 'USD' || typeof item?.market_hash_name !== 'string' ||
      typeof suggested !== 'number' || !Number.isFinite(suggested) || suggested <= 0 ||
      typeof current !== 'number' || !Number.isFinite(current) || current < 0 ||
      !Number.isSafeInteger(quantity) || quantity < 10) return [];
  const dropPercent = Math.floor((suggested - current) * 100 / suggested);
  if (dropPercent < 20) return [];
  let itemPage: URL;
  try { itemPage = new URL(item.item_page); } catch { return []; }
  if (itemPage.protocol !== 'https:' || itemPage.hostname !== 'skinport.com') return [];
  return [{
    name: item.market_hash_name,
    suggestedPriceUsd: suggested,
    currentPriceUsd: current,
    dropPercent,
    quantity,
    itemPage: itemPage.toString(),
    updatedAt: item.updated_at ?? null
  }];
}).sort((a, b) => b.dropPercent - a.dropPercent || a.currentPriceUsd - b.currentPriceUsd || a.name.localeCompare(b.name));

console.log(JSON.stringify({
  observedAt: new Date().toISOString(),
  status: response.status,
  contentEncoding: response.headers.get('content-encoding'),
  decompressedBytes: bytes,
  items: data.length,
  rule: { currency: 'USD', minDropPercent: 20, minQuantity: 10 },
  eligible: opportunities.length,
  top: opportunities.slice(0, 10)
}, null, 2));
