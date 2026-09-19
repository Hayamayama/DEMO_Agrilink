// Usage: DATABASE_URL=... node db/seed.js   (idempotent; run as agrilink_app after migration 003 is applied)
import { createPool } from './pool.js';
import { REGIONS, CROPS, MARKETS, generatePrices } from './seedData.js';

const pool = createPool();
if (!pool) { console.error('DATABASE_URL is not set'); process.exit(1); }

try {
  for (const r of REGIONS) {
    await pool.query(
      `INSERT INTO app.regions (code, country_code, name, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`,
      [r.code, r.country, r.name, r.lat, r.lng]);
  }
  for (const c of CROPS) {
    await pool.query(`INSERT INTO app.crops (code, name) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`, [c.code, c.name]);
  }
  for (const m of MARKETS) {
    await pool.query(
      `INSERT INTO app.markets (region_id, code, name, latitude, longitude)
       SELECT id,$2,$3,$4,$5 FROM app.regions WHERE code=$1 ON CONFLICT (code) DO NOTHING`,
      [m.region, m.code, m.name, m.lat, m.lng]);
  }
  let n = 0;
  for (const p of generatePrices()) {
    const res = await pool.query(
      `INSERT INTO app.market_prices (market_id, crop_id, price_date, min_price, max_price, modal_price,
                                      currency_code, price_unit, source, is_sample)
       SELECT m.id, c.id, $3::date, $4, $5, $6, $7, $8, $9, $10
       FROM app.markets m, app.crops c WHERE m.code=$1 AND c.code=$2
       ON CONFLICT (market_id, crop_id, variety, price_date) DO NOTHING`,
      [p.market, p.crop, p.date, p.min, p.max, p.modal, p.currency, p.unit, p.source, p.sample]);
    n += res.rowCount;
  }
  console.log(`seed ok: ${n} new price rows`);
} finally {
  await pool.end();
}
