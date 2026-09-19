-- Region centre points, so Weather (and anything else that needs a location) can use the member's
-- own region instead of a fixed city list. Data only; fills coordinates that are still missing.
BEGIN;
UPDATE app.regions r SET latitude = v.lat, longitude = v.lon
FROM (VALUES
  ('IN-BR', 25.59410, 85.13760),            -- Bihar: Patna
  ('IN-UP-01', 28.80000, 79.03000),         -- Rampur, Uttar Pradesh
  ('IN-CEDA-S9-D136', 28.80000, 79.03000),  -- Rampur district (CEDA import)
  ('VN-AG', 10.38640, 105.43520),           -- An Giang: Long Xuyen
  ('BD-RAJ', 24.37450, 88.60420)            -- Rajshahi
) AS v(code, lat, lon)
WHERE r.code = v.code AND r.latitude IS NULL;
COMMIT;
