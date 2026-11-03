import { Board } from '../engine/board';
import { hCost } from '../engine/heuristics';
import { GOAL, STATE, actions, boardFromKey, restore, step } from '../engine/model';
import { SearchContext } from '../agents/context';
import { bfs } from '../agents/ch3/bfs';
import { dfs } from '../agents/ch3/dfs';
import { ids, idaStar } from '../agents/ch3/idastar';
import { greedy } from '../agents/ch3/greedy';
import { astar } from '../agents/ch3/astar';
import type { Ch3Options, Ch3Result } from '../agents/ch3/common';

const INF_CODE = 255;

export function buildStateSpace(): Float64Array[] {
  const layers: Float64Array[] = [Float64Array.of(new Board().exactKey())];
  for (;;) {
    const next = new Set<number>();
    for (const key of layers[layers.length - 1]) {
      const b = boardFromKey(key);
      const count = b.count;
      for (const c of actions(b)) {
        if (step(b, c) === STATE) next.add(b.exactKey());
        restore(b, count);
      }
    }
    if (next.size === 0) break;
    layers.push(Float64Array.from(next));
  }
  return layers;
}

export interface CheckStats {
  states: number;
  transitions: number;
  admissibleViolations: number;
  consistentViolations: number;
  winnable: number;
  exact: number;
  sumH: number;
  sumTrue: number;
}

export function solveAndCheck(layers: Float64Array[]): { trueCosts: Uint8Array[]; stats: CheckStats } {
  const stats: CheckStats = {
    states: 0,
    transitions: 0,
    admissibleViolations: 0,
    consistentViolations: 0,
    winnable: 0,
    exact: 0,
    sumH: 0,
    sumTrue: 0,
  };
  const trueCosts: Uint8Array[] = new Array(layers.length);
  let nxt = new Map<number, number>();
  for (let k = layers.length - 1; k >= 0; k--) {
    const cur = new Map<number, number>();
    const costs = new Uint8Array(layers[k].length);
    layers[k].forEach((key, idx) => {
      const b = boardFromKey(key);
      const us = b.turn;
      const hn = hCost(b, us);
      let best = Infinity;
      const count = b.count;
      for (const c of actions(b)) {
        const out = step(b, c);
        let hNext: number;
        if (out === GOAL) {
          hNext = 0;
          best = 1;
        } else if (out === STATE) {
          const packed = nxt.get(b.exactKey()) as number;
          const hc = packed >> 8;
          const cc = packed & 255;
          hNext = hc === INF_CODE ? Infinity : hc;
          if (cc !== INF_CODE && cc + 1 < best) best = cc + 1;
        } else {
          restore(b, count);
          continue;
        }
        restore(b, count);
        stats.transitions++;
        if (hn > 1 + hNext) stats.consistentViolations++;
      }
      stats.states++;
      if (hn > best) stats.admissibleViolations++;
      if (best !== Infinity) {
        stats.winnable++;
        stats.sumH += hn;
        stats.sumTrue += best;
        if (hn === best) stats.exact++;
      }
      const hCode = hn === Infinity ? INF_CODE : hn;
      const cCode = best === Infinity ? INF_CODE : best;
      cur.set(key, hCode * 256 + cCode);
      costs[idx] = cCode;
    });
    trueCosts[k] = costs;
    nxt = cur;
  }
  return { trueCosts, stats };
}

export const INF_COST = INF_CODE;

export type MethodName = 'Breadth-first' | 'Depth-first' | 'Iterative deepening' | 'Greedy best-first' | 'A*' | 'IDA*';

type Method = (b: Board, o: Ch3Options) => Ch3Result;

export const METHODS: { name: MethodName; run: Method; reached: boolean; budget: number }[] = [
  { name: 'Breadth-first', run: bfs, reached: true, budget: Infinity },
  { name: 'Depth-first', run: dfs, reached: false, budget: 2_000_000 },
  { name: 'Iterative deepening', run: ids, reached: false, budget: Infinity },
  { name: 'Greedy best-first', run: greedy, reached: true, budget: Infinity },
  { name: 'A*', run: astar, reached: true, budget: Infinity },
  { name: 'IDA*', run: idaStar, reached: false, budget: Infinity },
];

export function runMethod(m: (typeof METHODS)[number], board: Board): Ch3Result {
  const us = board.turn;
  const ctx = new SearchContext({ nodeBudget: m.budget });
  return m.run(board, { heuristic: (b) => hCost(b, us), depthCap: Infinity, useReachedSet: m.reached, ctx });
}

export function openingBoards(
  layers: Float64Array[],
  trueCosts: Uint8Array[],
  openingMoves = 4,
): { key: number; cost: number }[] {
  const out: { key: number; cost: number }[] = [];
  for (let k = 0; k <= openingMoves && k < layers.length; k++) {
    layers[k].forEach((key, i) => {
      if (trueCosts[k][i] !== INF_CODE) out.push({ key, cost: trueCosts[k][i] });
    });
  }
  return out;
}

export interface MethodRow {
  name: MethodName;
  solved: number;
  optimal: number;
  meanExpansions: number;
  meanMemory: number;
  empty: Ch3Result;
}

export function compareMethods(boards: { key: number; cost: number }[]): MethodRow[] {
  return METHODS.map((m) => {
    let solved = 0;
    let optimal = 0;
    let expansions = 0;
    let memory = 0;
    for (const { key, cost } of boards) {
      const r = runMethod(m, boardFromKey(key));
      if (r.cost !== null) solved++;
      if (r.cost === cost) optimal++;
      expansions += r.expansions;
      memory += r.memory;
    }
    const n = boards.length;
    return {
      name: m.name,
      solved,
      optimal,
      meanExpansions: expansions / n,
      meanMemory: memory / n,
      empty: runMethod(m, new Board()),
    };
  });
}

export const EXPECTED = {
  states: 3_174_822,
  longestGame: 21,
  trueCostEmpty: 4,
  hEmpty: 4,
  transitions: 4_939_081,
  boards: 565,
  table: {
    'Breadth-first': { optimal: 565, expansions: 152.5, memory: 401.3 },
    'Depth-first': { optimal: 4, expansions: 434.3, memory: 14.0 },
    'Iterative deepening': { optimal: 565, expansions: 2310.1, memory: 5.4 },
    'Greedy best-first': { optimal: 305, expansions: 55.0, memory: 148.1 },
    'A*': { optimal: 565, expansions: 147.0, memory: 404.6 },
    'IDA*': { optimal: 565, expansions: 270.8, memory: 4.4 },
  } as Record<MethodName, { optimal: number; expansions: number; memory: number }>,
};
