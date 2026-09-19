// Keypad acceptance tests for the handset's multi-tap engine (frontend/js/t9.js).
// It is a pure module, so it runs under node:test without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiTap, suggest, WINDOW_MS, DOUBLE_MS } from '../../frontend/js/t9.js';

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('same key within the window cycles letters', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.press(4); mt.press(4);
  assert.equal(mt.value, 'h');
});

test('pause longer than the window starts a new character', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.press(4); mt.press(4);
  c.advance(WINDOW_MS + 1);
  mt.press(4); mt.press(4); mt.press(4);
  assert.equal(mt.value, 'hi');
});

test('a different key commits the pending character immediately', () => {
  const mt = new MultiTap({ now: clock().now });
  mt.press(2); mt.press(3);
  assert.equal(mt.value, 'ad');
  assert.equal(mt.text, 'a');
});

test('0 is space, 1 cycles punctuation', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.press(4); mt.press(0); mt.press(1); mt.press(1); mt.press(1);
  assert.equal(mt.value, 'g ?');
});

test('cycling wraps around to the digit and back', () => {
  const mt = new MultiTap({ now: clock().now });
  for (let i = 0; i < 5; i++) mt.press(2); // a b c 2 a
  assert.equal(mt.value, 'a');
});

test('* deletes the pending character first, then committed text', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.press(2); c.advance(WINDOW_MS + 1); mt.press(3);
  mt.backspace();
  assert.equal(mt.value, 'a');
  mt.backspace();
  assert.equal(mt.value, '');
  mt.backspace();
  assert.equal(mt.value, '');
});

test('single # commits, second # within 700ms submits', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.press(2);
  assert.equal(mt.hash(), 'commit');
  assert.equal(mt.text, 'a');
  c.advance(DOUBLE_MS - 1);
  assert.equal(mt.hash(), 'submit');
});

test('slow second # does not submit', () => {
  const c = clock();
  const mt = new MultiTap({ now: c.now });
  mt.hash();
  c.advance(DOUBLE_MS + 1);
  assert.equal(mt.hash(), 'commit');
});

test('text is capped at the maximum length', () => {
  const c = clock();
  const mt = new MultiTap({ max: 3, now: c.now });
  for (const k of [2, 3, 4, 5, 6]) mt.press(k);
  assert.equal(mt.value.length, 3);
  assert.equal(mt.value, 'adg');
});

test('completions match the typed prefix only', () => {
  assert.ok(suggest('sh')[0].startsWith('Should I sell'));
  assert.deepEqual(suggest('s'), [], 'one letter is too short to suggest');
  assert.deepEqual(suggest('zzz'), []);
});
