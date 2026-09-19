import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPriceService, analyze, netProfit, distanceKm } from './priceService.js';
import { memoryRepo } from './priceRepo.js';

const svc = createPriceService(memoryRepo(() => Date.parse('2026-09-19T00:00:00Z')));

test('getPrices returns home market first with 3 markets and flags sample data', async () => {
  const d = await svc.getPrices({ crop: 'rice', region: 'IN-UP-01', home: 'rampur' });
  assert.equal(d.markets.length, 3);
  assert.equal(d.markets[0].code, 'rampur');
  assert.equal(d.markets[0].distance_km, 0);
  assert.equal(d.sample, true);
  assert.equal(d.unit, 'quintal');
  assert.equal(d.markets[0].trend.length, 7);
});

test('unknown crop or region -> null', async () => {
  assert.equal(await svc.getPrices({ crop: 'banana', region: 'IN-UP-01' }), null);
  assert.equal(await svc.getPrices({ crop: 'rice', region: 'XX-00' }), null);
});

test('analyze: rising -> wait, falling -> sell_now, flat -> hold', () => {
  assert.equal(analyze([100, 101, 103, 106]).recommendation, 'wait');
  assert.equal(analyze([106, 103, 101, 100]).recommendation, 'sell_now');
  assert.equal(analyze([100, 100, 101, 100]).recommendation, 'hold');
  assert.ok(analyze([100, 130]).reason.length <= 80);
});

test('demo data trends up so the wait advice is shown', async () => {
  const d = await svc.getPrices({ crop: 'rice', region: 'IN-UP-01', home: 'rampur' });
  assert.equal(d.analysis.recommendation, 'wait');
});

test('netProfit subtracts transport and scales by qty', () => {
  const from = { name: 'A', price: 2140, lat: 28.8, lng: 79.03 };
  const to = { name: 'B', price: 2280, lat: 28.37, lng: 79.43 };
  const n = netProfit({ from, to, qty: 5 });
  assert.equal(n.gain_per_qt, 2280 - 2140 - n.transport_per_qt);
  assert.equal(n.gain_total, n.gain_per_qt * 5);
  assert.ok(n.distance_km > 40 && n.distance_km < 100);
});

test('getNetProfit rejects unknown market', async () => {
  assert.equal(await svc.getNetProfit({ crop: 'rice', region: 'IN-UP-01', from: 'rampur', to: 'nowhere', qty: 1 }), null);
  const n = await svc.getNetProfit({ crop: 'rice', region: 'IN-UP-01', from: 'rampur', to: 'bareilly', qty: 5 });
  assert.equal(n.qty, 5);
});

test('distanceKm is ~0 for same point', () => {
  assert.equal(Math.round(distanceKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })), 0);
});

test('home market comes first even if the repo returns rows in a different order', async () => {
  const shuffled = createPriceService({
    async history(c, r) { return (await memoryRepo(() => Date.parse('2026-09-19T00:00:00Z')).history(c, r)).reverse(); },
  });
  const d = await shuffled.getPrices({ crop: 'rice', region: 'IN-UP-01', home: 'rampur' });
  assert.equal(d.markets[0].code, 'rampur');
  assert.equal(d.home, 'rampur');
  assert.equal(d.markets[0].distance_km, 0);
  assert.equal(d.markets[0].trend.length, 7);
  assert.ok(d.markets[0].trend[6] > d.markets[0].trend[0]); // oldest -> newest despite reversed input
});

test('historical database rows retain their latest date and source', async () => {
  const historical = createPriceService({
    async history() {
      return [
        { market_code: 'ceda-680', market_name: 'Rampur', lat: null, lng: null, date: '2025-10-29', modal: 3260, currency: 'INR', unit: 'quintal', source: 'agmarknet', sample: false },
        { market_code: 'ceda-680', market_name: 'Rampur', lat: null, lng: null, date: '2025-10-30', modal: 3290, currency: 'INR', unit: 'quintal', source: 'agmarknet', sample: false },
      ];
    },
  });
  const d = await historical.getPrices({ crop: 'rice', region: 'IN-CEDA-S9-D136', home: 'ceda-680' });
  assert.equal(d.date, '2025-10-30');
  assert.equal(d.source, 'agmarknet');
  assert.equal(d.sample, false);
});
