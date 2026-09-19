import { Router } from 'express';
import { AppError, errorHandler, validation } from '../middleware/errors.js';

const CODE = /^[a-z0-9_-]{1,80}$/i; // synced mandi codes are agm-<state>-<district>-<market>
const REGION = /^[A-Z0-9-]{2,20}$/;

export function pricesRouter(service) {
  const router = Router();

  // Optional lat/lng (the member's region centre) pick the nearest mandi as "your area".
  const point = (q) => {
    const lat = Number(q.lat), lng = Number(q.lng);
    return q.lat != null && q.lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {};
  };

  router.get('/crops', async (req, res, next) => {
    const { region } = req.query;
    if (!REGION.test(region || '')) return next(validation('region required', 'region'));
    try { res.json({ ok: true, ...await service.getCrops({ region }) }); } catch (err) { next(unavailable(err)); }
  });

  router.get('/', async (req, res, next) => {
    const { crop, region, home } = req.query;
    if (!CODE.test(crop || '') || !REGION.test(region || '')) return next(validation('crop and region required'));
    let data;
    try {
      data = await service.getPrices({ crop, region, home: CODE.test(home || '') ? home : undefined, ...point(req.query) });
    } catch (err) { return next(unavailable(err)); }
    if (!data) return next(new AppError('NO_DATA', 'No prices for this crop/area'));
    res.json({ ok: true, ...data });
  });

  router.get('/net-profit', async (req, res, next) => {
    const { crop, region, from, to } = req.query;
    const qty = Number(req.query.qty ?? 1);
    if (![crop, from, to].every((v) => CODE.test(v || '')) || !REGION.test(region || '') || !(qty > 0 && qty <= 10000)) {
      return next(validation('crop, region, from, to, qty required'));
    }
    let data;
    try {
      data = await service.getNetProfit({ crop, region, from, to, qty, ...point(req.query) });
    } catch (err) { return next(unavailable(err)); }
    if (!data) return next(new AppError('NO_DATA', 'Unknown market'));
    res.json({ ok: true, ...data });
  });

  router.use(errorHandler);
  return router;
}

// A failing price lookup is an outage for the member, not a bug report: 503 and retryable.
function unavailable(err) {
  console.error('prices error:', err.message);
  return new AppError('PRICES_UNAVAILABLE', 'Prices unavailable', { retryable: true });
}
