// Central key map. Soft-key values differ between devices/simulators:
// open the app with ?debug=1 to see real KeyboardEvent.key/keyCode values, then fix here.
export const KEYMAP = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Enter: 'ENTER',
  SoftLeft: 'SOFT_L', SoftRight: 'SOFT_R',
  Backspace: 'BACK',
  // Official sample (cloudphone-demo) maps desktop Escape -> left soft key, F12 -> right soft key.
  Escape: 'SOFT_L', F12: 'SOFT_R',
  '*': 'STAR', '#': 'HASH',
};
for (let i = 0; i <= 9; i++) KEYMAP[String(i)] = `NUM_${i}`;

// Fallbacks for feature-phone browsers that report soft keys by code only.
const KEYCODE_MAP = { 112: 'SOFT_L', 113: 'SOFT_R' }; // F1 / F2 (common emulator mapping)

export function initKeypad(dispatch, { debug = false } = {}) {
  let overlay;
  if (debug) {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:0;top:0;right:0;background:#000;color:#0f0;font-size:10px;z-index:9;padding:2px';
    document.body.appendChild(overlay);
  }
  addEventListener('keydown', (e) => {
    if (overlay) overlay.textContent = `key=${e.key} code=${e.code} kc=${e.keyCode}`;
    const action = KEYMAP[e.key] || KEYCODE_MAP[e.keyCode];
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  });
}
