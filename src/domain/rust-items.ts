import type { Config } from '../config.ts';
import type { RustItem } from '../types.ts';

function validAmount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function validDrop(current: number, reference: number | null, drop: number | null): boolean {
  if (!validAmount(reference) || reference <= 0 || current >= reference || drop === null || !Number.isSafeInteger(drop) || drop < 1 || drop > 100) return false;
  const difference = BigInt(reference - current) * 100n - BigInt(drop) * BigInt(reference);
  return (difference < 0n ? -difference : difference) <= BigInt(reference);
}

export function rustItemUrl(item: RustItem): string | null {
  try {
    const url = new URL(item.itemUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (item.sourceKind === 'rust_official_store') {
      if (url.hostname === 'rust.facepunch.com' && url.pathname.startsWith('/store')) return url.href;
      if (url.hostname === 'store.steampowered.com' && url.pathname.startsWith('/itemstore/252490')) return url.href;
      return null;
    }
    return url.hostname === 'skinport.com' && url.pathname.startsWith('/rust/item/') ? url.href : null;
  } catch { return null; }
}

export function rustItemRejection(item: RustItem, config: Config): string | null {
  if (!item.itemId || item.itemId.length > 180 || !item.title || !rustItemUrl(item)) return 'identity';
  if (!validAmount(item.currentAmount)) return 'price';

  if (item.sourceKind === 'rust_official_store') {
    if (item.country !== config.country || item.currency !== config.currency || item.amountScale !== config.amountScale) return 'region_currency';
    const rules = config.rustItems.officialStore;
    if (rules.maxAmount !== null && item.currentAmount > rules.maxAmount) return 'max_price';
    if (item.newItem) return rules.includeNewItems ? null : 'new_item';
    if (!validDrop(item.currentAmount, item.referenceAmount, item.dropPercent)) return 'discount';
    return item.dropPercent! >= rules.minDiscountPercent ? null : 'discount';
  }

  const rules = config.rustItems.communityMarket;
  if (item.country !== 'GLOBAL' || item.currency !== rules.currency || item.amountScale !== rules.amountScale) return 'region_currency';
  if (item.marketHashName === null || item.marketHashName.length < 1 || item.marketHashName.length > 120) return 'market_name';
  if (rules.maxAmount !== null && item.currentAmount > rules.maxAmount) return 'max_price';
  if (!Number.isSafeInteger(item.listings) || item.listings! < rules.minListings) return 'liquidity';
  if (!validDrop(item.currentAmount, item.referenceAmount, item.dropPercent)) return 'history';
  return item.dropPercent! >= rules.minDropPercent ? null : 'drop';
}

export function rustItemKey(destination: string, item: RustItem, referenceDay: string): string {
  return ['rust-item', destination, item.country, item.sourceKind, encodeURIComponent(item.itemId), referenceDay, item.currentAmount].join(':');
}
