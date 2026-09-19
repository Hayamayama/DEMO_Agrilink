import { MARKETS, generatePrices } from '../db/seedData.js';

// Both repos return the same row shape:
// { market_code, market_name, lat, lng, date, modal, currency, unit, source, sample }
export function memoryRepo(now = Date.now) {
  return {
    async history(cropCode, regionCode) {
      const markets = new Map(MARKETS.filter((m) => m.region === regionCode).map((m) => [m.code, m]));
      return generatePrices(now())
        .filter((p) => p.crop === cropCode && markets.has(p.market))
        .map((p) => {
          const m = markets.get(p.market);
          return { market_code: m.code, market_name: m.name, lat: m.lat, lng: m.lng, date: p.date,
                   modal: p.modal, currency: p.currency, unit: p.unit, source: 'seed', sample: p.sample };
        });
    },
  };
}

export function pgRepo(pool) {
  return {
    async history(cropCode, regionCode) {
      const { rows } = await pool.query(
        `SELECT m.code AS market_code, m.name AS market_name,
                m.latitude::float8 AS lat, m.longitude::float8 AS lng,
                p.price_date::text AS date, p.modal_price::float8 AS modal,
                p.currency_code AS currency, p.price_unit AS unit, p.source, p.is_sample AS sample
         FROM app.market_prices p
         JOIN app.markets m ON m.id = p.market_id AND m.active
         JOIN app.regions r ON r.id = m.region_id
         JOIN app.crops c ON c.id = p.crop_id
         -- Imported datasets can be historical. Do not filter relative to the
         -- server clock, so a valid older dataset remains visible.
         WHERE c.code = $1 AND r.code = $2
         ORDER BY m.code, p.price_date`,
        [cropCode, regionCode]);
      return rows;
    },
  };
}
