import type { Board } from './board';
import { COLS, ROWS } from './lines';

export function winningColumns(board: Board, p: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (board.heights[c] < ROWS && board.wouldWin(c, p)) out.push(c);
  return out;
}

export function nonLosingColumns(board: Board): number[] {
  const me = board.turn;
  const them = me === 1 ? 2 : 1;
  const threats = winningColumns(board, them);
  if (threats.length > 1) return [];
  const pool = threats.length === 1 ? threats : board.legalMoves();
  const out: number[] = [];
  for (const c of pool) {
    const row = board.heights[c];
    if (row + 1 < ROWS) {
      const i = row * COLS + c;
      board.cells[i] = me;
      board.heights[c] = row + 1;
      const bad = board.wouldWin(c, them);
      board.heights[c] = row;
      board.cells[i] = 0;
      if (bad) continue;
    }
    out.push(c);
  }
  return out;
}
