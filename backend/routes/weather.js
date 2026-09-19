import { Router } from 'express';
import { getWeather } from '../services/weatherService.js';
import { AppError, errorHandler, validation } from '../middleware/errors.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return next(validation('lat/lng required'));
  }
  let data;
  try {
    data = await getWeather(lat, lng);
  } catch (err) {
    console.error('weather error:', err.message);
    return next(new AppError('WEATHER_UNAVAILABLE', 'Weather unavailable', { retryable: true }));
  }
  res.json({ ok: true, ...data });
});

router.use(errorHandler);

export default router;
