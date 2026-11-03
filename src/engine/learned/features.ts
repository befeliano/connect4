import type { Board } from '../board';
import { COLS, LINES, LINE_COUNT, LINES_THROUGH, ROWS, SIZE } from '../lines';

export const NF = 13;

export const FS: readonly number[] = [6, 3, 6, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1];

export const FEATURE_NAMES: readonly string[] = [
  'my open 2-in-lines',
  'my open 3-in-lines',
  'their open 2-in-lines',
  'their open 3-in-lines',
  'my discs in centre',
  'their discs in centre',
  'my threat cells',
  'their threat cells',
  'my threats, odd rows',
  'my threats, even rows',
  'their threats, odd rows',
  'their threats, even rows',
  'side to move (bias)',
];

function completesFour(cells: Int8Array, i: number, p: number): boolean {
  const through = LINES_THROUGH[i];
  for (let k = 0; k < through.length; k++) {
    const b = through[k] * 4;
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = LINES[b + j];
      if (c === i) continue;
      if (cells[c] === p) n++;
      else break;
    }
    if (n === 3) return true;
  }
  return false;
}

export function features(board: Board, me: number, out: Float64Array = new Float64Array(NF)): Float64Array {
  const cells = board.cells;
  const them = me === 1 ? 2 : 1;
  out.fill(0);
  for (let l = 0; l < LINE_COUNT; l++) {
    const b = l * 4;
    let a = 0;
    let o = 0;
    for (let k = 0; k < 4; k++) {
      const v = cells[LINES[b + k]];
      if (v === me) a++;
      else if (v === them) o++;
    }
    if (o === 0) {
      if (a === 2) out[0]++;
      else if (a === 3) out[1]++;
    }
    if (a === 0) {
      if (o === 2) out[2]++;
      else if (o === 3) out[3]++;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    const v = cells[r * COLS + 3];
    if (v === me) out[4]++;
    else if (v === them) out[5]++;
  }
  for (let i = 0; i < SIZE; i++) {
    if (cells[i] !== 0) continue;
    const odd = ((i / COLS) | 0) % 2 === 0;
    if (completesFour(cells, i, me)) {
      out[6]++;
      if (odd) out[8]++;
      else out[9]++;
    }
    if (completesFour(cells, i, them)) {
      out[7]++;
      if (odd) out[10]++;
      else out[11]++;
    }
  }
  out[12] = 1;
  return out;
}
