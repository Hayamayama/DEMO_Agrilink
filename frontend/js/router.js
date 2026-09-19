import { Focus } from './focus.js';

// Screen stack kept in sync with browser history so the platform's Right Soft Key
// ("back if history, else close") behaves correctly.
export function createRouter({ screens, els, ctxExtra = {} }) {
  const stack = [];
  const ctx = { ...ctxExtra };
  let focus = null;

  function show() {
    const entry = stack[stack.length - 1];
    const screen = screens[entry.name];
    els.status.textContent = screen.title || screen.name;
    els.content.replaceChildren();
    const root = document.createElement('div');
    root.className = 'scroll';
    els.content.appendChild(root);
    ctx.root = root;
    ctx.params = entry.params;
    ctx.rerender = show;
    const built = screen.render(ctx);
    if (built) root.appendChild(built);
    focus = new Focus(root);
    ctx.focus = focus;
    const l = screen.softLeft, c = screen.softCenter, r = screen.softRight;
    els.sl.textContent = l ? l.label : 'Menu';
    els.sc.textContent = c ? c.label : (focus.items.length ? 'Select' : '');
    els.sr.textContent = r ? r.label : (stack.length > 1 ? 'Back' : 'Exit');
    screen.onShow?.(ctx);
  }

  function hideCurrent() { screens[stack[stack.length - 1]?.name]?.onHide?.(ctx); }

  const router = {
    push(name, params) {
      hideCurrent();
      stack.push({ name, params });
      history.pushState({ d: stack.length - 1 }, '');
      show();
    },
    replace(name, params) { hideCurrent(); stack[stack.length - 1] = { name, params }; show(); },
    pop() { history.back(); }, // popstate handler below does the work; at root this closes the page
    reset() { if (stack.length > 1) history.go(-(stack.length - 1)); },
    start(name) {
      history.replaceState({ d: 0 }, '');
      stack.push({ name });
      show();
    },
    get depth() { return stack.length; },
  };
  ctx.router = router;

  addEventListener('popstate', (e) => {
    const d = e.state?.d ?? 0;
    hideCurrent();
    stack.length = Math.min(stack.length, d + 1);
    show();
  });

  router.dispatch = (action) => {
    const screen = screens[stack[stack.length - 1].name];
    if (screen.onKey?.(action, ctx) === true) return;
    switch (action) {
      case 'UP': return focus.move(-1);
      case 'DOWN': return focus.move(1);
      case 'ENTER': return screen.onEnter?.(focus.current, ctx, focus.index);
      case 'SOFT_L': return (screen.softLeft?.handler ?? (() => router.reset()))(ctx);
      case 'SOFT_R':
      case 'BACK': return (screen.softRight?.handler ?? (() => router.pop()))(ctx);
      default:
        if (action.startsWith('NUM_')) {
          const n = Number(action.slice(4));
          if (n >= 1 && focus.items[n - 1] && screen.numericSelect) {
            focus.set(n - 1);
            screen.onEnter?.(focus.current, ctx, n - 1);
          }
        }
    }
  };
  return router;
}
