import { describe, expect, it } from 'vitest';
import { Board, parseMoves } from '../../src/engine/board';
import { matchingPresets, presetConfig } from '../../src/agents/presets';
import { AGENTS } from '../../src/agents/registry';
import { solveColumns } from '../../src/engine/solver';
import { mulberry32 } from '../../src/engine/rng';
import { nonLosingColumns } from '../../src/engine/tactics';
import type { AgentConfig, MoveDecision } from '../../src/agents/types';

const never = { aborted: false };
const noop = () => {};

function cfg(patch: (c: AgentConfig) => void = () => {}): AgentConfig {
  const c = presetConfig('final');
  c.common.timeLimitMs = Infinity;
  c.common.recordTree = 'off';
  c.common.seed = 1;
  c.search.depth = 4;
  patch(c);
  return c;
}
const think = (moves: string, patch?: (c: AgentConfig) => void): Promise<MoveDecision> =>
  AGENTS.final.chooseMove({ moves: parseMoves(moves) }, cfg(patch), noop, never);

function midgame(plies: number, seed = 3): string {
  for (let k = 0; k < 200; k++) {
    const rng = mulberry32(seed + k);
    const b = new Board();
    let ok = true;
    for (let i = 0; i < plies; i++) {
      const opts = nonLosingColumns(b);
      if (!opts.length || b.isOver()) { ok = false; break; }
      const c = opts[Math.floor(rng() * opts.length)];
      if (b.wouldWin(c, b.turn)) { ok = false; break; }
      b.play(c);
    }
    if (ok && !b.isOver()) return Array.from(b.history.slice(0, plies), (c) => String(c + 1)).join('');
  }
  throw new Error('no position');
}

describe('final hierarchical agent', () => {
  it('level 1 (plan) opens in the centre', async () => {
    const d = await think('');
    expect(d.level).toBe('plan');
    expect(d.col).toBe(3);
  });

  it('plan is skipped when switched off', async () => {
    const d = await think('', (c) => (c.final.useOpening = false));
    expect(d.level).toBe('search');
  });

  it('search level takes a win in one and blocks a threat', async () => {
    const w = await think('121212', (c) => (c.final.useOpening = false));
    expect(w.col).toBe(0);
    const b = await think('12131', (c) => (c.final.useOpening = false));
    expect(b.level).toBe('search');
    expect(b.col).toBe(0);
    const p = await think('12131');
    expect(p.col).toBe(0);
  });

  it('level 3 (solve) from solveFrom on, and its move keeps the exact result', async () => {
    const moves = midgame(20);
    const n = parseMoves(moves).length;
    const d = await think(moves, (c) => (c.final.solveFrom = n));
    expect(d.level).toBe('solve');
    const res = solveColumns(parseMoves(moves), true);
    const vals = res.values.filter((v): v is number => v !== null);
    const best = Math.max(...vals);
    expect(Math.sign(res.values[d.col] as number)).toBe(Math.sign(best));
  });

  it('solver switched off keeps the search level in the endgame', async () => {
    const d = await think(midgame(20), (c) => {
      c.final.useSolver = false;
    });
    expect(d.level).toBe('search');
  });

  it('every evaluation kind gives a legal move', async () => {
    for (const kind of ['weighted', 'ourH', 'linear', 'td', 'network', 'committee'] as const) {
      const d = await think('4435', (c) => {
        c.final.useOpening = false;
        c.search.evaluation.kind = kind;
      });
      expect(Board.fromMoves(parseMoves('4435')).legalMoves()).toContain(d.col);
    }
  });

  it('Hard is the final agent; the chapter presets are distinct agents', () => {
    expect(matchingPresets(presetConfig('hard')).sort()).toEqual(['final', 'hard']);
    for (const id of ['ch3', 'ch6', 'learned'] as const) expect(matchingPresets(presetConfig(id))).toEqual([id]);
  });
});
