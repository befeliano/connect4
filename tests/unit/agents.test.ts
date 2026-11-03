import { describe, expect, it } from 'vitest';
import { Board, parseMoves } from '../../src/engine/board';
import { mulberry32 } from '../../src/engine/rng';
import { defaultConfig, presetConfig } from '../../src/agents/presets';
import { AGENTS, runAgent } from '../../src/agents/registry';
import { checkDeviation } from '../../src/agents/ch3/planner';
import type { AgentConfig, AlgorithmId, MoveDecision } from '../../src/agents/types';

function strongAB() {
  const c = presetConfig('medium');
  c.search.iterativeDeepening = true;
  c.search.moveOrdering = 'killerHistory';
  c.search.transpositionTable = true;
  c.search.ttSizeMB = 32;
  c.common.timeLimitMs = 1500;
  c.common.minThinkMs = 400;
  c.search.depth = 4;
  return c;
}

const never = { aborted: false };
const sameScore = (a: number | null, b: number | null) => (a === null || b === null ? expect(a).toBe(b) : expect(a).toBeCloseTo(b, 9));
const noop = () => {};

function cfg(alg: AlgorithmId, patch: (c: AgentConfig) => void = () => {}): AgentConfig {
  const c = defaultConfig();
  c.algorithm = alg;
  c.common.timeLimitMs = Infinity;
  c.common.recordTree = 'off';
  c.common.seed = 1;
  patch(c);
  return c;
}

const think = (alg: AlgorithmId, moves: string, patch?: (c: AgentConfig) => void): Promise<MoveDecision> =>
  AGENTS[alg].chooseMove({ moves: parseMoves(moves) }, cfg(alg, patch), noop, never);

function randomPosition(rng: () => number, plies: number): number[] | null {
  const b = new Board();
  for (let i = 0; i < plies; i++) {
    const legal = b.legalMoves();
    b.play(legal[Math.floor(rng() * legal.length)]);
    if (b.isOver()) return null;
  }
  return Array.from(b.history.slice(0, b.count));
}

describe('minimax vs alpha-beta', () => {
  it('return the same value and move at equal depth on 200 random positions', async () => {
    const rng = mulberry32(2024);
    let n = 0;
    while (n < 200) {
      const moves = randomPosition(rng, 4 + Math.floor(rng() * 16));
      if (!moves) continue;
      n++;
      const depth = 3 + (n % 2);
      const mm = await AGENTS.minimax.chooseMove({ moves }, cfg('minimax', (c) => (c.search.depth = depth)), noop, never);
      for (const ordering of ['none', 'centre', 'killerHistory'] as const) {
        const ab = await AGENTS.alphabeta.chooseMove(
          { moves },
          cfg('alphabeta', (c) => {
            c.search.depth = depth;
            c.search.moveOrdering = ordering;
          }),
          noop,
          never,
        );
        expect(ab.col).toBe(mm.col);
        for (let c = 0; c < 7; c++) sameScore(ab.columnScores[c].score, mm.columnScores[c].score);
        expect(ab.stats.expanded).toBeLessThanOrEqual(mm.stats.expanded);
      }
    }
  });

  it('the transposition table never changes the value', async () => {
    const rng = mulberry32(99);
    let n = 0;
    while (n < 60) {
      const moves = randomPosition(rng, 6 + Math.floor(rng() * 10));
      if (!moves) continue;
      n++;
      const base = await AGENTS.alphabeta.chooseMove({ moves }, cfg('alphabeta', (c) => (c.search.depth = 6)), noop, never);
      const withTT = await AGENTS.alphabeta.chooseMove(
        { moves },
        cfg('alphabeta', (c) => {
          c.search.depth = 6;
          c.search.transpositionTable = true;
          c.search.ttSizeMB = 4;
          c.search.moveOrdering = 'killerHistory';
        }),
        noop,
        never,
      );
      for (let c = 0; c < 7; c++) sameScore(withTT.columnScores[c].score, base.columnScores[c].score);
      expect(withTT.col).toBe(base.col);
    }
  });
});

describe('alpha-beta tactics', () => {
  it('finds a win in 1', async () => {
    const d = await think('alphabeta', '172737');
    expect(d.col).toBe(3);
    expect(d.columnScores[3].label).toBe('Wins now');
  });

  it('blocks a loss in 1', async () => {
    const d = await think('alphabeta', '12131');
    expect(d.col).toBe(0);
  });

  it('finds a known double-threat win', async () => {
    const d = await think('alphabeta', '4737', (c) => (c.search.depth = 5));
    expect([1, 4]).toContain(d.col);
    expect(d.columnScores[d.col].proven).toBe('win');
    expect(d.columnScores[d.col].provenIn).toBe(2);
  });

  it('strong alpha-beta decides within its time limit (+-100 ms)', async () => {
    const c = strongAB();
    c.common.recordTree = 'off';
    c.common.seed = 3;
    const t0 = performance.now();
    const d = await AGENTS.alphabeta.chooseMove({ moves: [3, 3, 2] }, c, noop, never);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(1500 + 100);
    expect(d.stats.depthCompleted).toBeGreaterThanOrEqual(6);
  });
});

describe('MCTS', () => {
  it('is reproducible with a fixed seed', async () => {
    const run = () =>
      AGENTS.mcts.chooseMove(
        { moves: [3, 3] },
        cfg('mcts', (c) => {
          c.mcts.iterations = 3000;
          c.common.seed = 77;
        }),
        noop,
        never,
      );
    const a = await run();
    const b = await run();
    expect(a.col).toBe(b.col);
    expect(a.columnScores.map((s) => s.visits)).toEqual(b.columnScores.map((s) => s.visits));
    expect(a.stats.iterations).toBe(3000);
  });

  it('takes an immediate win', async () => {
    const d = await think('mcts', '172737', (c) => (c.mcts.iterations = 500));
    expect(d.col).toBe(3);
  });
});

describe('Chapter 3 agents', () => {
  it('every algorithm wins against the rule-based opponent it was designed for', async () => {
    for (const alg of ['bfs', 'dfs', 'ids', 'greedy', 'astar', 'idastar'] as const) {
      const b = new Board();
      let memo = null;
      while (!b.isOver()) {
        if (b.turn === 1) {
          const d = await AGENTS[alg].chooseMove({ moves: Array.from(b.history.slice(0, b.count)), planMemo: memo }, cfg(alg), noop, never);
          expect(d.deviated).toBe(false);
          memo = d.planMemo ?? null;
          b.play(d.col);
        } else {
          const d = await AGENTS.rule.chooseMove({ moves: Array.from(b.history.slice(0, b.count)) }, cfg('rule'), noop, never);
          b.play(d.col);
        }
      }
      expect(b.winner(), alg).toBe(1);
    }
  });

  it('detects when the real opponent leaves the model', () => {
    const memo = { basedOnCount: 0, predictedPlies: [3, 3, 3], replans: 0 };
    expect(checkDeviation([3, 3], memo)).toEqual({ deviated: false, stillValid: true });
    expect(checkDeviation([3, 2], memo)).toEqual({ deviated: true, stillValid: false });
  });

  it('IDA* from the empty board plans a win in 4 (model)', async () => {
    const d = await AGENTS.idastar.chooseMove({ moves: [] }, cfg('idastar'), noop, never);
    expect(d.planFound).toBe(true);
    expect(d.columnScores[d.col].provenIn).toBe(4);
    expect(d.pv.length).toBe(7);
  });
});

describe('common parameters', () => {
  it('epsilon = 1 always plays a random column, reproducibly', async () => {
    const c = cfg('rule', (x) => {
      x.common.epsilon = 1;
      x.common.seed = 5;
    });
    const a = await runAgent({ moves: [] }, c, noop, never);
    const b = await runAgent({ moves: [] }, c, noop, never);
    expect(a.randomised).toBe(true);
    expect(a.col).toBe(b.col);
  });

  it('cancellation stops a long search within 50 ms', async () => {
    const t0 = performance.now();
    const signal = { get aborted() { return performance.now() - t0 > 30; } };
    const c = strongAB();
    c.common.timeLimitMs = 10_000;
    c.common.recordTree = 'off';
    let err: unknown = null;
    try {
      await AGENTS.alphabeta.chooseMove({ moves: [] }, c, noop, signal);
    } catch (e) {
      err = e;
    }
    const dt = performance.now() - t0;
    expect(err).toBeTruthy();
    expect(dt).toBeLessThan(30 + 50);
  });
});
