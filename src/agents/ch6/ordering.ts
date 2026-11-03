import { CENTRE_ORDER, COLS, ROWS } from '../../engine/lines';
import type { Board } from '../../engine/board';
import type { MoveOrdering } from '../types';

const NATURAL = [0, 1, 2, 3, 4, 5, 6];
const CENTRE_RANK = new Int8Array(COLS);
CENTRE_ORDER.forEach((c, i) => (CENTRE_RANK[c] = i));

export class MoveOrderer {
  private readonly killers = new Int8Array(2 * 64).fill(-1);
  private readonly history = new Float64Array(3 * COLS);

  constructor(readonly mode: MoveOrdering) {}

  order(board: Board, ply: number, ttMove: number): number[] {
    const base = this.mode === 'none' ? NATURAL : CENTRE_ORDER;
    const moves: number[] = [];
    for (const c of base) if (board.heights[c] < ROWS) moves.push(c);
    if (this.mode === 'none') return moves;
    if (this.mode === 'centre') {
      const i = moves.indexOf(ttMove);
      if (i > 0) {
        moves.splice(i, 1);
        moves.unshift(ttMove);
      }
      return moves;
    }
    const p = board.turn;
    const k0 = this.killers[2 * ply];
    const k1 = this.killers[2 * ply + 1];
    const key = (c: number): number => {
      if (c === ttMove) return 1e15;
      if (c === k0) return 1e14;
      if (c === k1) return 1e13;
      return this.history[p * COLS + c] * 8 + (7 - CENTRE_RANK[c]);
    };
    return moves.sort((a, b) => key(b) - key(a));
  }

  cutoff(board: Board, ply: number, col: number, depth: number): void {
    if (this.mode !== 'killerHistory') return;
    if (this.killers[2 * ply] !== col) {
      this.killers[2 * ply + 1] = this.killers[2 * ply];
      this.killers[2 * ply] = col;
    }
    this.history[board.turn * COLS + col] += depth * depth;
  }
}
