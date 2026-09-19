import { Router } from 'express';

const CODE = /^[a-z0-9_-]{1,40}$/i;
const REGION = /^[A-Z0-9-]{2,20}$/;

export function pricesRouter(service) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { crop, region, home } = req.query;
    if (!CODE.test(crop || '') || !REGION.test(region || '')) return bad(res, 'crop and region required');
    try {
      const data = await service.getPrices({ crop, region, home: CODE.test(home || '') ? home : undefined });
      if (!data) return res.status(404).json({ error: { code: 'no_data', message: 'No prices for this crop/area' } });
      res.json(data);
    } catch (err) { fail(res, err); }
  });

  router.get('/net-profit', async (req, res) => {
    const { crop, region, from, to } = req.query;
    const qty = Number(req.query.qty ?? 1);
    if (![crop, from, to].every((v) => CODE.test(v || '')) || !REGION.test(region || '') || !(qty > 0 && qty <= 10000)) {
      return bad(res, 'crop, region, from, to, qty required');
    }
    try {
      const data = await service.getNetProfit({ crop, region, from, to, qty });
      if (!data) return res.status(404).json({ error: { code: 'no_data', message: 'Unknown market' } });
      res.json(data);
    } catch (err) { fail(res, err); }
  });

  return router;
}

const bad = (res, message) => res.status(400).json({ error: { code: 'bad_request', message } });
function fail(res, err) {
  console.error('prices error:', err.message);
  res.status(503).json({ error: { code: 'prices_unavailable', message: 'Prices unavailable' } });
}
