export const money = (n, cur = 'INR') => {
  const sym = cur === 'INR' ? '₹' : cur + ' ';
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${sym}${s}`;
};
export const signed = (n, cur) => (n > 0 ? '+' : '') + money(n, cur);

// 7-point text sparkline; scales to the series' own min/max.
export function bars(values) {
  const chars = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v) => chars[Math.round(((v - min) / span) * (chars.length - 1))]).join('');
}

export function h(cls, text) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}
