-- The CEDA import created markets without coordinates, so the net-profit view measured 0 km and
-- no transport cost between them. Town centre points; fills only coordinates that are missing.
BEGIN;
UPDATE app.markets m SET latitude = v.lat, longitude = v.lon
FROM (VALUES
  ('ceda-680', 28.80000, 79.03000),   -- Rampur APMC, Uttar Pradesh
  ('ceda-3452', 28.61080, 79.17650)   -- Milak, Rampur district
) AS v(code, lat, lon)
WHERE m.code = v.code AND m.latitude IS NULL;
COMMIT;
