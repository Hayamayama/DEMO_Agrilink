// Placeholder until /api/auth/session exists (profile will supply village + lat/lng).
// Override with ?lat=&lng= for testing.
const q = new URLSearchParams(location.search);

export const LOCATIONS = [
  { name: 'Rampur, IN', lat: 28.8, lng: 79.03 },
  { name: 'Taichung, TW', lat: 24.14, lng: 120.67 },
  { name: 'Hanoi, VN', lat: 21.03, lng: 105.85 },
  { name: 'Dhaka, BD', lat: 23.81, lng: 90.41 },
];

const KEY = 'agrilink.loc';
function saved() {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
let index = Math.min(saved(), LOCATIONS.length - 1);
const override = q.get('lat') && q.get('lng')
  ? { name: `${Number(q.get('lat')).toFixed(1)}, ${Number(q.get('lng')).toFixed(1)}`, lat: Number(q.get('lat')), lng: Number(q.get('lng')) }
  : null;

export const user = {
  // The configured CEDA import lives in this Postgres region. Profile data will
  // replace these defaults once authentication/location matching is available.
  region: 'IN-CEDA-S9-D136',
  homeMarket: 'ceda-680',
  get location() { return override || LOCATIONS[index]; },
  nextLocation() {
    index = (index + 1) % LOCATIONS.length;
    try { localStorage.setItem(KEY, String(index)); } catch { /* private mode etc. */ }
    return this.location;
  },
};
