import type { Board } from '../../engine/board';
import { DEAD, GOAL, actions, boardFromKey, restore, step } from '../../engine/model';
import { MinHeap } from '../heap';
import { planOf, type Ch3Options, type Ch3Result, type PathNode } from './common';

interface Entry {
  node: PathNode;
  goal: boolean;
}

export function bestFirst(root: Board, o: Ch3Options, priority: (g: number, h: number) => number): Ch3Result {
  const { ctx, heuristic } = o;
  const rootKey = root.exactKey();
  const heap = new MinHeap<Entry>();
  const bestG = new Map<number, number>([[rootKey, 0]]);
  let tie = 0;
  let queuePeak = 1;
  const mem = () => (o.useReachedSet ? bestG.size : queuePeak);
  heap.push(priority(0, heuristic(root)), tie, { node: { key: rootKey, parent: null, col: -1, g: 0, tid: -1 }, goal: false });

  while (heap.size) {
    const { item } = heap.pop();
    const { node } = item;
    const g = node.g;
    if (item.goal) {
      ctx.peak(mem());
      return { cost: g, plan: planOf(node), expansions: ctx.stats.expanded, memory: mem() };
    }
    if (o.useReachedSet && (bestG.get(node.key) as number) < g) continue;
    ctx.stats.frontier = heap.size;
    ctx.stats.reached = o.useReachedSet ? bestG.size : 0;
    ctx.stats.depth = Math.max(ctx.stats.depth, g);
    ctx.expand();
    if (g + 1 > o.depthCap) continue;
    const b = boardFromKey(node.key);
    const count = b.count;
    for (const c of actions(b)) {
      const out = step(b, c);
      ctx.stats.generated++;
      if (out === DEAD) {
        ctx.tree.add(node.tid, c, g + 1, 'dead');
        restore(b, count);
        continue;
      }
      tie++;
      if (out === GOAL) {
        const tid = ctx.tree.add(node.tid, c, g + 1, 'goal', priority(g + 1, 0));
        heap.push(priority(g + 1, 0), tie, { node: { key: -1, parent: node, col: c, g: g + 1, tid }, goal: true });
      } else {
        const key = b.exactKey();
        const prev = bestG.get(key);
        if (!o.useReachedSet || prev === undefined || g + 1 < prev) {
          if (o.useReachedSet) bestG.set(key, g + 1);
          const f = priority(g + 1, heuristic(b));
          const tid = ctx.tree.add(node.tid, c, g + 1, 'state', f);
          heap.push(f, tie, { node: { key, parent: node, col: c, g: g + 1, tid }, goal: false });
        }
      }
      restore(b, count);
    }
    if (heap.size > queuePeak) queuePeak = heap.size;
    ctx.peak(mem());
  }
  return { cost: null, plan: [], expansions: ctx.stats.expanded, memory: mem() };
}
