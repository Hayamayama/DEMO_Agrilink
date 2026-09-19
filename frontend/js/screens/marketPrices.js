import { getJSON } from '../api.js';
import { user } from '../state.js';
import { money, h } from '../fmt.js';

const CROPS = [['rice', 'Rice'], ['wheat', 'Wheat'], ['onion', 'Onion'], ['tomato', 'Tomato']];
let ci = 0, data = null, error = null, loading = false, lastIdx = 0;

async function load(ctx) {
  loading = true; error = null;
  try {
    data = await getJSON(`/api/prices?crop=${CROPS[ci][0]}&region=${user.region}&home=${user.homeMarket}`);
  } catch {
    data = null; error = 'Prices unavailable';
  }
  loading = false;
  ctx.rerender();
}

function switchCrop(ctx, delta) {
  ci = (ci + delta + CROPS.length) % CROPS.length;
  data = null; error = null; lastIdx = 0;
  ctx.rerender(); // onShow reloads
}

export default {
  name: 'MarketPrices',
  title: 'Market Prices',
  softCenter: { label: 'Detail' },
  initialFocus: () => lastIdx,
  onShow(ctx) { if (!data && !loading && !error) load(ctx); },
  onHide() { error = null; },
  render() {
    const wrap = h('list');
    const crop = h('item');
    crop.append(h('', `◄ ${CROPS[ci][1]} ►`));
    wrap.appendChild(crop);

    if (!data) { wrap.appendChild(h('msg', error || 'Loading…')); return wrap; }

    data.markets.forEach((m, i) => {
      const row = h('item');
      const arrow = m.change_pct > 0 ? '▲' : m.change_pct < 0 ? '▼' : '';
      row.append(h('', i === 0 ? 'Your area' : m.name), h('dim', `${money(m.price, data.currency)}/qt ${arrow}`));
      wrap.appendChild(row);
    });
    wrap.appendChild(h('msg', `Tip: ${data.analysis.reason}`));
    if (data.sample) wrap.appendChild(h('msg dim hide-small', 'Sample data'));
    return wrap;
  },
  onKey(action, ctx) {
    if (ctx.focus.index === 0 && (action === 'LEFT' || action === 'RIGHT')) {
      switchCrop(ctx, action === 'LEFT' ? -1 : 1);
      return true;
    }
    return false;
  },
  onEnter(_el, ctx, i) {
    if (i === 0 || !data) return;
    lastIdx = i;
    ctx.router.push('PriceDetail', { crop: CROPS[ci][0], cropLabel: CROPS[ci][1], market: data.markets[i - 1] });
  },
};
