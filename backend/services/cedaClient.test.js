import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CedaApiError, cedaRecords, createCedaClient } from './cedaClient.js';

test('CEDA response reader accepts the live output.data envelope', () => {
  assert.deepEqual(cedaRecords({ output: { data: [{ commodity_id: 3 }] } }, 'commodities'), [{ commodity_id: 3 }]);
  assert.deepEqual(cedaRecords({ commodities: [{ id: 3 }] }, 'commodities'), [{ id: 3 }]);
});

test('CEDA geography records preserve the live flat census fields', () => {
  const rows = cedaRecords({ output: { data: [{ census_state_id: 9, census_district_id: 123 }] } }, 'geographies');
  assert.deepEqual(rows[0], { census_state_id: 9, census_district_id: 123 });
});

test('CEDA client uses Bearer auth and posts JSON', async () => {
  let seen;
  const client = createCedaClient({
    token: 'secret-token',
    baseUrl: 'https://example.test/v1',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  const result = await client.prices({ commodity_id: 1, state_id: 8 });
  assert.deepEqual(result, { data: [] });
  assert.equal(seen.url, 'https://example.test/v1/agmarknet/prices');
  assert.equal(seen.init.headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(seen.init.body), { commodity_id: 1, state_id: 8 });
});

test('CEDA client exposes API errors without the token', async () => {
  const client = createCedaClient({
    token: 'never-log-this',
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
  });
  await assert.rejects(client.commodities(), (err) => {
    assert.ok(err instanceof CedaApiError);
    assert.equal(err.status, 401);
    assert.equal(err.message, 'Unauthorized');
    return true;
  });
});
