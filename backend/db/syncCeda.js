// Sync one configured CEDA Agmarknet slice into Postgres.
// Run after exporting backend/.env, for example:
//   set -a; . ./.env; set +a; node db/syncCeda.js catalog
//   set -a; . ./.env; set +a; node db/syncCeda.js sync
import { createPool } from './pool.js';
import { cedaRecords, createCedaClient } from '../services/cedaClient.js';

const mode = process.argv[2] || 'sync';
const pool = createPool();
const client = createCedaClient({ token: process.env.CEDA_API_TOKEN });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for CEDA sync`);
  return value;
}
function int(name) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
function ints(name) {
  const values = required(name).split(',').map((part) => Number(part.trim()));
  if (!values.length || values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error(`${name} must be comma-separated integer IDs`);
  return values;
}
function date(value, fallback) {
  const result = value || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('CEDA_FROM_DATE and CEDA_TO_DATE must be YYYY-MM-DD');
  return result;
}
function code(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}
function dayOffset(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function showCatalog() {
  const payload = await client.commodities();
  console.log(JSON.stringify(cedaRecords(payload, 'commodities'), null, 2));
}
async function showGeographies() {
  const payload = await client.geographies({ commodityId: process.env.CEDA_COMMODITY_ID });
  console.log(JSON.stringify(cedaRecords(payload, 'geographies'), null, 2));
}
async function showMarkets() {
  const payload = await client.markets({
    commodity_id: int('CEDA_COMMODITY_ID'), state_id: int('CEDA_STATE_ID'),
    district_id: int('CEDA_DISTRICT_ID'), indicator: 'price',
  });
  console.log(JSON.stringify(cedaRecords(payload, 'data'), null, 2));
}
function priceFilters() {
  return {
    commodity_id: int('CEDA_COMMODITY_ID'),
    state_id: int('CEDA_STATE_ID'),
    district_id: ints('CEDA_DISTRICT_IDS'),
    market_id: ints('CEDA_MARKET_IDS'),
    from_date: date(process.env.CEDA_FROM_DATE, dayOffset(14)),
    to_date: date(process.env.CEDA_TO_DATE, dayOffset(0)),
  };
}
async function showPrices() {
  const filters = priceFilters();
  const payload = await client.prices(filters);
  // Keep this command read-only.  It is the first diagnostic step before
  // importing, because the live API occasionally has gaps for a crop/market.
  console.log(JSON.stringify({ filters, payload }, null, 2));
}

async function sync() {
  if (!pool) throw new Error('DATABASE_URL is not set');
  const commodityId = int('CEDA_COMMODITY_ID');
  const stateId = int('CEDA_STATE_ID');
  const districtIds = ints('CEDA_DISTRICT_IDS');
  const marketIds = ints('CEDA_MARKET_IDS');
  const filters = priceFilters();
  const { from_date: fromDate, to_date: toDate } = filters;
  const cropCode = code(process.env.CEDA_CROP_CODE || `ceda-${commodityId}`);
  const cropName = process.env.CEDA_CROP_NAME || `CEDA commodity ${commodityId}`;

  const [commoditiesPayload, geographiesPayload, pricesPayload, ...marketPayloads] = await Promise.all([
    client.commodities(),
    client.geographies({ commodityId }),
    client.prices(filters),
    ...districtIds.map((districtId) => client.markets({ commodity_id: commodityId, state_id: stateId, district_id: districtId, indicator: 'price' })),
  ]);
  const commodity = cedaRecords(commoditiesPayload, 'commodities').find((item) => Number(item.id ?? item.commodity_id) === commodityId);
  const cropLabel = process.env.CEDA_CROP_NAME || commodity?.name || commodity?.commodity_name || cropName;
  // CEDA's live endpoint returns one flat row per district (census_state_* /
  // census_district_*), despite the Swagger schema documenting nested states.
  const geographies = cedaRecords(geographiesPayload, 'geographies');
  const state = geographies.find((item) => Number(item.census_state_id ?? item.state_id) === stateId);
  const stateName = state?.census_state_name ?? state?.state_name ?? `State ${stateId}`;
  const districtNames = new Map(geographies
    .filter((item) => Number(item.census_state_id ?? item.state_id) === stateId)
    .map((item) => [Number(item.census_district_id ?? item.district_id), item.census_district_name ?? item.district_name]));
  const markets = new Map(marketPayloads.flatMap((payload) => cedaRecords(payload, 'data')).map((item) => [Number(item.market_id), item.market_name]));
  const rows = cedaRecords(pricesPayload, 'data');
  if (!rows.length) throw new Error('CEDA returned no price records for the selected filters');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      `INSERT INTO app.crops (code, name) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true`,
      [cropCode, cropLabel]);
    let count = 0;
    for (const row of rows) {
      const districtId = Number(row.census_district_id ?? row.district_id);
      const marketId = Number(row.market_id);
      const modal = Number(row.modal_price);
      if (!Number.isInteger(districtId) || !Number.isInteger(marketId) || !Number.isFinite(modal)) continue;
      const regionCode = `IN-CEDA-S${stateId}-D${districtId}`;
      const regionName = `${stateName} — ${districtNames.get(districtId) || `District ${districtId}`}`;
      const marketCode = `ceda-${marketId}`;
      await db.query(
        `INSERT INTO app.regions (code, country_code, name) VALUES ($1, 'IN', $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`, [regionCode, regionName]);
      await db.query(
        `INSERT INTO app.markets (region_id, code, name)
         SELECT id, $2, $3 FROM app.regions WHERE code = $1
         ON CONFLICT (code) DO UPDATE SET region_id = EXCLUDED.region_id, name = EXCLUDED.name`,
        [regionCode, marketCode, markets.get(marketId) || `Market ${marketId}`]);
      const result = await db.query(
        `INSERT INTO app.market_prices
           (market_id, crop_id, price_date, min_price, max_price, modal_price, currency_code, price_unit, source, is_sample)
         SELECT m.id, c.id, $3::date, $4, $5, $6, 'INR', 'quintal', 'agmarknet', false
         FROM app.markets m, app.crops c WHERE m.code = $1 AND c.code = $2
         ON CONFLICT (market_id, crop_id, variety, price_date) DO UPDATE SET
           min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price, modal_price = EXCLUDED.modal_price,
           currency_code = EXCLUDED.currency_code, price_unit = EXCLUDED.price_unit, source = EXCLUDED.source,
           is_sample = false, fetched_at = now()`,
        [marketCode, cropCode, row.date, numeric(row.min_price), numeric(row.max_price), modal]);
      count += result.rowCount;
    }
    if (!count) throw new Error('CEDA price response did not contain usable market records');
    await db.query('COMMIT');
    console.log(`CEDA sync complete: ${count} real price records upserted (${fromDate} to ${toDate})`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

try {
  if (mode === 'catalog') await showCatalog();
  else if (mode === 'geographies') await showGeographies();
  else if (mode === 'markets') await showMarkets();
  else if (mode === 'prices') await showPrices();
  else if (mode === 'sync') await sync();
  else throw new Error('Usage: node db/syncCeda.js [catalog|geographies|markets|prices|sync]');
} finally {
  if (pool) await pool.end();
}
