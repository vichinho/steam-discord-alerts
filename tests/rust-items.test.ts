import assert from 'node:assert/strict';
import test from 'node:test';
import { configKey, readConfig, rustItemsConfigKey } from '../src/config.ts';
import { rustItemKey, rustItemRejection, rustItemUrl } from '../src/domain/rust-items.ts';
import { rustItemMessage } from '../src/notifications/discord.ts';
import type { RustItem } from '../src/types.ts';

function official(overrides: Partial<RustItem> = {}): RustItem {
  return {
    sourceKind: 'rust_official_store', itemId: 'official:test', marketHashName: null,
    title: 'Objeto oficial ficticio', category: 'skin', itemUrl: 'https://rust.facepunch.com/store/', imageUrl: null,
    country: 'CL', currency: 'CLP', amountScale: 100, currentAmount: 800000, referenceAmount: 1000000,
    dropPercent: 20, listings: null, firstSeenAt: 1, observedAt: 2, sourceUrl: 'https://rust.facepunch.com/store/', newItem: false,
    ...overrides
  };
}

function market(overrides: Partial<RustItem> = {}): RustItem {
  return {
    sourceKind: 'skinport_market', itemId: 'Test Skin', marketHashName: 'Test Skin',
    title: 'Skin ficticia', category: 'skin', itemUrl: 'https://skinport.com/rust/item/test-skin', imageUrl: null,
    country: 'GLOBAL', currency: 'USD', amountScale: 100, currentAmount: 800, referenceAmount: 1000,
    dropPercent: 20, listings: 10, firstSeenAt: 1, observedAt: 2, sourceUrl: 'https://api.skinport.com/v1/items', newItem: false,
    ...overrides
  };
}

test('Skinport queda bloqueado hasta elegir ejecutor y tiene clave separada', () => {
  const config = readConfig();
  assert.equal(config.rustItems.officialStore.enabled, false);
  assert.equal(config.rustItems.communityMarket.enabled, false);
  assert.equal(config.rustItems.communityMarket.cloudValidated, false);
  const gameKey = configKey(config), rustKey = rustItemsConfigKey(config);
  config.rustItems.communityMarket.minDropPercent = 25;
  assert.equal(configKey(config), gameKey);
  assert.notEqual(rustItemsConfigKey(config), rustKey);
  assert.throws(() => readConfig({ ...config, rustItems: { ...config.rustItems, appId: 1 } }), /INVALID_CONFIG/);
});

test('tienda oficial acepta novedades y descuentos inclusive', () => {
  const config = readConfig();
  assert.equal(rustItemRejection(official({ currentAmount: 900000, dropPercent: 10 }), config), null);
  assert.equal(rustItemRejection(official({ currentAmount: 910000, dropPercent: 9 }), config), 'discount');
  assert.equal(rustItemRejection(official({ currentAmount: 990000, dropPercent: 20 }), config), 'discount');
  assert.equal(rustItemRejection(official({ newItem: true, referenceAmount: null, dropPercent: null }), config), null);
  config.rustItems.officialStore.includeNewItems = false;
  assert.equal(rustItemRejection(official({ newItem: true, referenceAmount: null, dropPercent: null }), config), 'new_item');
});

test('Skinport exige USD, referencia suficiente y liquidez', () => {
  const config = readConfig();
  assert.equal(rustItemRejection(market(), config), null);
  assert.equal(rustItemRejection(market({ dropPercent: 19 }), config), 'drop');
  assert.equal(rustItemRejection(market({ listings: 9 }), config), 'liquidity');
  assert.equal(rustItemRejection(market({ currency: 'CLP' }), config), 'region_currency');
  assert.equal(rustItemRejection(market({ referenceAmount: null }), config), 'history');
});

test('objetos restringen host, appid, mensajes y claves', () => {
  const config = readConfig(), item = market();
  assert.ok(rustItemUrl(item));
  assert.ok(rustItemUrl(official({ itemUrl: 'https://store.steampowered.com/itemstore/252490/' })));
  assert.equal(rustItemUrl(market({ itemUrl: 'https://example.com/rust/item/test' })), null);
  assert.equal(rustItemUrl(market({ itemUrl: 'https://skinport.com/cs2/item/test' })), null);
  const payload = rustItemMessage(item, config);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.match(payload.embeds![0]!.title, /^SKINPORT · RUST/);
  assert.match(rustItemKey(config.destinationId, item, '2026-09-01'), /^rust-item:/);
});
