import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSprayConditions, calculateDeltaT } from './sprayAssessment.js';

test('delta-T follows the Stull approximation', () => assert.equal(calculateDeltaT(28, 72), 4));

test('spray assessment exposes every factor and the mandatory disclaimer', () => {
  const out = assessSprayConditions({ current: { temperatureC: 28, relativeHumidity: 72, windSpeedKph: 8.2,
    windGustKph: 12.5, rainProbabilityNext4h: 15, precipitationMm: 0 } });
  assert.equal(out.overall, 'caution');
  assert.deepEqual(out.factors.map((f) => f.param), ['wind','humidity','temperature','deltaT','rainRisk','gusts','precipitation']);
  assert.match(out.disclaimer, /Always follow product label/);
});
