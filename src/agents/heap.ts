export class MinHeap<T> {
  private pri: number[] = [];
  private tie: number[] = [];
  private items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, tie: number, item: T): void {
    this.pri.push(priority);
    this.tie.push(tie);
    this.items.push(item);
    this.up(this.items.length - 1);
  }

  pop(): { priority: number; tie: number; item: T } {
    const top = { priority: this.pri[0], tie: this.tie[0], item: this.items[0] };
    const last = this.items.length - 1;
    if (last > 0) this.move(last, 0);
    this.pri.pop();
    this.tie.pop();
    this.items.pop();
    if (last > 0) this.down(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.pri[a] < this.pri[b] || (this.pri[a] === this.pri[b] && this.tie[a] < this.tie[b]);
  }

  private move(from: number, to: number): void {
    this.pri[to] = this.pri[from];
    this.tie[to] = this.tie[from];
    this.items[to] = this.items[from];
  }

  private swap(a: number, b: number): void {
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
    [this.tie[a], this.tie[b]] = [this.tie[b], this.tie[a]];
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
