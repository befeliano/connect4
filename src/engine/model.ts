import { Board } from './board';
import { COLS, ROWS, cellIndex } from './lines';
import { ruleMove } from './opponentRule';

export const GOAL = 0;
export const DEAD = 1;
export const STATE = 2;
export type Outcome = typeof GOAL | typeof DEAD | typeof STATE;

export function step(board: Board, col: number): Outcome {
  if (board.play(col)) return GOAL;
  if (board.isFull()) return DEAD;
  const reply = ruleMove(board);
  if (board.play(reply) || board.isFull()) return DEAD;
  return STATE;
}

export function restore(board: Board, count: number): void {
  while (board.count > count) board.undo();
}

export function actions(board: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (board.heights[c] < ROWS) out.push(c);
  return out;
}

export function boardFromKey(key: number): Board {
  const b = new Board();
  let k = key;
  let count = 0;
  for (let c = 0; c < COLS; c++) {
    const code = k % 128;
    k = Math.floor(k / 128);
    let h = 6;
    while (h > 0 && !(code & (1 << h))) h--;
    b.heights[c] = h;
    for (let r = 0; r < h; r++) b.cells[cellIndex(c, r)] = code & (1 << r) ? 1 : 2;
    count += h;
  }
  b.count = count;
  b.rehash();
  return b;
}
