// Static reference data for Farmer Circle. Communities and tags are written to
// Postgres on startup (idempotent upsert). Regions come from app.regions.

export const COMMUNITIES = [
  { slug: 'crop-talk', name: 'Crop Talk', description: 'Crops, soil, pests, diseases, fertilizer, water' },
  { slug: 'machinery', name: 'Machinery', description: 'Tools, pumps, tractors, repairs, buying advice' },
  { slug: 'market-talk', name: 'Market Talk', description: 'Prices, selling experience, transport, demand' },
  { slug: 'livestock', name: 'Livestock', description: 'Cattle, goats, poultry, feed, housing' },
  { slug: 'farm-life', name: 'Farm Life', description: 'Rural life, mutual help, policy discussion, general' },
];

// `community` only decides which tags are listed first for a community; any
// active tag may be attached to any post.
export const TAGS = [
  ['rice', 'crop-talk'], ['maize', 'crop-talk'], ['wheat', 'crop-talk'], ['vegetables', 'crop-talk'], ['fruit', 'crop-talk'],
  ['pest', 'crop-talk'], ['disease', 'crop-talk'], ['irrigation', 'crop-talk'], ['fertilizer', 'crop-talk'], ['soil', 'crop-talk'],
  ['pump', 'machinery'], ['tractor', 'machinery'], ['repair', 'machinery'], ['buying-advice', 'machinery'],
  ['price-report', 'market-talk'], ['transport', 'market-talk'], ['buyer-demand', 'market-talk'],
  ['cattle', 'livestock'], ['goat', 'livestock'], ['poultry', 'livestock'], ['feed', 'livestock'],
  ['help-needed', 'farm-life'], ['policy', 'farm-life'], ['farm-life', 'farm-life'],
];

export const REPORT_REASONS = ['spam', 'scam', 'harassment', 'dangerous_advice', 'false_information', 'other'];
export const POST_TYPES = ['question', 'discussion', 'local_report'];

// Used for guests, who have no profile region, when they have not chosen one.
export const DEFAULT_GUEST_REGION = 'IN-UP-01';
