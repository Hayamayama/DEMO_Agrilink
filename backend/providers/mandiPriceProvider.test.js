import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMandiPriceProvider } from './mandiPriceProvider.js';

test('normalizes the deployed Mandi API response envelope', async () => {
  const provider = createMandiPriceProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, data: [
    { market: 'Kanpur APMC', district: 'Kanpur', variety:'Common',grade:'FAQ',min_price: 2200, max_price: 2350, modal_price: 2280, arrival_date: '2026-09-19' },
  ] }) }) });
  assert.deepEqual(await provider.getPrices('Uttar Pradesh', 'Rice'), [{ market: 'Kanpur APMC', district: 'Kanpur', variety:'Common',grade:'FAQ',minPrice: 2200,
    maxPrice: 2350, modalPrice: 2280, unit: 'quintal', arrivalDate: '2026-09-19' }]);
});
