import { el } from '../dom.js';
import { demo, startGuidedDemo } from '../demo.js';
import { getJSON } from '../api.js';

const JOURNEYS = [
  ['Now', 'Today’s work, weather and spray decision', 'FarmGate'],
  ['Alerts', 'Read a fixed weather advisory aloud with #', 'DemoAlerts'],
  ['Trade', 'Review terms and pickup code before handover', 'MarketDeals'],
];

function item(number, title, detail) {
  const row = el('item demo-route');
  const body = el('demo-route-body');
  body.append(el('demo-route-title', `${number}  ${title}`), el('demo-route-detail dim', detail));
  row.appendChild(body);
  return row;
}

export const DemoWelcome = {
  name: 'Guided demo', title: 'AgriLink Demo', numericSelect: true,
  softLeft: { label: '' }, softRight: { label: '' },
  render() {
    const root = el('list');
    root.append(el('msg', 'A keypad-first farm service. Start with a fictional farmer and repeatable data.'));
    root.append(item(1, demo.loading ? 'Starting…' : 'Start guided demo', 'No phone number or PIN needed on stage.'));
    root.append(item(2, 'Sign in manually', 'Use a separate demo account.'));
    if (demo.error) root.append(el('msg', demo.error));
    return root;
  },
  onEnter(_el, ctx, i) {
    if (i === 0) startGuidedDemo(ctx);
    else if (i === 1) ctx.router.push('AuthWelcome');
  },
};

export const DemoHome = {
  name: 'Demo home', title: 'AgriLink · Demo', numericSelect: true,
  softLeft: { label: 'Guide', handler(ctx) { ctx.router.push('DemoGuide'); } },
  render() {
    const root = el('list');
    root.append(el('demo-banner', 'Judge path · 3 short tasks · keypad only'));
    JOURNEYS.forEach(([title, detail], i) => root.append(item(i + 1, title, detail)));
    root.append(el('msg', 'Tip: press # on any signed-in screen to hear its contents.'));
    return root;
  },
  onEnter(_el, ctx, i) { const route = JOURNEYS[i]?.[2]; if (route) ctx.router.push(route); },
};

export const DemoGuide = {
  name: 'Demo guide', title: 'Judge guide', numericSelect: true,
  softLeft: { label: '', handler() {} },
  render() {
    const root = el('list');
    root.append(el('msg', 'Each route demonstrates a task that remains usable without a touchscreen.'));
    root.append(item(1, 'Now', 'Use arrows and Enter to reach today’s action list.'));
    root.append(item(2, 'Alerts', 'Use # to read fixed advisory data; press # again to stop.'));
    root.append(item(3, 'Trade', 'Check quantity, payment, place and pickup code before handover.'));
    root.append(el('msg', 'Test evidence: 240×320, 128×160, RSK, # and *.'));
    return root;
  },
  onEnter(_el, ctx, i) { const route = JOURNEYS[i]?.[2]; if (route) ctx.router.push(route); },
};

let alertState = { status: 'idle', data: null, error: null };

async function loadAlerts(ctx) {
  alertState = { status: 'loading', data: null, error: null };
  ctx.rerender();
  try {
    const result = await getJSON('/api/demo/alerts');
    alertState = { status: 'ready', data: result.alert, error: null };
  } catch {
    alertState = { status: 'error', data: null, error: 'Demo advisory is unavailable.' };
  }
  ctx.rerender();
}

export const DemoAlerts = {
  name: 'Demo alerts', title: 'Alerts · Demo',
  softLeft: { label: '', handler() {} },
  softCenter: { label: 'Refresh', handler(ctx) { loadAlerts(ctx); } },
  onShow(ctx) { if (alertState.status === 'idle') loadAlerts(ctx); },
  onHide() { alertState = { status: 'idle', data: null, error: null }; },
  render() {
    if (alertState.status === 'loading') return el('msg', 'Loading fixed demo advisory…');
    if (alertState.status === 'error') return el('msg', alertState.error);
    const a = alertState.data;
    if (!a) return el('msg', 'Loading fixed demo advisory…');
    const root = el('list');
    root.append(el('demo-banner', `${a.source} · ${a.date}`));
    root.append(item(1, a.headline, a.action));
    a.details.forEach((detail, i) => root.append(item(i + 2, detail, '')));
    root.append(el('msg', a.disclosure));
    root.append(el('msg', 'Press # to read this advisory aloud.'));
    return root;
  },
};
