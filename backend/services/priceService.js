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

// Factual trend only: prices are never turned into sell/wait advice.
export function analyze(series) {
  const last = series[series.length - 1];
  const first = series[0];
  const changePct = first ? Math.round(((last - first) / first) * 1000) / 10 : 0;
  const trend = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';
  return { trend, changePct, reason: `7-day price change: ${changePct >= 0 ? '+' : ''}${changePct}%. This is market data, not advice.` };
}

const hasPoint = (m) => m.lat != null && m.lng != null;

// Transport is only estimated when the places involved have coordinates; otherwise the gain is
// shown before transport rather than pretending the trip is free. With the member's location
// (`here`) both trips start from the member: the gain of taking the crop to `to` instead of the
// nearest mandi `from` is (to - trip to it) - (from - trip to it). Without it, the trip is
// from -> to (the older "sell here or move it there" view).
export function netProfit({ from, to, qty, here = null }) {
  const trip = (a, b) => distanceKm(a, b) * ROAD_FACTOR;
  const cost = (km) => Math.round(km * TRANSPORT_RS_PER_QT_KM);
  let known, km, fromKm = null, transport;
  if (here && hasPoint(here)) {
    known = hasPoint(from) && hasPoint(to);
    km = known ? trip(here, to) : null;
    fromKm = known ? trip(here, from) : null;
    transport = known ? cost(km) - cost(fromKm) : null;
  } else {
    known = hasPoint(from) && hasPoint(to);
    km = known ? trip(from, to) : null;
    transport = known ? cost(km) : null;
  }
  const gain = Math.round(to.price - from.price - (transport ?? 0));
  return {
    from: from.name, to: to.name, qty,
    price_from: from.price, price_to: to.price,
    distance_km: known ? Math.round(km) : null, from_distance_km: fromKm == null ? null : Math.round(fromKm),
    transport_per_qt: transport, transport_known: known,
    gain_per_qt: gain, gain_total: gain * qty,
    estimated: true,
  };
}

const MAX_MARKETS = 8;       // home + the nearest others: a 240x320 list, not a state-wide dump
const STALE_DAYS = 14;       // a mandi silent for longer than this is dropped from comparisons

/** 'IN-UP-MRT' -> 'IN-UP': a district's prices come from its state when it has none of its own. */
export const parentRegion = (code) => code.split('-').slice(0, 2).join('-');

export function createPriceService(repo) {
  // A mandi can report several varieties (UP rice: mostly "Common", one "Other" at 3x the price).
  // Only the variety most mandis reported recently is compared, so a basmati price never sits
  // next to common rice in a net-profit sum.
  function oneVariety(rows) {
    const newest = rows.reduce((d, r) => (r.date > d ? r.date : d), '');
    const markets = new Map();
    for (const r of rows) {
      if (dayGap(r.date, newest) > STALE_DAYS) continue;
      const v = r.variety ?? '';
      if (!markets.has(v)) markets.set(v, new Set());
      markets.get(v).add(r.market_code);
    }
    const [variety] = [...markets.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0] || [''];
    return { variety, rows: rows.filter((r) => (r.variety ?? '') === variety) };
  }

  async function load(crop, region) {
    const { variety, rows } = oneVariety(await repo.history(crop, region));
    const byMarket = new Map();
    byMarket.variety = variety;
    rows.sort((a, b) => a.date.localeCompare(b.date)); // oldest -> newest, independent of repo order
    for (const r of rows) {
      if (!byMarket.has(r.market_code)) byMarket.set(r.market_code, []);
      byMarket.get(r.market_code).push(r);
    }
    return byMarket;
  }

  // The member's own region first; its state when the region has no prices, or only sample ones
  // while the state has real data.
  async function resolve(crop, region) {
    const own = await load(crop, region);
    const parent = parentRegion(region);
    const onlySample = own.size && [...own.values()].every((rows) => rows.every((r) => r.sample));
    if (parent !== region && (!own.size || onlySample)) {
      const state = await load(crop, parent);
      if (state.size && (!own.size || [...state.values()].some((rows) => rows.some((r) => !r.sample)))) return { byMarket: state, region: parent };
    }
    return { byMarket: own, region };
  }

  // home = the `home` market code, else the market nearest to lat/lng, else the first one.
  async function getPrices({ crop, region, home, lat, lng }) {
    const resolved = await resolve(crop, region);
    const { byMarket } = resolved;
    if (!byMarket.size) return null;
    let markets = [...byMarket.values()].map((rows) => {
      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      return {
        code: last.market_code, name: last.market_name, lat: last.lat, lng: last.lng,
        price: last.modal, date: last.date, source: last.source, sample: last.sample,
        // Only against a recent previous price: a months-old one says nothing about today.
        change_pct: prev && dayGap(last.date, prev.date) <= RECENT_DAYS ? Math.round(((last.modal - prev.modal) / prev.modal) * 1000) / 10 : null,
        trend: rows.slice(-7).map((r) => r.modal),
      };
    });
    const newest = markets.reduce((d, m) => (m.date > d ? m.date : d), '');
    markets = markets.filter((m) => dayGap(m.date, newest) <= STALE_DAYS);
    markets.sort((a, b) => a.code.localeCompare(b.code)); // deterministic regardless of repo ordering
    const here = lat != null && lng != null ? { lat, lng } : null;
    const nearest = here && markets.filter(hasPoint).sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0];
    const homeMarket = markets.find((m) => m.code === home) || nearest || markets[0];
    // Distances are from the member when their location is known, else from the home mandi.
    const origin = here || homeMarket;
    for (const m of markets) {
      m.distance_km = hasPoint(origin) && hasPoint(m) ? Math.round(distanceKm(origin, m) * ROAD_FACTOR) : null;
      // Days between this market's latest price and the home market's: compared prices may not be from the same day.
      m.days_from_home = dayGap(m.date, homeMarket.date);
    }
    // Home first, then by distance (unknown distances last, by name).
    markets.sort((a, b) => (a === homeMarket ? -1 : b === homeMarket ? 1
      : (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || a.name.localeCompare(b.name)));
    const homeRows = byMarket.get(homeMarket.code);
    const first = homeRows[0];
    // The average covers the last two weeks of the home market, not "the last 7 rows" of any age.
    const recent = homeRows.filter((r) => dayGap(r.date, homeMarket.date) <= 2 * RECENT_DAYS).map((r) => r.modal);
    return {
      crop, variety: byMarket.variety || null, region: resolved.region, currency: first.currency, unit: first.unit,
      home: homeMarket.code, date: homeMarket.date, newest,
      // How far "your area" really is from the member: the nearest mandi trading this crop today
      // may be in another district.
      home_from_you_km: here && hasPoint(homeMarket) ? Math.round(distanceKm(here, homeMarket) * ROAD_FACTOR) : null,
      source: homeMarket.source,
      sample: markets.some((m) => m.sample),
      markets: markets.slice(0, MAX_MARKETS), analysis: analyze(recent),
    };
  }

  async function getNetProfit({ crop, region, from, to, qty, lat, lng }) {
    const here = lat != null && lng != null ? { lat, lng } : null;
    const data = await getPrices({ crop, region, home: from, lat, lng });
    if (!data) return null;
    const a = data.markets.find((m) => m.code === from), b = data.markets.find((m) => m.code === to);
    if (!a || !b) return null;
    return {
      ...netProfit({ from: a, to: b, qty, here }),
      currency: data.currency, unit: data.unit, sample: data.sample,
      price_date: data.date, source: data.source,
      from_date: a.date, to_date: b.date, same_day: a.date === b.date,
    };
  }

  /** Crops that have prices for the member (own region, else its state), newest first by date. */
  async function getCrops({ region }) {
    let list = await repo.crops(region);
    const parent = parentRegion(region);
    if (parent !== region && (!list.length || list.every((c) => c.sample))) {
      const state = await repo.crops(parent);
      if (state.some((c) => !c.sample)) list = state;
    }
    return { region, items: list.map(({ code, name, latest, sample }) => ({ code, name, latest, sample: Boolean(sample) })) };
  }

  return { getPrices, getNetProfit, getCrops };
}

const MARKET_DISTANCE_FROM_LUCKNOW = new Map([
  ['Lucknow', 0], ['Barabanki', 30], ['Unnao', 65], ['Kanpur', 90], ['Sitapur', 95],
  ['Ayodhya', 135], ['Bareilly', 250], ['Varanasi', 315], ['Gorakhpur', 270], ['Agra', 335],
]);

const marketDistance = (row) => {
  for (const [place, km] of MARKET_DISTANCE_FROM_LUCKNOW) {
    if (`${row.market} ${row.district}`.toLowerCase().includes(place.toLowerCase())) return km;
  }
  return null;
};
const pct = (series) => series.length > 1 && series[0] ? Math.round(((series.at(-1) - series[0]) / series[0]) * 1000) / 10 : 0;

// Farm-scoped Agmarknet adapter. The older createPriceService above remains the
// compatibility layer for /api/prices and imported CEDA data.
export function createFarmPriceService({ provider, cache, now = () => new Date() }) {
  async function live(farm, crop) {
    const state = farm.stateName || 'Uttar Pradesh';
    const rows = await provider.getPrices(state, crop[0].toUpperCase() + crop.slice(1));
    if (!rows.length) throw new Error('No mandi prices returned');
    const dated = rows.sort((a, b) => String(b.arrivalDate).localeCompare(String(a.arrivalDate)));
    const latestDate = dated[0].arrivalDate;
    let latest = dated.filter((r) => r.arrivalDate === latestDate);
    if (latest.some((r) => String(r.variety).toLowerCase() === 'common')) latest = latest.filter((r) => String(r.variety).toLowerCase() === 'common');
    latest = [...new Map(latest.map((r) => [r.market, r])).values()];
    latest.forEach((r) => { r.distanceKm = marketDistance(r); });
    latest.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999) || a.market.localeCompare(b.market));
    const local = latest.find((r) => /lucknow/i.test(`${r.market} ${r.district}`)) || latest[0];
    const nearby = latest.filter((r) => r !== local && r.district !== local.district).slice(0, 5).map((r) => {
      const distanceKm = r.distanceKm;
      const transportCostPerQt = distanceKm == null ? null : Math.round(distanceKm * TRANSPORT_RS_PER_QT_KM);
      return { name: r.market, district: r.district, minPrice: r.minPrice, maxPrice: r.maxPrice,
        modalPrice: r.modalPrice, distanceKm, transportCostPerQt,
        netGainPerUnit: transportCostPerQt == null ? null : Math.round((r.modalPrice - local.modalPrice) - transportCostPerQt) };
    });
    let trend = [local.modalPrice];
    try {
      const history = await provider.getHistory(state, crop[0].toUpperCase() + crop.slice(1), local.market);
      const sameVariety = history.filter((r) => !local.variety || r.variety === local.variety);
      const values = sameVariety.sort((a,b)=>String(a.arrivalDate).localeCompare(String(b.arrivalDate))).map((r) => Number(r.modalPrice)).filter(Number.isFinite).slice(-7);
      if (values.length) trend = values;
    } catch { /* current government price remains useful without history */ }
    const fetchedAt = now();
    const payload = { farmId: farm.id, provider: 'agmarknet', crop, currency: 'INR', unit: 'quintal',
      date: latestDate, source: 'live', stale: false, fetchedAt: fetchedAt.toISOString(),
      localMarket: { name: local.market, district: local.district, minPrice: local.minPrice, maxPrice: local.maxPrice,
        modalPrice: local.modalPrice, isLocal: true }, nearbyMarkets: nearby, sevenDayTrend: trend };
    await cache.save({ farmId: farm.id, crop, stateName: state, payload, fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + 60 * 60 * 1000) });
    return payload;
  }

  async function getFarmPrices(farm, crop = 'rice') {
    const hit = await cache.fresh(farm.id, crop, now());
    if (hit && hit.source !== 'demo') return { ...hit, source: 'cache', stale: false };
    try { return await live(farm, crop); }
    catch (error) {
      const fallback = await cache.latest(farm.id, crop);
      if (fallback) return { ...fallback, source: fallback.source === 'demo' ? 'demo' : 'cache', stale: true };
      return null;
    }
  }
  return { getFarmPrices };
}

export function marketSnapshot(data) {
  if (!data?.localMarket) return null;
  const candidates = data.nearbyMarkets.filter((m) => m.netGainPerUnit != null).sort((a, b) => b.netGainPerUnit - a.netGainPerUnit);
  const best = candidates[0] || data.nearbyMarkets[0];
  return { crop: data.crop, localPrice: data.localMarket.modalPrice,
    bestNearbyPrice: best?.modalPrice ?? null, bestNearbyMarket: best?.name ?? null,
    netGainPerUnit: best?.netGainPerUnit ?? null, trend7d: `${pct(data.sevenDayTrend) >= 0 ? '+' : ''}${pct(data.sevenDayTrend)}%`,
    source: data.source, stale: data.stale, provider: data.provider, fetchedAt: data.fetchedAt };
}
