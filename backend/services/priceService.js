const TRANSPORT_RS_PER_QT_KM = 1.5; // rough freight estimate (assumption, not measured); shown as approximate in the UI
const ROAD_FACTOR = 1.25;           // road distance vs straight line

export function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const RECENT_DAYS = 7; // a price change or comparison older than this is not "recent"
const dayGap = (a, b) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

// Rule-based and factual (no LLM, no forecast): where today's price sits against the recent
// average. It does not tell a farmer to wait a number of days; the data cannot support that.
export function analyze(series) {
  const last = series[series.length - 1];
  const avg = series.reduce((s, v) => s + v, 0) / series.length;
  const pct = avg ? (last - avg) / avg : 0;
  const confidence = Math.min(1, Math.abs(pct) / 0.05);
  const shown = `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`;
  if (pct >= 0.02) return { recommendation: 'above_average', trend: 'up', confidence, reason: `Price is above its recent average (${shown}).` };
  if (pct <= -0.02) return { recommendation: 'below_average', trend: 'down', confidence, reason: `Price is below its recent average (${shown}). Compare markets.` };
  return { recommendation: 'steady', trend: 'flat', confidence, reason: 'Price is close to its recent average.' };
}

const hasPoint = (m) => m.lat != null && m.lng != null;

// Transport is only estimated when both markets have coordinates; otherwise the gain is shown
// before transport rather than pretending the trip is free.
export function netProfit({ from, to, qty }) {
  const known = hasPoint(from) && hasPoint(to);
  const km = known ? distanceKm(from, to) * ROAD_FACTOR : null;
  const transport = known ? Math.round(km * TRANSPORT_RS_PER_QT_KM) : null;
  const gain = Math.round(to.price - from.price - (transport ?? 0));
  return {
    from: from.name, to: to.name, qty,
    price_from: from.price, price_to: to.price,
    distance_km: known ? Math.round(km) : null, transport_per_qt: transport,
    transport_known: known,
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
        price: last.modal, date: last.date, source: last.source, sample: last.sample,
        // Only against a recent previous price: a months-old one says nothing about today.
        change_pct: prev && dayGap(last.date, prev.date) <= RECENT_DAYS ? Math.round(((last.modal - prev.modal) / prev.modal) * 1000) / 10 : null,
        trend: rows.slice(-7).map((r) => r.modal),
      };
    });
    markets.sort((a, b) => a.code.localeCompare(b.code)); // deterministic regardless of repo ordering
    const homeMarket = markets.find((m) => m.code === home) || markets[0];
    markets.sort((a, b) => (a === homeMarket ? -1 : b === homeMarket ? 1 : a.name.localeCompare(b.name)));
    for (const m of markets) {
      m.distance_km = hasPoint(homeMarket) && hasPoint(m) ? Math.round(distanceKm(homeMarket, m) * ROAD_FACTOR) : null;
      // Days between this market's latest price and the home market's: compared prices may not be from the same day.
      m.days_from_home = dayGap(m.date, homeMarket.date);
    }
    const homeRows = byMarket.get(homeMarket.code);
    const first = homeRows[0];
    // The average covers the last two weeks of the home market, not "the last 7 rows" of any age.
    const recent = homeRows.filter((r) => dayGap(r.date, homeMarket.date) <= 2 * RECENT_DAYS).map((r) => r.modal);
    return {
      crop, region, currency: first.currency, unit: first.unit,
      home: homeMarket.code, date: homeMarket.date,
      source: homeMarket.source,
      sample: markets.some((m) => m.sample),
      markets, analysis: analyze(recent),
    };
  }

  async function getNetProfit({ crop, region, from, to, qty }) {
    const data = await getPrices({ crop, region, home: from });
    if (!data) return null;
    const a = data.markets.find((m) => m.code === from), b = data.markets.find((m) => m.code === to);
    if (!a || !b) return null;
    return {
      ...netProfit({ from: a, to: b, qty }),
      currency: data.currency, unit: data.unit, sample: data.sample,
      price_date: data.date, source: data.source,
      from_date: a.date, to_date: b.date, same_day: a.date === b.date,
    };
  }

  return { getPrices, getNetProfit };
}
