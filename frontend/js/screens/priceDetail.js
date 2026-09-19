import { getJSON } from '../api.js';
import { user } from '../state.js';
import { money, signed, bars, h } from '../fmt.js';

let qty = 5, calc = null, error = null, loading = false;

function dataDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'Unknown date';
  const [year, month, day] = value.split('-');
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]} ${year}`;
}

async function load(ctx) {
  loading = true; error = null;
  const { crop, market } = ctx.params;
  try {
    calc = await getJSON(`/api/prices/net-profit?crop=${crop}&region=${user.region}&from=${user.homeMarket}&to=${market.code}&qty=${qty}`);
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
    head.append(h('', `${cropLabel} @ ${market.name}`), h('dim', bars(market.trend) + ' 7d'));
    wrap.appendChild(head);
    if (!calc) { wrap.appendChild(h('msg', error || 'Loading…')); return wrap; }

    const rows = [
      [`Sell at ${calc.to}`, `${money(calc.price_to, calc.currency)}/qt`],
      ['Your area', `${money(calc.price_from, calc.currency)}/qt`],
      [`Transport ~${calc.distance_km}km`, `${signed(-calc.transport_per_qt, calc.currency)}/qt`],
      ['Net gain', `${signed(calc.gain_per_qt, calc.currency)}/qt`],
      [`For ${calc.qty} qt  ◄ ►`, signed(calc.gain_total, calc.currency)],
    ];
    rows.forEach(([a, b], i) => {
      const r = h('item');
      r.append(h('', a), h(i >= 3 ? '' : 'dim', b));
      wrap.appendChild(r);
    });
    wrap.appendChild(h('msg dim', `Price data: ${dataDate(calc.price_date)} · ${calc.source === 'agmarknet' ? 'CEDA / AGMARKNET' : calc.source || 'Database'}`));
    if (calc.estimated) wrap.appendChild(h('msg dim hide-small', 'Transport is an estimate'));
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
