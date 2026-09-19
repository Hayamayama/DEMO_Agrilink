import { validation } from '../middleware/errors.js';

const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) throw validation('Invalid recurrence date.', 'recurrence');
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.valueOf())) throw validation('Invalid recurrence date.', 'recurrence');
  return d;
};
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

// Expands the deliberately constrained rule used by Today’s Farm. This is UTC
// date arithmetic only: local calendar dates never shift with server timezone.
export function occurrenceDates(startDate, rule = {}, { horizonDays = 60 } = {}) {
  const start = parse(startDate);
  const until = rule.until ? parse(rule.until) : addDays(start, horizonDays);
  const horizon = addDays(start, Math.min(366, Math.max(0, horizonDays)));
  const end = until < horizon ? until : horizon;
  const max = Math.min(500, Number(rule.maxOccurrences) || 500);
  const frequency = rule.frequency || 'once';
  const interval = Math.min(52, Math.max(1, Number(rule.interval) || 1));
  const out = [];
  if (!['once', 'daily', 'weekly', 'monthly'].includes(frequency)) throw validation('Unsupported recurrence frequency.', 'recurrence');
  for (let d = start, guard = 0; d <= end && out.length < max && guard++ < 5000; d = addDays(d, 1)) {
    const days = Math.floor((d - start) / 86400000);
    let matches = false;
    if (frequency === 'once') matches = days === 0;
    if (frequency === 'daily') matches = days % interval === 0;
    if (frequency === 'weekly') {
      const weekdays = Array.isArray(rule.weekdays) && rule.weekdays.length ? rule.weekdays : [start.getUTCDay()];
      matches = Math.floor(days / 7) % interval === 0 && weekdays.includes(d.getUTCDay());
    }
    if (frequency === 'monthly') {
      const monthDelta = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth();
      matches = monthDelta % interval === 0 && d.getUTCDate() === Math.min(Number(rule.day) || start.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate());
    }
    if (matches) out.push(iso(d));
    if (frequency === 'once') break;
  }
  return out;
}
