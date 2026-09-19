import { validation } from '../middleware/errors.js';

const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// P0 rejects links outright: a keypad user cannot follow them and they invite scams.
const URL_LIKE = /(https?:\/\/|www\.|ftp:\/\/)\S+/i;

function requireString(v, field) {
  if (typeof v !== 'string') throw validation('This field is required.', field);
  return v.normalize('NFC');
}

export function cleanTitle(v) {
  const s = requireString(v, 'title');
  if (CONTROL.test(s.replace(/[\t\r\n]/g, ' '))) throw validation('Title has unsupported characters.', 'title');
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 8) throw validation('Title needs at least 8 characters.', 'title');
  if (t.length > 80) throw validation('Title can be at most 80 characters.', 'title');
  if (URL_LIKE.test(t)) throw validation('Links are not allowed.', 'title');
  return t;
}

/** Plain text; keeps paragraph breaks (max `paragraphs`). */
export function cleanBody(v, { field = 'body', min = 10, max = 500, paragraphs = 4 } = {}) {
  const s = requireString(v, field).replace(/\r\n?/g, '\n');
  if (CONTROL.test(s.replace(/\t/g, ' ').replace(/\n/g, ' '))) throw validation('Text has unsupported characters.', field);
  const t = s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length < min) throw validation(`Needs at least ${min} characters.`, field);
  if (t.length > max) throw validation(`Can be at most ${max} characters.`, field);
  if (t.split('\n\n').length > paragraphs) throw validation(`Use at most ${paragraphs} paragraphs.`, field);
  if (URL_LIKE.test(t)) throw validation('Links are not allowed.', field);
  return t;
}

export function cleanNote(v) {
  if (v == null || v === '') return null;
  return cleanBody(v, { field: 'note', min: 1, max: 200, paragraphs: 1 });
}

export function cleanDisplayName(v) {
  const t = requireString(v, 'displayName').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 24) throw validation('Name must be 2 to 24 characters.', 'displayName');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'\-]*$/u.test(t)) throw validation('Name has unsupported characters.', 'displayName');
  return t;
}

export const PIN_RE = /^\d{6}$/;
export const FARM_ID_RE = /^\d{8}$/;
export const normalizeFarmId = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

export function cleanRequestId(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) throw validation('A request id is required.', 'requestId');
  return v;
}
