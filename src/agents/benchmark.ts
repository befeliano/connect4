import { parseMoves } from '../engine/board';
import { defaultConfig } from './presets';
import { AGENTS } from './registry';
import type { AgentConfig } from './types';

export interface BenchRow {
  name: string;
  position: string;
  depth: number;
  nodes: number;
  ms: number;
  nodesPerSec: number;
}

export const BENCH_POSITIONS = ['', '4453', '44443322', '3453452'];

export async function runBenchmark(): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const never = { aborted: false };
  const make = (alg: 'minimax' | 'alphabeta', depth: number): AgentConfig => {
    const c = defaultConfig();
    c.algorithm = alg;
    c.common.timeLimitMs = Infinity;
    c.common.recordTree = 'off';
    c.common.seed = 1;
    c.search.depth = depth;
    c.search.moveOrdering = alg === 'alphabeta' ? 'centre' : 'none';
    return c;
  };
  for (const [alg, depth] of [
    ['minimax', 6],
    ['alphabeta', 6],
    ['alphabeta', 9],
  ] as const) {
    for (const pos of BENCH_POSITIONS) {
      const d = await AGENTS[alg].chooseMove({ moves: parseMoves(pos) }, make(alg, depth), () => {}, never);
      rows.push({
        name: alg === 'minimax' ? 'Minimax' : 'Alpha-beta',
        position: pos || '(empty)',
        depth,
        nodes: d.stats.expanded,
        ms: Math.round(d.stats.elapsedMs),
        nodesPerSec: d.stats.nodesPerSec,
      });
    }
  }
  return rows;
}
