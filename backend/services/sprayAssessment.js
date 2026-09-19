const DISCLAIMER = 'Based on weather data only. Always follow product label instructions.';

export function calculateDeltaT(temperatureC, relativeHumidity) {
  const t = temperatureC, h = relativeHumidity;
  const wetBulb = t * Math.atan(0.151977 * Math.sqrt(h + 8.313659)) + Math.atan(t + h)
    - Math.atan(h - 1.676331) + 0.00391838 * h ** 1.5 * Math.atan(0.023101 * h) - 4.686035;
  return Math.round((t - wetBulb) * 10) / 10;
}

const factor = (param, value, unit, status, reason) => ({ param, value, ...(unit ? { unit } : {}), status, ...(reason ? { reason } : {}) });
const band = (value, optimal, caution) => optimal(value) ? 'optimal' : caution(value) ? 'caution' : 'unsuitable';

export function assessSprayConditions(weather) {
  const current = weather?.current || {};
  const wind = Number(current.windSpeedKph ?? current.wind_speed ?? 0);
  const gusts = Number(current.windGustKph ?? current.wind_gust ?? wind);
  const rain = Number(current.rainProbabilityNext4h ?? current.rainProbability ?? weather?.daily?.[0]?.rainProbabilityMax ?? weather?.daily?.[0]?.rain_prob ?? 0);
  const temp = Number(current.temperatureC ?? current.temp);
  const humidity = Number(current.relativeHumidity ?? current.humidity);
  const precipitation = Number(current.precipitationMm ?? current.precip_mm ?? 0);
  const deltaT = calculateDeltaT(temp, humidity);
  const factors = [
    factor('wind', wind, 'km/h', band(wind, (v) => v >= 3 && v <= 10, (v) => v >= 0 && v <= 15), wind > 15 ? 'Wind exceeds 15 km/h' : undefined),
    factor('humidity', humidity, '%', band(humidity, (v) => v >= 60 && v <= 85, (v) => v >= 45 && v <= 95)),
    factor('temperature', temp, '°C', band(temp, (v) => v >= 10 && v <= 25, (v) => v >= 10 && v <= 30), temp > 25 ? 'Above 25°C — caution for contact products' : undefined),
    factor('deltaT', deltaT, '°C', band(deltaT, (v) => v >= 2 && v <= 8, (v) => v >= 0 && v <= 10)),
    factor('rainRisk', rain, '%', band(rain, (v) => v < 15, (v) => v <= 25), rain >= 15 ? 'Rain is possible in the next four hours' : undefined),
    factor('gusts', gusts, 'km/h', band(gusts, (v) => v < 15, (v) => v <= 20)),
    factor('precipitation', precipitation, 'mm', precipitation === 0 ? 'optimal' : precipitation <= 0.1 ? 'caution' : 'unsuitable'),
  ];
  const rank = { optimal: 0, caution: 1, unsuitable: 2 };
  const overall = factors.reduce((worst, f) => rank[f.status] > rank[worst] ? f.status : worst, 'optimal');
  const best = weather?.bestSprayWindow || { from: '06:00', to: '10:00', reason: 'Lowest typical wind and temperature before noon' };
  return { overall, windowStart: weather?.windowStart || null, windowEnd: weather?.windowEnd || null,
    factors, bestWindow: best, disclaimer: DISCLAIMER };
}

export { DISCLAIMER as SPRAY_DISCLAIMER };
