// Multi-tap English text entry for a 12-key pad. Pure state machine: no DOM, no
// timers owned by the caller's screen, so it can be unit-tested and reused.
//
// A key press either cycles the pending character (same key, within WINDOW_MS)
// or commits the pending one and starts a new character. `#` commits early; a
// second `#` inside DOUBLE_MS is the screen's submit gesture.
export const KEY_CHARS = {
  1: '.,?!1',
  2: 'abc2',
  3: 'def3',
  4: 'ghi4',
  5: 'jkl5',
  6: 'mno6',
  7: 'pqrs7',
  8: 'tuv8',
  9: 'wxyz9',
  0: ' 0',
};

export const WINDOW_MS = 800;   // same-key cycle window
export const DOUBLE_MS = 700;   // '#' '#' = submit

export class MultiTap {
  constructor({ max = 300, now = () => Date.now() } = {}) {
    this.max = max;
    this.now = now;
    this.text = '';
    this.pendingKey = null;
    this.pendingIndex = 0;
    this.pendingAt = 0;
    this.lastHash = 0;
  }

  /** Text as it should be displayed, including the character still being cycled. */
  get value() {
    return this.pendingKey == null ? this.text : this.text + KEY_CHARS[this.pendingKey][this.pendingIndex];
  }

  get length() { return this.value.length; }
  get isFull() { return this.length >= this.max; }

  press(digit) {
    const chars = KEY_CHARS[digit];
    if (!chars) return this.value;
    const t = this.now();
    const sameKey = this.pendingKey === digit && t - this.pendingAt < WINDOW_MS;
    if (sameKey) {
      this.pendingIndex = (this.pendingIndex + 1) % chars.length;
    } else {
      this.commit();
      if (this.text.length >= this.max) return this.value; // hard cap, silently ignore
      this.pendingKey = digit;
      this.pendingIndex = 0;
    }
    this.pendingAt = t;
    return this.value;
  }

  /** Fixes the pending character in place. Safe to call repeatedly. */
  commit() {
    if (this.pendingKey != null) {
      this.text += KEY_CHARS[this.pendingKey][this.pendingIndex];
      this.pendingKey = null;
      this.pendingIndex = 0;
    }
    return this.text;
  }

  /** '#': commit, and report whether this was the second '#' (= submit). */
  hash() {
    const t = this.now();
    const isDouble = t - this.lastHash < DOUBLE_MS;
    this.lastHash = t;
    this.commit();
    return isDouble ? 'submit' : 'commit';
  }

  backspace() {
    if (this.pendingKey != null) {
      this.pendingKey = null;
      this.pendingIndex = 0;
    } else {
      this.text = this.text.slice(0, -1);
    }
    return this.value;
  }

  clear() {
    this.text = '';
    this.pendingKey = null;
    this.pendingIndex = 0;
    return '';
  }

  set(text) {
    this.pendingKey = null;
    this.pendingIndex = 0;
    this.text = String(text).slice(0, this.max);
    return this.text;
  }
}

// Whole-question completions offered on Up/Down. Deliberately a short, fixed list:
// it keeps a keypad user from typing 40 characters, and needs no dictionary download.
export const COMPLETIONS = [
  'My crop leaves are turning yellow. What should I check first?',
  'Is it safe to spray today?',
  'Should I sell my rice now or wait?',
  'What subsidy can I apply for?',
  'How much water does my field need this week?',
  'There are insects under the leaves. What are they?',
  'When should I harvest?',
  'The soil is cracking. What should I do?',
];

/** Completions whose start matches what has been typed so far. */
export function suggest(text) {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return COMPLETIONS.filter((c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q);
}
