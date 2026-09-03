const BASE_APP_ID = 252490;
const MAX_PRODUCTS = 10;
const endpoint = (appId: number) => `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=cl&l=spanish`;

async function json(appId: number): Promise<any> {
  const response = await fetch(endpoint(appId), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`STEAM_${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 512_000) throw new Error('STEAM_RESPONSE_TOO_LARGE');
  return JSON.parse(text)?.[appId]?.data ?? null;
}

const base = await json(BASE_APP_ID);
if (!base || !Array.isArray(base.dlc)) throw new Error('RUST_DLC_LIST_UNAVAILABLE');

const ids = base.dlc.filter((id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0).slice(0, MAX_PRODUCTS);
const products = [];
for (const id of ids) {
  const data = await json(id);
  const price = data?.price_overview;
  products.push({
    appId: id,
    name: typeof data?.name === 'string' ? data.name : null,
    type: data?.type ?? null,
    currency: price?.currency ?? null,
    initial: Number.isSafeInteger(price?.initial) ? price.initial : null,
    final: Number.isSafeInteger(price?.final) ? price.final : null,
    discountPercent: Number.isSafeInteger(price?.discount_percent) ? price.discount_percent : null,
    available: data?.release_date?.coming_soon === false,
    url: `https://store.steampowered.com/app/${id}/`
  });
}

console.log(JSON.stringify({
  observedAt: new Date().toISOString(),
  country: 'CL',
  currencyExpected: 'CLP',
  baseAppId: BASE_APP_ID,
  totalRelatedDlc: base.dlc.length,
  checked: products.length,
  coverage: `Primeros ${MAX_PRODUCTS} identificadores relacionados devueltos por la ficha de Rust; prueba parcial`,
  products
}, null, 2));
