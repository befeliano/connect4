import type { Board } from '../../engine/board';
import { GOAL, STATE, actions, restore, step } from '../../engine/model';
import { StopSearch } from '../context';
import type { Ch3Options, Ch3Result } from './common';

export function dfs(root: Board, o: Ch3Options): Ch3Result {
  const { ctx } = o;
  const b = root.clone();
  const path: number[] = [];
  const visited = new Set<number>();
  let peak = 0;

  const visit = (g: number, tid: number): number | null => {
    ctx.expand();
    peak = Math.max(peak, g + 1, visited.size);
    ctx.stats.depth = Math.max(ctx.stats.depth, g);
    ctx.stats.frontier = g + 1;
    ctx.stats.reached = visited.size;
    ctx.peak(peak);
    if (g + 1 > o.depthCap) return null;
    const count = b.count;
    for (const c of actions(b)) {
      const out = step(b, c);
      ctx.stats.generated++;
      if (out === GOAL) {
        ctx.tree.add(tid, c, g + 1, 'goal', 0);
        restore(b, count);
        path.push(c);
        return g + 1;
      }
      if (out === STATE) {
        const key = o.useReachedSet ? b.exactKey() : 0;
        if (!o.useReachedSet || !visited.has(key)) {
          if (o.useReachedSet) visited.add(key);
          const child = ctx.tree.add(tid, c, g + 1, 'state');
          path.push(c);
          const found = visit(g + 1, child);
          restore(b, count);
          if (found) return found;
          path.pop();
          continue;
        }
      } else {
        ctx.tree.add(tid, c, g + 1, 'dead');
      }
      restore(b, count);
    }
    return null;
  };

  try {
    const cost = visit(0, -1);
    return { cost, plan: cost ? path : [], expansions: ctx.stats.expanded, memory: peak };
  } catch (e) {
    if (e instanceof StopSearch && e.reason === 'budget') {
      return { cost: null, plan: [], expansions: ctx.stats.expanded, memory: peak };
    }
    throw e;
  }
}
