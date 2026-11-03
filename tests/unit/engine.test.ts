import { describe, expect, it } from 'vitest';
import { Board, movesToString, parseMoves } from '../../src/engine/board';
import { LINES, LINE_COUNT, LINES_THROUGH, cellIndex } from '../../src/engine/lines';
import { hCost } from '../../src/engine/heuristics';
import { boardFromKey } from '../../src/engine/model';
import { mulberry32 } from '../../src/engine/rng';

function boardWithLine(cells: number[]): Board {
  const b = new Board();
  for (const i of cells) b.cells[i] = 1;
  return b;
}

describe('lines', () => {
  it('has 69 distinct lines of four', () => {
    expect(LINE_COUNT).toBe(69);
    const keys = new Set<string>();
    for (let l = 0; l < LINE_COUNT; l++) keys.add(Array.from(LINES.slice(4 * l, 4 * l + 4)).sort().join(','));
    expect(keys.size).toBe(69);
  });

  it('detects every line as a win', () => {
    for (let l = 0; l < LINE_COUNT; l++) {
      const cells = Array.from(LINES.slice(4 * l, 4 * l + 4));
      const b = boardWithLine(cells);
      for (const c of cells) expect(b.isWinAt(c, 1)).toBe(true);
    }
  });

  it('every cell is on 3 to 13 lines', () => {
    const counts = LINES_THROUGH.map((x) => x.length);
    expect(Math.min(...counts)).toBe(3);
    expect(Math.max(...counts)).toBe(13);
  });
});

describe('board', () => {
  it('applies gravity', () => {
    const b = Board.fromMoves('444');
    expect(b.cells[cellIndex(3, 0)]).toBe(1);
    expect(b.cells[cellIndex(3, 1)]).toBe(2);
    expect(b.cells[cellIndex(3, 2)]).toBe(1);
    expect(b.heights[3]).toBe(3);
  });

  it('rejects a move into a full column', () => {
    expect(() => Board.fromMoves('4444444')).toThrow();
  });

  it('detects horizontal, vertical and both diagonal wins', () => {
    expect(Board.fromMoves('1122334').winner()).toBe(1);
    expect(Board.fromMoves('1212121').winner()).toBe(1);
    expect(Board.fromMoves('12234334454').winner()).toBe(1);
    expect(Board.fromMoves('76654554434').winner()).toBe(1);
    expect(Board.fromMoves('112233').winner()).toBe(0);
  });

  it('reaches a full-board draw', () => {
    const seq = '1234567' + '1234567' + '2345671' + '2345671' + '1234567' + '1234567';
    const b = new Board();
    const rng = mulberry32(7);
    let ok = false;
    for (let attempt = 0; attempt < 5000 && !ok; attempt++) {
      while (b.count) b.undo();
      const cols = attempt === 0 ? parseMoves(seq) : [];
      let i = 0;
      while (!b.isOver()) {
        const legal = b.legalMoves();
        const c = attempt === 0 && i < cols.length && b.canPlay(cols[i]) ? cols[i] : legal[Math.floor(rng() * legal.length)];
        i++;
        b.play(c);
      }
      ok = b.isFull() && b.winner() === 0;
    }
    expect(ok).toBe(true);
    expect(b.isOver()).toBe(true);
    expect(b.legalMoves()).toEqual([]);
  });

  it('play/undo restores cells, heights and hash exactly', () => {
    const rng = mulberry32(42);
    for (let g = 0; g < 200; g++) {
      const b = new Board();
      const snaps: { cells: string; heights: string; hi: number; lo: number; wins: boolean }[] = [];
      while (!b.isOver()) {
        snaps.push({ cells: b.cells.join(''), heights: b.heights.join(''), hi: b.hashHi, lo: b.hashLo, wins: b.lastWins });
        const legal = b.legalMoves();
        b.play(legal[Math.floor(rng() * legal.length)]);
      }
      while (b.count) {
        b.undo();
        const s = snaps.pop()!;
        expect(b.cells.join('')).toBe(s.cells);
        expect(b.heights.join('')).toBe(s.heights);
        expect(b.hashHi).toBe(s.hi);
        expect(b.hashLo).toBe(s.lo);
        expect(b.lastWins).toBe(s.wins);
      }
      expect(b.hashHi).toBe(0);
      expect(b.hashLo).toBe(0);
    }
  });

  it('hash is path independent (transpositions collide, as they should)', () => {
    const a = Board.fromMoves('4536');
    const b = Board.fromMoves('3546');
    expect(a.hashKey()).toBe(b.hashKey());
    expect(a.exactKey()).toBe(b.exactKey());
  });

  it('round-trips move strings', () => {
    const s = '4453362215';
    expect(Board.fromMoves(s).moveString()).toBe(s);
    expect(movesToString(parseMoves(s))).toBe(s);
    expect(() => parseMoves('48')).toThrow();
  });

  it('round-trips exact keys', () => {
    const rng = mulberry32(3);
    for (let g = 0; g < 100; g++) {
      const b = new Board();
      const n = Math.floor(rng() * 30);
      for (let i = 0; i < n && !b.isOver(); i++) {
        const legal = b.legalMoves();
        b.play(legal[Math.floor(rng() * legal.length)]);
      }
      const c = boardFromKey(b.exactKey());
      expect(c.cells.join('')).toBe(b.cells.join(''));
      expect(c.heights.join('')).toBe(b.heights.join(''));
      expect(c.count).toBe(b.count);
      expect(c.hashKey()).toBe(b.hashKey());
    }
  });
});

describe('h(n)', () => {
  it('is 4 on the empty board and ∞ when no open line is left', () => {
    expect(hCost(new Board(), 1)).toBe(4);
    const b = new Board();
    for (let i = 0; i < 42; i++) b.cells[i] = 2;
    expect(hCost(b, 1)).toBe(Infinity);
  });

  it('matches the Assignment 3 report example (h = 2)', () => {
    const b = Board.fromMoves('354344');
    expect(hCost(b, 1)).toBe(2);
  });
});
