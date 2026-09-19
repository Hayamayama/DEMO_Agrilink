import { getJSON } from '../api.js';
import { user, identity } from '../state.js';
import { money, signed, bars, h } from '../fmt.js';

let qty = 5, calc = null, error = null, loading = false;

function dataDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'Unknown date';
  const [year, month, day] = value.split('-');
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]} ${year}`;
}

async function load(ctx) {
  loading = true; error = null;
  const { crop, market, home, region } = ctx.params;
  try {
    const p = identity.profile;
    const at = p?.regionLat != null && p?.regionLng != null ? `&lat=${p.regionLat}&lng=${p.regionLng}` : '';
    calc = await getJSON(`/api/prices/net-profit?crop=${crop}&region=${region || user.region}&from=${home || user.homeMarket}&to=${market.code}&qty=${qty}${at}`);
  } catch {
    calc = null; error = 'Calculation unavailable';
  }
  loading = false;
  ctx.rerender();
}

export default {
  name: 'PriceDetail',
  title: 'Net Profit',
  softCenter: { label: '' },
  onShow(ctx) { if (!calc && !loading && !error) load(ctx); },
  onHide() { calc = null; error = null; qty = 5; },
  render(ctx) {
    const wrap = h('list');
    const { cropLabel, market } = ctx.params;
    const head = h('', null);
    head.style.padding = 'var(--pad)';
    // Daily sync builds the history one day at a time; a one-point "trend" would be noise.
    const trend = market.trend.length > 1 ? `${bars(market.trend)} last ${market.trend.length} prices` : 'Trend appears after a few days of prices';
    head.append(h('', `${cropLabel} @ ${market.name}`), h('dim', trend));
    wrap.appendChild(head);
    if (!calc) { wrap.appendChild(h('msg', error || 'Loading…')); return wrap; }

    const rows = [
      [`${calc.to} market`, `${money(calc.price_to, calc.currency)}/qt`],
      [calc.from_distance_km > 25 ? `Nearest · ${calc.from}` : 'Your area', `${money(calc.price_from, calc.currency)}/qt`],
      // Unknown distance is shown as unknown, never as a free trip.
      !calc.transport_known ? ['Transport', 'not known']
        // Both trips start from the member: the extra cost of the longer one.
        : calc.from_distance_km != null ? [`Extra trip ${calc.distance_km} vs ${calc.from_distance_km}km`, `${signed(-calc.transport_per_qt, calc.currency)}/qt`]
          : [`Transport ~${calc.distance_km}km`, `${signed(-calc.transport_per_qt, calc.currency)}/qt`],
      [calc.transport_known ? 'Net gain' : 'Gain before transport', `${signed(calc.gain_per_qt, calc.currency)}/qt`],
      [`For ${calc.qty} qt  ◄ ►`, signed(calc.gain_total, calc.currency)],
    ];
    rows.forEach(([a, b], i) => {
      const r = h('item');
      r.append(h('', a), h(i >= 3 ? '' : 'dim', b));
      wrap.appendChild(r);
    });
    wrap.appendChild(h('msg dim', `Price data: ${dataDate(calc.price_date)} · ${calc.source === 'agmarknet' ? 'Agmarknet (Govt of India)' : calc.source || 'Database'}`));
    if (!calc.same_day) wrap.appendChild(h('msg', `Prices are from different days: ${dataDate(calc.to_date)} vs ${dataDate(calc.from_date)}.`));
    wrap.appendChild(h('msg dim hide-small', `${calc.transport_known ? 'Transport is an estimate. ' : ''}Before market fees and commission.`));
    return wrap;
  },
  onKey(action, ctx) {
    if (action === 'LEFT' || action === 'RIGHT') {
      qty = Math.max(1, Math.min(100, qty + (action === 'LEFT' ? -1 : 1)));
      calc = null; error = null;
      ctx.rerender();
      return true;
    }
    return false;
  },
};
