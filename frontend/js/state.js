// Placeholder until /api/auth/session exists. Override with ?lat=&lng= for testing.
const q = new URLSearchParams(location.search);
export const user = {
  village: 'Rampur',
  lat: Number(q.get('lat')) || 28.8,
  lng: Number(q.get('lng')) || 79.03,
};
