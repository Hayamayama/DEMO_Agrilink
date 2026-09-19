-- Uttar Pradesh as the live-price demo state (data.gov.in daily mandi prices, db/syncMandi.js).
-- IN-UP is the state all synced mandis belong to; members pick a district, and a district code
-- IN-UP-* resolves to IN-UP for prices. Rampur already exists as IN-UP-01. Data only.
BEGIN;
INSERT INTO app.regions (code, country_code, name, latitude, longitude) VALUES
  ('IN-UP',     'IN', 'Uttar Pradesh',            26.84670, 80.94620),
  ('IN-UP-MRT', 'IN', 'Meerut, Uttar Pradesh',    28.98450, 77.70640),
  ('IN-UP-AGR', 'IN', 'Agra, Uttar Pradesh',      27.17670, 78.00810),
  ('IN-UP-LKO', 'IN', 'Lucknow, Uttar Pradesh',   26.84670, 80.94620),
  ('IN-UP-VNS', 'IN', 'Varanasi, Uttar Pradesh',  25.31760, 82.97390)
ON CONFLICT (code) DO UPDATE SET
  latitude = COALESCE(app.regions.latitude, EXCLUDED.latitude),
  longitude = COALESCE(app.regions.longitude, EXCLUDED.longitude);
INSERT INTO app.crops (code, name) VALUES ('potato', 'Potato') ON CONFLICT (code) DO NOTHING;
COMMIT;
