import type { Board } from '../../engine/board';
import type { SearchContext } from '../context';

export interface Ch3Options {
  heuristic: (b: Board) => number;
  depthCap: number;
  useReachedSet: boolean;
  ctx: SearchContext;
}

export interface Ch3Result {
  cost: number | null;
  plan: number[];
  expansions: number;
  memory: number;
}

export interface PathNode {
  key: number;
  parent: PathNode | null;
  col: number;
  g: number;
  tid: number;
}

export function planOf(node: PathNode | null, last?: number): number[] {
  const out: number[] = [];
  for (let n = node; n && n.parent; n = n.parent) out.push(n.col);
  out.reverse();
  if (last !== undefined) out.push(last);
  return out;
}
