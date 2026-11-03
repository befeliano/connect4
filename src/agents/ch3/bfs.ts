import type { Board } from '../../engine/board';
import { GOAL, STATE, actions, boardFromKey, restore, step } from '../../engine/model';
import { planOf, type Ch3Options, type Ch3Result, type PathNode } from './common';

export function bfs(root: Board, o: Ch3Options): Ch3Result {
  const { ctx } = o;
  const rootKey = root.exactKey();
  const reached = new Set<number>([rootKey]);
  let frontier: PathNode[] = [{ key: rootKey, parent: null, col: -1, g: 0, tid: -1 }];
  let depth = 0;
  let memory = 1;
  const mem = () => (o.useReachedSet ? reached.size : memory);

  while (frontier.length) {
    depth++;
    if (depth > o.depthCap) break;
    ctx.stats.depth = depth;
    const next: PathNode[] = [];
    for (let i = 0; i < frontier.length; i++) {
      const node = frontier[i];
      ctx.stats.frontier = frontier.length - i + next.length;
      ctx.stats.reached = o.useReachedSet ? reached.size : 0;
      ctx.expand();
      const b = boardFromKey(node.key);
      const count = b.count;
      for (const c of actions(b)) {
        const out = step(b, c);
        ctx.stats.generated++;
        if (out === GOAL) {
          ctx.tree.add(node.tid, c, depth, 'goal', 0);
          ctx.peak(mem());
          return { cost: depth, plan: planOf(node, c), expansions: ctx.stats.expanded, memory: mem() };
        }
        if (out === STATE) {
          const key = b.exactKey();
          if (!o.useReachedSet || !reached.has(key)) {
            if (o.useReachedSet) reached.add(key);
            const tid = ctx.tree.add(node.tid, c, depth, 'state');
            next.push({ key, parent: node, col: c, g: depth, tid });
          }
        } else {
          ctx.tree.add(node.tid, c, depth, 'dead');
        }
        restore(b, count);
      }
      if (!o.useReachedSet) memory = Math.max(memory, frontier.length - i - 1 + next.length);
      ctx.peak(mem());
    }
    frontier = next;
  }
  return { cost: null, plan: [], expansions: ctx.stats.expanded, memory: mem() };
}
