export const COLS = 7;
export const ROWS = 6;
export const SIZE = COLS * ROWS;

export const cellIndex = (col: number, row: number): number => row * COLS + col;
export const colOf = (index: number): number => index % COLS;
export const rowOf = (index: number): number => (index / COLS) | 0;

export const LINES: Int8Array = (() => {
  const out: number[] = [];
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dc, dr] of dirs) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const endCol = col + 3 * dc;
        const endRow = row + 3 * dr;
        if (endCol < 0 || endCol >= COLS || endRow < 0 || endRow >= ROWS) continue;
        for (let k = 0; k < 4; k++) out.push(cellIndex(col + k * dc, row + k * dr));
      }
    }
  }
  return Int8Array.from(out);
})();

export const LINE_COUNT = LINES.length / 4;

export const LINES_THROUGH: Int16Array[] = (() => {
  const lists: number[][] = Array.from({ length: SIZE }, () => []);
  for (let l = 0; l < LINE_COUNT; l++) {
    for (let k = 0; k < 4; k++) lists[LINES[4 * l + k]].push(l);
  }
  return lists.map((ls) => Int16Array.from(ls));
})();

export const CENTRE_ORDER: readonly number[] = [3, 2, 4, 1, 5, 0, 6];
