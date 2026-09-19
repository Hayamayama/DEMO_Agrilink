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

test('analyze states where the price sits against its recent average, without a forecast', () => {
  assert.equal(analyze([100, 101, 103, 106]).recommendation, 'above_average');
  assert.equal(analyze([106, 103, 101, 100]).recommendation, 'below_average');
  assert.equal(analyze([100, 100, 101, 100]).recommendation, 'steady');
  for (const series of [[100, 130], [130, 100], [100, 100]]) {
    const { reason } = analyze(series);
    assert.ok(reason.length <= 80);
    assert.doesNotMatch(reason, /wait|days/i);
  }
});

test('demo data trends up, so the home price is above its recent average', async () => {
  const d = await svc.getPrices({ crop: 'rice', region: 'IN-UP-01', home: 'rampur' });
  assert.equal(d.analysis.recommendation, 'above_average');
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

// Mirrors the CEDA import on the VM: markets without coordinates, latest prices on different days,
// and an old previous price.
const ceda = createPriceService({
  async history() {
    const row = (market_code, market_name, date, modal) => ({ market_code, market_name, lat: null, lng: null, date, modal, currency: 'INR', unit: 'quintal', source: 'agmarknet', sample: false });
    return [
      row('ceda-680', 'Rampur', '2025-06-01', 3000), row('ceda-680', 'Rampur', '2025-10-29', 3260), row('ceda-680', 'Rampur', '2025-10-30', 3290),
      row('ceda-3452', 'Milak', '2025-10-29', 3300),
    ];
  },
});

test('net profit without market coordinates reports unknown transport, not a free trip', async () => {
  const n = await ceda.getNetProfit({ crop: 'rice', region: 'IN-CEDA-S9-D136', from: 'ceda-680', to: 'ceda-3452', qty: 5 });
  assert.equal(n.transport_known, false);
  assert.equal(n.distance_km, null);
  assert.equal(n.transport_per_qt, null);
  assert.equal(n.gain_per_qt, 10); // before transport
});

test('net profit uses the "from" market as home and reports each side\'s date', async () => {
  const n = await ceda.getNetProfit({ crop: 'rice', region: 'IN-CEDA-S9-D136', from: 'ceda-680', to: 'ceda-3452', qty: 1 });
  assert.equal(n.price_date, '2025-10-30');
  assert.deepEqual([n.from_date, n.to_date, n.same_day], ['2025-10-30', '2025-10-29', false]);
});

test('price change and the analysis ignore prices older than the recent window', async () => {
  const d = await ceda.getPrices({ crop: 'rice', region: 'IN-CEDA-S9-D136', home: 'ceda-680' });
  const rampur = d.markets[0];
  assert.equal(rampur.change_pct, 0.9); // vs 2025-10-29, not the June price
  assert.equal(d.markets.find((m) => m.code === 'ceda-3452').change_pct, null); // no recent previous price
  assert.equal(d.markets.find((m) => m.code === 'ceda-3452').days_from_home, 1);
  assert.equal(d.analysis.recommendation, 'steady'); // June's 3000 is outside the two-week average
});

test('with the member\'s location both trips start from the member', () => {
  const here = { lat: 28.8, lng: 79.03 };                       // Rampur
  const near = { name: 'Near', price: 2500, lat: 28.84, lng: 79.0 };  // ~6 km
  const far = { name: 'Far', price: 2700, lat: 28.37, lng: 79.43 };   // Bareilly-ish, ~77 km
  const n = netProfit({ from: near, to: far, qty: 2, here });
  assert.ok(n.from_distance_km < 10 && n.distance_km > 60);
  const extra = Math.round(n.distance_km * 1.5) - Math.round(n.from_distance_km * 1.5);
  assert.ok(Math.abs(n.transport_per_qt - extra) <= 2);
  assert.equal(n.gain_per_qt, 200 - n.transport_per_qt);
  assert.equal(n.gain_total, n.gain_per_qt * 2);
});
