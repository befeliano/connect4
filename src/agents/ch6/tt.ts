export const EXACT = 0;
export const LOWER = 1;
export const UPPER = 2;

const ENTRY_BYTES = 4 + 4 + 8 + 1 + 1 + 1;

export class TranspositionTable {
  readonly size: number;
  private readonly mask: number;
  private readonly hi: Uint32Array;
  private readonly lo: Uint32Array;
  private readonly score: Float64Array;
  private readonly depth: Int8Array;
  private readonly flag: Int8Array;
  private readonly move: Int8Array;
  private readonly used: Uint8Array;

  constructor(sizeMB: number) {
    const want = Math.max(1024, Math.floor((sizeMB * 1024 * 1024) / ENTRY_BYTES));
    let size = 1024;
    while (size * 2 <= want) size *= 2;
    this.size = size;
    this.mask = size - 1;
    this.hi = new Uint32Array(size);
    this.lo = new Uint32Array(size);
    this.score = new Float64Array(size);
    this.depth = new Int8Array(size);
    this.flag = new Int8Array(size);
    this.move = new Int8Array(size);
    this.used = new Uint8Array(size);
  }

  probe(hi: number, lo: number): number {
    const i = lo & this.mask;
    return this.used[i] && this.hi[i] === hi && this.lo[i] === lo ? i : -1;
  }

  store(hi: number, lo: number, depth: number, flag: number, score: number, move: number): void {
    const i = lo & this.mask;
    this.used[i] = 1;
    this.hi[i] = hi;
    this.lo[i] = lo;
    this.depth[i] = depth;
    this.flag[i] = flag;
    this.score[i] = score;
    this.move[i] = move;
  }

  depthAt(i: number): number {
    return this.depth[i];
  }
  flagAt(i: number): number {
    return this.flag[i];
  }
  scoreAt(i: number): number {
    return this.score[i];
  }
  moveAt(i: number): number {
    return this.move[i];
  }
}
