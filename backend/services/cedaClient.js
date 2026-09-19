const DEFAULT_BASE_URL = 'https://api.ceda.ashoka.edu.in/v1';

export class CedaApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CedaApiError';
    this.status = status;
  }
}

// The live API wraps successful responses as { output: { data: [...] } },
// whereas its Swagger schema documents top-level data/commodities/geographies.
// Accept both so API packaging changes do not silently produce an empty import.
export function cedaRecords(payload, namedKey) {
  const body = payload?.output ?? payload ?? {};
  const records = body[namedKey] ?? body.data ?? [];
  return Array.isArray(records) ? records : [];
}

// CEDA calls its credential an API key in its registration UI, while its OpenAPI
// specification uses HTTP Bearer authentication. Keep the credential server-side.
export function createCedaClient({ token, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }) {
  if (!token) throw new Error('CEDA_API_TOKEN is not set');

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = payload?.error?.message || payload?.message || `CEDA request failed (${res.status})`;
        throw new CedaApiError(detail, res.status);
      }
      return payload;
    } catch (err) {
      if (err.name === 'AbortError') throw new CedaApiError('CEDA request timed out');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    commodities: () => request('/agmarknet/commodities'),
    // The API documentation describes commodity_id for this endpoint but its
    // generated schema omits it. Sending it only when supplied works with both.
    geographies: ({ commodityId } = {}) => request(`/agmarknet/geographies${commodityId ? `?commodity_id=${encodeURIComponent(commodityId)}` : ''}`),
    markets: (params) => request('/agmarknet/markets', { method: 'POST', body: params }),
    prices: (params) => request('/agmarknet/prices', { method: 'POST', body: params }),
  };
}
