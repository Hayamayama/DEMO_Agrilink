import { Router } from 'express';
import { getWeather } from '../services/weatherService.js';

const router = Router();

router.get('/', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: { code: 'bad_coords', message: 'lat/lng required' } });
  }
  try {
    res.json(await getWeather(lat, lng));
  } catch {
    res.status(503).json({ error: { code: 'weather_unavailable', message: 'Weather unavailable' } });
  }
});

export default router;
