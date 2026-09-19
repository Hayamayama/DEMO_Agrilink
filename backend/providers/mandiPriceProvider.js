const DEFAULT_BASE_URL = 'https://mandi-api.onrender.com/v1';

export class MandiPriceError extends Error {
  constructor(message, status) { super(message); this.name = 'MandiPriceError'; this.status = status; }
}

export function createMandiPriceProvider({ baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  async function request(path) {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success === false) throw new MandiPriceError(body?.message || `Mandi API failed (${response.status})`, response.status);
      return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new MandiPriceError('Mandi API timed out');
      throw error;
    }
  }

  const normalize = (rows) => rows.map((row) => ({
        market: row.market, district: row.district,
        variety: row.variety || null, grade: row.grade || null,
        minPrice: Number(row.min_price), maxPrice: Number(row.max_price), modalPrice: Number(row.modal_price),
        unit: String(row.unit || 'Quintal').toLowerCase(), arrivalDate: row.arrival_date,
      })).filter((row) => row.market && Number.isFinite(row.modalPrice));
  return {
    async getPrices(state, commodity) {
      return normalize(await request(`/prices?state=${encodeURIComponent(state)}&commodity=${encodeURIComponent(commodity)}`));
    },
    async getHistory(state, commodity, market) {
      return normalize(await request(`/prices/history?state=${encodeURIComponent(state)}&commodity=${encodeURIComponent(commodity)}&market=${encodeURIComponent(market)}`));
    },
  };
}
