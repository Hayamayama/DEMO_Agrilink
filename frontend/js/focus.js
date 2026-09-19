// Vertical/linear focus over elements marked .item inside a container.
export class Focus {
  constructor(root) {
    this.root = root;
    this.items = [...root.querySelectorAll('.item')];
    this.index = 0;
    this.apply();
  }
  get current() { return this.items[this.index]; }
  move(delta) { // stops at the ends (no wrap)
    if (!this.items.length) return;
    this.index = Math.max(0, Math.min(this.items.length - 1, this.index + delta));
    this.apply();
  }
  set(i) { this.index = i; this.apply(); }
  apply() {
    this.items.forEach((el, i) => el.classList.toggle('focused', i === this.index));
    this.current?.scrollIntoView({ block: 'nearest' });
  }
}
