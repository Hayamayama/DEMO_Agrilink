const TRANSPORT_RS_PER_QT_KM = 1.5; // rough freight estimate (assumption, not measured); shown as approximate in the UI
const ROAD_FACTOR = 1.25;           // road distance vs straight line

export function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rule-based price call from real numbers (no LLM): compare today vs the 7-day average.
export function analyze(series) {
  const last = series[series.length - 1];
  const avg = series.reduce((s, v) => s + v, 0) / series.length;
  const pct = avg ? (last - avg) / avg : 0;
  const confidence = Math.min(1, Math.abs(pct) / 0.05);
  if (pct >= 0.02) return { recommendation: 'wait', trend: 'up', confidence, reason: 'Price rising. Consider waiting 2 days.' };
  if (pct <= -0.02) return { recommendation: 'sell_now', trend: 'down', confidence, reason: 'Price falling. Sell soon.' };
  return { recommendation: 'hold', trend: 'flat', confidence, reason: 'Price steady. No rush to sell.' };
}

export function netProfit({ from, to, qty }) {
  const km = distanceKm(from, to) * ROAD_FACTOR;
  const transport = Math.round(km * TRANSPORT_RS_PER_QT_KM);
  const gain = Math.round(to.price - from.price - transport);
  return {
    from: from.name, to: to.name, qty,
    price_from: from.price, price_to: to.price,
    distance_km: Math.round(km), transport_per_qt: transport,
    gain_per_qt: gain, gain_total: gain * qty,
    estimated: true,
  };
}

export function createPriceService(repo) {
  async function load(crop, region) {
    const rows = await repo.history(crop, region);
    const byMarket = new Map();
    rows.sort((a, b) => a.date.localeCompare(b.date)); // oldest -> newest, independent of repo order
    for (const r of rows) {
      if (!byMarket.has(r.market_code)) byMarket.set(r.market_code, []);
      byMarket.get(r.market_code).push(r);
    }
    return byMarket;
  }

  // home = first market unless `home` code / nearest lat,lng is given
  async function getPrices({ crop, region, home }) {
    const byMarket = await load(crop, region);
    if (!byMarket.size) return null;
    const markets = [...byMarket.values()].map((rows) => {
      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      return {
        code: last.market_code, name: last.market_name, lat: last.lat, lng: last.lng,
        price: last.modal, date: last.date, sample: last.sample,
        change_pct: prev ? Math.round(((last.modal - prev.modal) / prev.modal) * 1000) / 10 : 0,
        trend: rows.slice(-7).map((r) => r.modal),
      };
    });
    markets.sort((a, b) => a.code.localeCompare(b.code)); // deterministic regardless of repo ordering
    const homeMarket = markets.find((m) => m.code === home) || markets[0];
    markets.sort((a, b) => (a === homeMarket ? -1 : b === homeMarket ? 1 : a.name.localeCompare(b.name)));
    for (const m of markets) m.distance_km = Math.round(distanceKm(homeMarket, m) * ROAD_FACTOR);
    const first = byMarket.get(homeMarket.code)[0];
    return {
      crop, region, currency: first.currency, unit: first.unit,
      home: homeMarket.code, date: homeMarket.date,
      sample: markets.some((m) => m.sample),
      markets, analysis: analyze(homeMarket.trend),
    };
  }

  async function getNetProfit({ crop, region, from, to, qty }) {
    const data = await getPrices({ crop, region });
    if (!data) return null;
    const a = data.markets.find((m) => m.code === from), b = data.markets.find((m) => m.code === to);
    if (!a || !b) return null;
    return { ...netProfit({ from: a, to: b, qty }), currency: data.currency, unit: data.unit, sample: data.sample };
  }

  return { getPrices, getNetProfit };
}
