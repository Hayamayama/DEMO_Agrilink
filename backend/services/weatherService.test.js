import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWeather, normalize, advise, buildUrl, _clearCache } from './weatherService.js';

const raw = {
  current: { temperature_2m: 27.6, precipitation: 0, weather_code: 1 },
  daily: {
    time: ['2026-09-19', '2026-09-20', '2026-09-21'],
    weather_code: [1, 61, 95],
    temperature_2m_max: [31.2, 29, 28],
    temperature_2m_min: [22, 21, 20],
    precipitation_probability_max: [10, 70, 90],
    precipitation_sum: [0, 8, 20],
    et0_fao_evapotranspiration: [4, 3, 2],
  },
};

test('url asks for rain probability, not just current precipitation', () => {
  assert.match(buildUrl(24.14, 120.67), /precipitation_probability_max/);
});

test('normalize maps 3 days and rounds temps', () => {
  const w = normalize(raw);
  assert.equal(w.current.temp, 28);
  assert.equal(w.daily.length, 3);
  assert.equal(w.daily[1].rain_prob, 70);
});

test('advice: dry day -> spray, rainy -> wait', () => {
  assert.equal(advise(normalize(raw)).action, 'spray');
  const wet = normalize(raw);
  wet.daily[0].rain_prob = 80;
  assert.equal(advise(wet).action, 'wait');
});

test('caches, and serves stale data when upstream fails', async () => {
  _clearCache();
  let calls = 0;
  let t = 0;
  const ok = async () => (calls++, { ok: true, json: async () => raw });
  const bad = async () => { throw new Error('down'); };
  const now = () => t;

  await getWeather(24.14, 120.67, { fetchImpl: ok, now });
  await getWeather(24.14, 120.67, { fetchImpl: ok, now });
  assert.equal(calls, 1);

  t = 31 * 60 * 1000;
  const r = await getWeather(24.14, 120.67, { fetchImpl: bad, now });
  assert.equal(r.stale, true);

  _clearCache();
  await assert.rejects(getWeather(1, 1, { fetchImpl: bad, now }));
});
