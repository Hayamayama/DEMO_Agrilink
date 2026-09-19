// Open-Meteo proxy with a per-coordinate cache. Free tier is non-commercial only
// (10k calls/day) and requires CC-BY attribution.
const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;
const cache = new Map(); // key -> { at, data }

const FIELDS = {
  current: 'temperature_2m,precipitation,weather_code',
  daily: [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'et0_fao_evapotranspiration',
  ].join(','),
};

export function buildUrl(lat, lng) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: FIELDS.current,
    daily: FIELDS.daily,
    forecast_days: '3',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function normalize(raw) {
  const d = raw.daily;
  return {
    current: {
      temp: Math.round(raw.current.temperature_2m),
      precip_mm: raw.current.precipitation,
      code: raw.current.weather_code,
    },
    daily: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      tmax: Math.round(d.temperature_2m_max[i]),
      tmin: Math.round(d.temperature_2m_min[i]),
      rain_prob: d.precipitation_probability_max[i],
      rain_mm: d.precipitation_sum[i],
      et0: d.et0_fao_evapotranspiration[i],
    })),
    attribution: 'Weather data by Open-Meteo.com',
  };
}

// Rule-based farm advice from real numbers (no LLM guessing).
export function advise(w) {
  const today = w.daily[0];
  const rain3 = w.daily.reduce((s, d) => s + (d.rain_mm || 0), 0);
  if (today.rain_prob >= 60 || today.rain_mm >= 5) {
    return { action: 'wait', reason: 'Rain likely. Delay spraying.' };
  }
  if (today.tmax >= 35 && rain3 < 2) {
    return { action: 'irrigate', reason: 'Hot and dry. Irrigate at dawn.' };
  }
  if (today.rain_prob < 20) {
    return { action: 'spray', reason: 'Dry day. Good to spray.' };
  }
  return { action: 'wait', reason: 'Mixed. Check this evening.' };
}

export async function getWeather(lat, lng, { fetchImpl = fetch, now = Date.now } = {}) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < TTL_MS) return { ...hit.data, stale: false };

  try {
    const res = await fetchImpl(buildUrl(lat, lng), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = normalize(await res.json());
    data.advice = advise(data);
    cache.set(key, { at: now(), data });
    return { ...data, stale: false };
  } catch (err) {
    if (hit) return { ...hit.data, stale: true }; // last known good
    throw err;
  }
}

export function _clearCache() {
  cache.clear();
}
