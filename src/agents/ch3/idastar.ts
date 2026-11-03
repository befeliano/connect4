import type { Board } from '../../engine/board';
import { GOAL, STATE, actions, restore, step } from '../../engine/model';
import type { Ch3Options, Ch3Result } from './common';

export function idaStar(root: Board, o: Ch3Options): Ch3Result {
  const { ctx, heuristic } = o;
  const b = root.clone();
  const path: number[] = [];
  let peak = 0;
  const seen = new Map<number, number>();

  const visit = (g: number, limit: number, tid: number): [boolean, number] => {
    ctx.expand();
    peak = Math.max(peak, g + 1, seen.size);
    ctx.stats.depth = Math.max(ctx.stats.depth, g);
    ctx.stats.frontier = g + 1;
    ctx.stats.reached = seen.size;
    ctx.peak(peak);
    let smallest = Infinity;
    const count = b.count;
    for (const c of actions(b)) {
      const out = step(b, c);
      ctx.stats.generated++;
      if (out === GOAL) {
        if (g + 1 <= limit) {
          ctx.tree.add(tid, c, g + 1, 'goal', g + 1);
          restore(b, count);
          path.push(c);
          return [true, g + 1];
        }
        ctx.tree.add(tid, c, g + 1, 'pruned', g + 1);
        smallest = Math.min(smallest, g + 1);
      } else if (out === STATE) {
        const f = g + 1 + heuristic(b);
        if (f > limit || g + 1 > o.depthCap) {
          if (g + 1 <= o.depthCap) smallest = Math.min(smallest, f);
          const id = ctx.tree.add(tid, c, g + 1, 'pruned', f);
          ctx.tree.set(id, f, 'pruned', `f=${f === Infinity ? '∞' : f} > ${limit}`);
        } else {
          let skip = false;
          if (o.useReachedSet) {
            const key = b.exactKey();
            const prev = seen.get(key);
            if (prev !== undefined && prev <= g + 1) skip = true;
            else seen.set(key, g + 1);
          }
          if (!skip) {
            const id = ctx.tree.add(tid, c, g + 1, 'state', f);
            path.push(c);
            const [found, value] = visit(g + 1, limit, id);
            if (found) {
              restore(b, count);
              return [true, value];
            }
            path.pop();
            smallest = Math.min(smallest, value);
          }
        }
      } else {
        ctx.tree.add(tid, c, g + 1, 'dead');
      }
      restore(b, count);
    }
    return [false, smallest];
  };

  let limit = heuristic(b);
  while (limit !== Infinity) {
    ctx.stats.fLimit = limit;
    ctx.tree.reset();
    seen.clear();
    const before = ctx.stats.expanded;
    const [found, value] = visit(0, limit, -1);
    ctx.depthHistory.push({
      depth: limit,
      nodes: ctx.stats.expanded - before,
      ms: performance.now() - ctx.start,
      best: found ? path[0] : -1,
      score: found ? value : null,
    });
    if (found) return { cost: value, plan: path, expansions: ctx.stats.expanded, memory: peak };
    limit = value;
  }
  return { cost: null, plan: [], expansions: ctx.stats.expanded, memory: peak };
}

export function ids(root: Board, o: Ch3Options): Ch3Result {
  return idaStar(root, { ...o, heuristic: () => 0 });
}
