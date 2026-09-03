import type { Config } from '../config.ts';
import type { Budget } from '../budget.ts';
import type { DiscordPayload, Game, RustItem } from '../types.ts';
import { cleanText, priceValid, safeImage } from '../domain/normalize.ts';
import { rustItemUrl } from '../domain/rust-items.ts';
import { limitedText, retryTime, SourceError } from '../providers/http.ts';
export function escapeTitle(value: string, max = 180): string {
  let result = '';
  for (const char of cleanText(value, max)) {
    const escaped = /[\\`*_{}\[\]()<>~|]/.test(char) ? '\\' + char : char === '@' ? '@\u200b' : char;
    if (result.length + escaped.length > max) break;
    result += escaped;
  }
  return result;
}
export function money(amount: number, scale: number, currency: string): string {
  const n = BigInt(amount), s = BigInt(scale);
  const whole = (n / s).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = n % s;
  return `$${whole}${fraction ? ',' + fraction.toString().padStart(String(scale).length - 1, '0') : ''} ${currency}`;
}
export function dealMessage(g: Game, c: Config): DiscordPayload {
  const description = [`${g.discountPercent} % de descuento`, `Antes: ${money(g.originalAmount!, g.amountScale, g.currency!)} · Ahora: ${money(g.currentAmount!, g.amountScale, g.currency!)}`,
    g.earlyAccess ? 'Acceso anticipado' : null, `Precio observado en Steam ${c.country === 'CL' ? 'Chile' : c.country}`,
    g.currentAmount === 0 ? 'Precio observado: cero; no confirma un regalo para conservar.' : null,
    g.promotionEndsAt ? `Fin informado: <t:${Math.floor(g.promotionEndsAt / 1000)}:f>` : null].filter(Boolean).join('\n');
  const img = safeImage(g.imageUrl);
  return { embeds: [{ title: `OFERTA · ${escapeTitle(g.title)}`, description, url: `https://store.steampowered.com/app/${g.appId}/`, color: 0x66c0f4, ...(img ? { image: { url: img } } : {}) }], allowed_mentions: { parse: [] } };
}
export function dealDigestMessage(games: Game[], omitted: number, day: string, c: Config): DiscordPayload {
  const region = c.country === 'CL' ? 'Chile' : c.country;
  const date = new Intl.DateTimeFormat(c.language, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  }).format(new Date(`${day}T12:00:00Z`));
  const embeds: NonNullable<DiscordPayload['embeds']> = games.slice(0, 10).map((g, index) => {
    const url = `https://store.steampowered.com/app/${g.appId}/`;
    const img = safeImage(g.imageUrl);
    const oldPrice = money(g.originalAmount!, g.amountScale, g.currency!);
    const currentPrice = money(g.currentAmount!, g.amountScale, g.currency!);
    const notes = [
      `### 🏷️ ${g.discountPercent} % de descuento`,
      `~~Antes: ${oldPrice}~~`,
      `### Ahora: ${currentPrice}`,
      g.earlyAccess ? 'Acceso anticipado' : null,
      `[Ver en Steam ↗](${url})`
    ].filter(Boolean);
    return {
      title: `${index + 1}. ${escapeTitle(g.title, 150)}`,
      description: notes.join('\n'),
      url,
      color: 0x66c0f4,
      ...(img ? { thumbnail: { url: img } } : {})
    };
  });
  const extra = omitted > 0 ? ` · ${omitted} candidatos omitidos` : '';
  const info = `Cobertura parcial · Próxima revisión mañana${extra}`;
  if (embeds.length < 10) embeds.push({
    title: `ℹ️ Selección diaria · Región: ${region}`,
    description: info,
    color: 0x66c0f4
  });
  return {
    content: `## 🔥 Ofertas destacadas de Steam — ${region}\n**${date}** · Precios verificados en ${c.currency}${embeds.length === 10 ? `\nℹ️ Selección diaria · ${info}` : ''}`,
    embeds,
    allowed_mentions: { parse: [] }
  };
}
export function releaseMessage(games: Game[], omitted: number, day: string, c: Config): DiscordPayload {
  const lines = games.map(g => {
    const price = g.currency === c.currency && g.amountScale === c.amountScale && priceValid(g) ? ` — ${money(g.currentAmount!, g.amountScale, g.currency!)}` : '';
    return `[${escapeTitle(g.title, 100)}](https://store.steampowered.com/app/${g.appId}/)${g.earlyAccess ? ' — Acceso anticipado' : ''} — Lanzado el ${g.releaseDate}${price}`;
  });
  if (omitted) lines.push(`${omitted} candidatos verificados quedaron fuera de este resumen.`);
  lines.push('Cobertura parcial de la fuente; no representa todos los estrenos de Steam.');
  return { embeds: [{ title: `ESTRENOS · ${day}`, description: lines.join('\n'), color: 0xa4d007 }], allowed_mentions: { parse: [] } };
}
export function rustItemMessage(item: RustItem, c: Config): DiscordPayload {
  const url = rustItemUrl(item);
  const expectedCurrency = item.sourceKind === 'skinport_market' ? c.rustItems.communityMarket.currency : c.currency;
  const expectedScale = item.sourceKind === 'skinport_market' ? c.rustItems.communityMarket.amountScale : c.amountScale;
  if (!url || item.currentAmount === null || item.currency !== expectedCurrency || item.amountScale !== expectedScale) throw new Error('INVALID_RUST_ITEM');
  const source = item.sourceKind === 'rust_official_store' ? 'TIENDA OFICIAL DE RUST' : 'SKINPORT · RUST';
  const lines = [
    `Ahora: ${money(item.currentAmount, item.amountScale, item.currency)}`,
    item.referenceAmount !== null ? `Referencia: ${money(item.referenceAmount, item.amountScale, item.currency)}` : null,
    item.dropPercent !== null ? `Bajada verificada: ${item.dropPercent} %` : null,
    item.listings !== null ? `${item.listings} anuncios disponibles` : null,
    item.newItem ? 'Artículo nuevo' : null,
    item.sourceKind === 'skinport_market' ? `Comparación con el precio sugerido de Skinport; no es un descuento oficial ni una recomendación de compra.` : 'Promoción o novedad de la tienda oficial.'
  ].filter(Boolean).join('\n');
  const img = safeImage(item.imageUrl);
  return { embeds: [{ title: `${source} · ${escapeTitle(item.title)}`, description: lines, url, color: 0xce422b, ...(img ? { image: { url: img } } : {}) }], allowed_mentions: { parse: [] } };
}

export function skinportDigestMessage(items: RustItem[], day: string, c: Config): DiscordPayload {
  const embeds: NonNullable<DiscordPayload['embeds']> = items.slice(0, c.rustItems.communityMarket.perRun).map((item, index) => {
    const url = rustItemUrl(item);
    if (!url || item.currentAmount === null || item.referenceAmount === null || item.currency !== 'USD') throw new Error('INVALID_SKINPORT_ITEM');
    return {
      title: `${index + 1}. ${escapeTitle(item.title, 150)}`,
      description: [
        `### 🏷️ ${item.dropPercent} % bajo precio sugerido`,
        `~~Referencia: ${money(item.referenceAmount, item.amountScale, item.currency)}~~`,
        `### Desde: ${money(item.currentAmount, item.amountScale, item.currency)}`,
        `${item.listings} unidades disponibles`,
        `[Ver en Skinport ↗](${url})`
      ].join('\n'),
      url,
      color: 0xce422b
    };
  });
  embeds.push({ title: 'ℹ️ Cómo se calcula', description: 'Precio mínimo frente al precio sugerido de Skinport · Mercado global en USD · No es una rebaja oficial de Steam.', color: 0xce422b });
  return { content: `## 🛢️ Oportunidades de objetos de Rust — Skinport\n**${day}** · Selección diaria`, embeds, allowed_mentions: { parse: [] } };
}
export type SendResult = { status: 'sent'; messageId: string } | { status: 'retry'; retryAt: number; error: string } | { status: 'uncertain' | 'failed'; error: string; pause?: boolean };
export function webhookUrl(secret: string, expectedId: string): URL {
  let u: URL; try { u = new URL(secret); } catch { throw new Error('INVALID_WEBHOOK'); }
  const m = /^\/api(?:\/v10)?\/webhooks\/(\d{17,22})\/([A-Za-z0-9._-]+)$/.exec(u.pathname);
  if (u.protocol !== 'https:' || u.hostname !== 'discord.com' || u.port || u.username || u.password || u.hash || u.search || !m || m[1] !== expectedId) throw new Error('INVALID_WEBHOOK');
  u.searchParams.set('wait', 'true'); return u;
}
export async function verifyDestination(secret: string, c: Config, budget: Budget, fetcher: typeof fetch = fetch): Promise<boolean> {
  const url = webhookUrl(secret, c.webhookId!); url.search = ''; budget.take();
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      throw new SourceError(`WEBHOOK_PREFLIGHT_${response.status}`, retryTime(response.headers.get('retry-after'), Date.now()));
    }
    if (!response.ok) { await response.body?.cancel(); return false; }
    const body = JSON.parse(await limitedText(response, 32000));
    return body.id === c.webhookId && body.channel_id === c.destinationId && body.type === 1;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('WEBHOOK_PREFLIGHT_NETWORK', Date.now() + 30 * 60_000);
  }
}
export async function sendDiscord(payload: DiscordPayload, secret: string, c: Config, budget: Budget, now: number, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const url = webhookUrl(secret, c.webhookId!);
  budget.take();
  try {
    const r = await fetcher(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }) });
    if ([401, 403, 404].includes(r.status)) { await r.body?.cancel(); return { status: 'failed', pause: true, error: `DISCORD_${r.status}` }; }
    if (r.status === 429) {
      let retryAt = retryTime(r.headers.get('retry-after'), now);
      try { const data = JSON.parse(await limitedText(r, 16000)); if (typeof data.retry_after === 'number' && Number.isFinite(data.retry_after) && data.retry_after >= 0) retryAt = Math.max(retryAt, now + Math.ceil(data.retry_after * 1000)); } catch { /* Espera conservadora. */ }
      return { status: 'retry', retryAt, error: 'DISCORD_429' };
    }
    if (r.status >= 500 || (r.status >= 300 && r.status < 400)) { await r.body?.cancel(); return { status: 'uncertain', error: 'DISCORD_AMBIGUOUS_RESPONSE' }; }
    if (!r.ok) { await r.body?.cancel(); return { status: 'failed', error: `DISCORD_${r.status}` }; }
    const data = JSON.parse(await limitedText(r, 32000));
    if (typeof data.id !== 'string' || !/^\d{17,22}$/.test(data.id)) return { status: 'uncertain', error: 'DISCORD_MISSING_ID' };
    if (data.channel_id !== c.destinationId) return { status: 'uncertain', pause: true, error: 'DISCORD_DESTINATION_MISMATCH' };
    return { status: 'sent', messageId: data.id };
  } catch { return { status: 'uncertain', error: 'DISCORD_NETWORK_OR_RESPONSE' }; }
}
