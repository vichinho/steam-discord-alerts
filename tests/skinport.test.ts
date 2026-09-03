import assert from 'node:assert/strict';
import test from 'node:test';
import { Budget } from '../src/budget.ts';
import { readConfig } from '../src/config.ts';
import { SkinportProvider } from '../src/providers/skinport.ts';
import { runSkinport } from '../src/skinport-engine.ts';
import type { RustItem } from '../src/types.ts';
import { LocalDatabase } from '../scripts/sqlite-local.ts';

const NOW = Date.parse('2026-09-02T18:00:00Z');
function item(overrides: Partial<RustItem> = {}): RustItem {
  return { sourceKind: 'skinport_market', itemId: 'Heat Seeker Bolt Rifle', marketHashName: 'Heat Seeker Bolt Rifle', title: 'Heat Seeker Bolt Rifle', category: null,
    itemUrl: 'https://skinport.com/rust/item/heat-seeker-bolt-rifle', imageUrl: null, country: 'GLOBAL', currency: 'USD', amountScale: 100,
    currentAmount: 134, referenceAmount: 190, dropPercent: 29, listings: 45, firstSeenAt: 1, observedAt: NOW,
    sourceUrl: 'https://api.skinport.com/v1/items', newItem: false, ...overrides };
}

test('proveedor Skinport normaliza, filtra esquema y ordena oportunidades', async () => {
  const c = readConfig(), budget = new Budget();
  const body = [
    { market_hash_name: 'Valid 20', currency: 'USD', suggested_price: 10, min_price: 8, quantity: 10, item_page: 'https://skinport.com/rust/item/valid-20', created_at: 1 },
    { market_hash_name: 'Valid 30', currency: 'USD', suggested_price: 10, min_price: 7, quantity: 12, item_page: 'https://skinport.com/rust/item/valid-30', created_at: 1 },
    { market_hash_name: 'Broken', currency: 'USD', suggested_price: null, min_price: 2, quantity: 20, item_page: 'https://skinport.com/rust/item/broken' }
  ];
  const provider = new SkinportProvider(c, budget, async () => new Response(JSON.stringify(body), { status: 200 }));
  const result = await provider.opportunities(NOW);
  assert.deepEqual(result.map(v => [v.title, v.currentAmount, v.dropPercent]), [['Valid 30', 700, 30], ['Valid 20', 800, 20]]);
  assert.equal(budget.requests, 1);
});

test('validación en nube no envía y la activación del día siguiente entrega una vez', async () => {
  const db = new LocalDatabase();
  try {
    const c = readConfig(); let sent = 0;
    c.rustItems.communityMarket.enabled = true;
    const provider = { opportunities: async () => [item()] } as SkinportProvider;
    const first = await runSkinport({ config: c, db, budget: new Budget(), provider, now: () => NOW,
      send: async () => { sent++; return { status: 'sent', messageId: '111111111111111111' }; } });
    assert.equal(first.status, 'validated_no_send'); assert.equal(sent, 0);

    c.rustItems.communityMarket.cloudValidated = true;
    const second = await runSkinport({ config: c, db, budget: new Budget(), provider, now: () => NOW + 86_400_000,
      send: async payload => { sent++; assert.match(payload.content!, /Skinport/); return { status: 'sent', messageId: '222222222222222222' }; } });
    assert.equal(second.sent, 1); assert.equal(sent, 1);
    assert.equal((db.sqlite.prepare("SELECT status FROM skinport_outbox").get() as { status: string }).status, 'sent');
    assert.equal((await runSkinport({ config: c, db, budget: new Budget(), provider, now: () => NOW + 86_400_000,
      send: async () => { sent++; return { status: 'sent', messageId: '333333333333333333' }; } })).sent, 0);
    assert.equal(sent, 1);
  } finally { db.close(); }
});
