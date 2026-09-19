// Pure helpers for Farmer Circle screens. No DOM, no network.

export const COMMUNITIES = [
  { slug: 'crop-talk', name: 'Crop Talk' },
  { slug: 'machinery', name: 'Machinery' },
  { slug: 'market-talk', name: 'Market Talk' },
  { slug: 'livestock', name: 'Livestock' },
  { slug: 'farm-life', name: 'Farm Life' },
];
export const communityName = (slug) => COMMUNITIES.find((c) => c.slug === slug)?.name || slug;

export const SORTS = ['local', 'new', 'top'];
export const SORT_LABEL = { local: 'Local', new: 'New', top: 'Top' };
export const TYPE_LABEL = { question: 'Question', discussion: 'Discussion', local_report: 'User report' };
export const REASON_LABEL = {
  spam: 'Spam', scam: 'Scam/payment request', harassment: 'Harassment',
  dangerous_advice: 'Dangerous advice', false_information: 'False information', other: 'Other',
};
export const SCOPE_LABEL = { region: 'Near me', country: 'My country', global: 'Everywhere' };

export function relTime(iso, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

export const tagLabel = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const replies = (n) => plural(n, 'reply', 'replies');
export const scoreText = (n) => `${n < 0 ? '▼' : '▲'}${Math.abs(n)}`;

// Multi-tap gives lowercase only; capitalise sentence starts (or every word, for names).
export function autoCap(text, mode = 'sentence') {
  if (mode === 'none') return text;
  const re = mode === 'words' ? /(^|\s)(\p{Ll})/gu : /(^|[.!?]\s+|\n\n)(\p{Ll})/gu;
  return text.replace(re, (_m, pre, ch) => pre + ch.toUpperCase());
}


export function newRequestId() {
  try { if (globalThis.crypto?.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// UI branches on the stable error code; only server-authored hints (rate limits,
// validation text) are shown verbatim because they are already user-safe.
export function errorText(err) {
  switch (err?.code) {
    case 'OFFLINE': return 'No network. Check your signal.';
    case 'TIMEOUT': return 'Slow connection. Try again.';
    case 'AUTH_REQUIRED': return 'Please sign in.';
    case 'INVALID_CREDENTIALS': return 'Invalid Farm ID or PIN';
    case 'ACCOUNT_SUSPENDED': return 'This account is not active.';
    case 'FORBIDDEN': return err.message || 'Not allowed.';
    case 'NOT_FOUND': return 'Not found. It may have been removed.';
    case 'POST_LOCKED': return 'This post is locked.';
    case 'ALREADY_REPORTED': return 'Already reported. Thank you.';
    case 'VALIDATION_ERROR':
    case 'RATE_LIMITED':
    case 'ACCOUNT_LOCKED': return err.message;
    default: return 'Something went wrong. Try again.';
  }
}

// Splits text into pieces of at most `size` characters, breaking at paragraph ends
// first and then at spaces, so a long post can be read piece by piece on a tiny screen.
export function chunkText(text, size) {
  const out = [];
  for (const para of String(text).split(/\n{2,}/)) {
    let rest = para.trim();
    while (rest.length > size) {
      let cut = rest.lastIndexOf(' ', size);
      if (cut < size * 0.5) cut = size;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [''];
}
