// data.gov.in "Current Daily Price of Various Commodities from Various Markets (Mandi)":
// Agmarknet's daily wholesale prices, published by India's Ministry of Agriculture and Farmers
// Welfare. The resource only holds the latest day, so history comes from syncing it every day.
export const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
// The sample key published in data.gov.in's API documentation. It is shared by everyone, capped
// at 10 records per request and often rate limited; a personal key (MANDI_API_KEY) lifts both.
export const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

export class RateLimited extends Error {
  constructor() { super('data.gov.in rate limit exceeded'); this.code = 'RATE_LIMITED'; }
}

/** '19/09/2026' -> '2026-09-19' (null when malformed). */
export function arrivalDate(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

const price = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** One API record -> the row we store, or null when it cannot be used. Prices are Rs/quintal. */
export function mandiRow(r) {
  const date = arrivalDate(r.arrival_date);
  const modal = price(r.modal_price);
  if (!date || modal == null || modal <= 0 || !r.market || !r.district || !r.state) return null;
  let min = price(r.min_price), max = price(r.max_price);
  if (min != null && max != null && max < min) { min = null; max = null; }
  return {
    state: String(r.state).trim(), district: String(r.district).trim(), market: String(r.market).trim(),
    commodity: String(r.commodity).trim(), variety: String(r.variety ?? '').trim(), date, min, max, modal,
  };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pages through one state x commodity. On a rate limit it waits (20 s, doubling, capped at 5 min)
 * and retries, until `maxWaitMs` of waiting is spent; then it throws RateLimited so the caller
 * can stop and resume on the next run.
 */
export function createMandiClient({
  apiKey = SAMPLE_KEY, pageSize = apiKey === SAMPLE_KEY ? 10 : 500, fetchImpl = fetch, sleep = defaultSleep,
  maxWaitMs = 20 * 60_000, log = () => {},
} = {}) {
  let waited = 0;

  async function page({ state, commodity, offset }) {
    const q = new URLSearchParams({ 'api-key': apiKey, format: 'json', limit: String(pageSize), offset: String(offset) });
    q.set('filters[state.keyword]', state);
    q.set('filters[commodity]', commodity);
    let delay = 20_000;
    for (;;) {
      let res, body = null;
      try {
        res = await fetchImpl(`https://api.data.gov.in/resource/${MANDI_RESOURCE}?${q}`, { signal: AbortSignal.timeout(30_000) });
        body = await res.json().catch(() => null);
      } catch { res = null; }
      const limited = res?.status === 429 || /rate limit/i.test(body?.error || '');
      if (res?.ok && Array.isArray(body?.records)) return { total: Number(body.total) || 0, records: body.records };
      if (!limited && res && res.status < 500) throw new Error(`data.gov.in ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      if (waited + delay > maxWaitMs) throw new RateLimited();
      log(`data.gov.in ${limited ? 'rate limited' : 'unavailable'}; retrying in ${delay / 1000}s`);
      await sleep(delay);
      waited += delay;
      delay = Math.min(delay * 2, 300_000);
    }
  }

  async function all({ state, commodity }) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const { total, records } = await page({ state, commodity, offset });
      rows.push(...records);
      if (records.length < pageSize || offset + pageSize >= total) return rows;
    }
  }

  return { page, all, get waitedMs() { return waited; } };
}
