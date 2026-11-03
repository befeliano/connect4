import { COLS, ROWS, SIZE, LINES, LINES_THROUGH, cellIndex } from './lines';
import { mulberry32 } from './rng';

export type Player = 1 | 2;
export const other = (p: Player): Player => (p === 1 ? 2 : 1);

const zrng = mulberry32(0xc0ffee);
const Z_HI = new Uint32Array(3 * SIZE);
const Z_LO = new Uint32Array(3 * SIZE);
for (let i = 0; i < 3 * SIZE; i++) {
  Z_HI[i] = (zrng() * 4294967296) >>> 0;
  Z_LO[i] = (zrng() * 4294967296) >>> 0;
}

export class Board {
  readonly cells = new Int8Array(SIZE);
  readonly heights = new Int8Array(COLS);
  readonly history = new Int8Array(SIZE);
  count = 0;
  hashHi = 0;
  hashLo = 0;
  lastWins = false;
  private readonly winStack = new Uint8Array(SIZE + 1);

  static fromMoves(moves: string | number[]): Board {
    const b = new Board();
    const cols = typeof moves === 'string' ? parseMoves(moves) : moves;
    for (const c of cols) {
      if (b.isOver()) throw new Error('Move after game end');
      if (!b.canPlay(c)) throw new Error(`Illegal move: column ${c + 1}`);
      b.play(c);
    }
    return b;
  }

  clone(): Board {
    const b = new Board();
    b.cells.set(this.cells);
    b.heights.set(this.heights);
    b.history.set(this.history);
    b.count = this.count;
    b.hashHi = this.hashHi;
    b.hashLo = this.hashLo;
    b.lastWins = this.lastWins;
    b.winStack.set(this.winStack);
    return b;
  }

  rehash(): void {
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < SIZE; i++) {
      const p = this.cells[i];
      if (p) {
        hi ^= Z_HI[p * SIZE + i];
        lo ^= Z_LO[p * SIZE + i];
      }
    }
    this.hashHi = hi >>> 0;
    this.hashLo = lo >>> 0;
  }

  get turn(): Player {
    return (this.count & 1) === 0 ? 1 : 2;
  }

  canPlay(col: number): boolean {
    return col >= 0 && col < COLS && this.heights[col] < ROWS;
  }

  isFull(): boolean {
    return this.count === SIZE;
  }

  isOver(): boolean {
    return this.lastWins || this.count === SIZE;
  }

  winner(): 0 | Player {
    if (!this.lastWins) return 0;
    return (this.count & 1) === 1 ? 1 : 2;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    if (this.isOver()) return out;
    for (let c = 0; c < COLS; c++) if (this.heights[c] < ROWS) out.push(c);
    return out;
  }

  play(col: number): boolean {
    const p = this.turn;
    const row = this.heights[col];
    const i = cellIndex(col, row);
    this.cells[i] = p;
    this.heights[col] = row + 1;
    this.history[this.count] = col;
    this.count++;
    const z = p * SIZE + i;
    this.hashHi = (this.hashHi ^ Z_HI[z]) >>> 0;
    this.hashLo = (this.hashLo ^ Z_LO[z]) >>> 0;
    this.winStack[this.count - 1] = this.lastWins ? 1 : 0;
    this.lastWins = this.isWinAt(i, p);
    return this.lastWins;
  }

  undo(): void {
    if (this.count === 0) throw new Error('Nothing to undo');
    this.count--;
    const col = this.history[this.count];
    const row = this.heights[col] - 1;
    const i = cellIndex(col, row);
    const p = this.cells[i];
    this.cells[i] = 0;
    this.heights[col] = row;
    const z = p * SIZE + i;
    this.hashHi = (this.hashHi ^ Z_HI[z]) >>> 0;
    this.hashLo = (this.hashLo ^ Z_LO[z]) >>> 0;
    this.lastWins = this.winStack[this.count] === 1;
  }

  isWinAt(i: number, p: number): boolean {
    const through = LINES_THROUGH[i];
    const cells = this.cells;
    for (let k = 0; k < through.length; k++) {
      const b = through[k] * 4;
      if (cells[LINES[b]] === p && cells[LINES[b + 1]] === p && cells[LINES[b + 2]] === p && cells[LINES[b + 3]] === p) {
        return true;
      }
    }
    return false;
  }

  wouldWin(col: number, p: number): boolean {
    const row = this.heights[col];
    if (row >= ROWS) return false;
    const i = cellIndex(col, row);
    this.cells[i] = p;
    const w = this.isWinAt(i, p);
    this.cells[i] = 0;
    return w;
  }

  winningLine(): number[] | null {
    if (!this.lastWins || this.count === 0) return null;
    const col = this.history[this.count - 1];
    const i = cellIndex(col, this.heights[col] - 1);
    const p = this.cells[i];
    for (const l of LINES_THROUGH[i]) {
      const b = l * 4;
      const line = [LINES[b], LINES[b + 1], LINES[b + 2], LINES[b + 3]];
      if (line.every((c) => this.cells[c] === p)) return line;
    }
    return null;
  }

  hashKey(): string {
    return this.hashHi.toString(36) + ':' + this.hashLo.toString(36);
  }

  exactKey(): number {
    let key = 0;
    for (let c = COLS - 1; c >= 0; c--) {
      const h = this.heights[c];
      let code = 1 << h;
      for (let r = 0; r < h; r++) if (this.cells[r * COLS + c] === 1) code |= 1 << r;
      key = key * 128 + code;
    }
    return key;
  }

  moveString(): string {
    return movesToString(Array.from(this.history.subarray(0, this.count)));
  }

  toString(): string {
    const sym = ['.', 'X', 'O'];
    const rows: string[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      let s = '';
      for (let c = 0; c < COLS; c++) s += sym[this.cells[cellIndex(c, r)]];
      rows.push(s);
    }
    return rows.join('\n');
  }
}

export function parseMoves(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.trim()) {
    const n = ch.charCodeAt(0) - 49;
    if (n < 0 || n >= COLS) throw new Error(`Bad move character "${ch}"`);
    out.push(n);
  }
  return out;
}

export function movesToString(cols: number[]): string {
  return cols.map((c) => String(c + 1)).join('');
}
