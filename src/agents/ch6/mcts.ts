import { Board } from '../../engine/board';
import { SIZE } from '../../engine/lines';
import { ruleMove } from '../../engine/opponentRule';
import { mulberry32, randInt, type Rng } from '../../engine/rng';
import { StopSearch } from '../context';
import { emptyColumnScores } from '../scoring';
import type { Agent, ColumnScore, MctsParams, MoveDecision, TreeNodeRec } from '../types';
import { contextFor } from './minimax';

interface Node {
  move: number;
  parent: Node | null;
  children: Node[];
  untried: number[];
  visits: number;
  reward: number;
  terminal: number;
}

export const mctsAgent: Agent = {
  id: 'mcts',
  family: 'ch6',
  chooseMove: async (position, config, onTelemetry, signal) => {
    const p: MctsParams = config.mcts;
    const seed = config.common.seed ?? 1;
    const rng = mulberry32(seed);
    const root0 = Board.fromMoves(position.moves);
    const board = root0.clone();
    const ctx = contextFor(config, onTelemetry, signal);
    const newNode = (move: number, parent: Node | null, terminal: number): Node => ({
      move,
      parent,
      children: [],
      untried: terminal >= 0 ? [] : shuffle(board.legalMoves(), rng),
      visits: 0,
      reward: 0,
      terminal,
    });
    const root = newNode(-1, null, -1);
    let treeSize = 1;
    const maxIter = p.timeBounded ? Infinity : p.iterations;
    let stop: 'done' | 'time' | 'budget' | 'abort' = 'done';
    const logC = p.explorationC;

    const snapshot = (): ColumnScore[] => {
      const scores = emptyColumnScores();
      for (const ch of root.children) {
        const wr = ch.visits ? ch.reward / ch.visits : 0;
        scores[ch.move] = {
          col: ch.move,
          score: Math.round(wr * 1000) / 10,
          proven: ch.terminal === 1 ? 'win' : null,
          provenIn: ch.terminal === 1 ? 1 : null,
          label: ch.terminal === 1 ? 'Wins now' : `${Math.round(wr * 100)}% · ${ch.visits}`,
          visits: ch.visits,
          winRate: wr,
        };
      }
      return scores;
    };
    const bestChild = (n: Node, mode: 'visits' | 'mean'): Node | null => {
      let best: Node | null = null;
      for (const ch of n.children) {
        if (!best) best = ch;
        else if (mode === 'visits' ? ch.visits > best.visits : ch.reward / ch.visits > best.reward / best.visits) best = ch;
      }
      return best;
    };

    ctx.emitNow();
    try {
      for (let it = 0; it < maxIter; it++) {
        if ((it & 63) === 0) {
          ctx.check();
          ctx.stats.iterations = it;
          ctx.stats.treeSize = treeSize;
          ctx.columnScores = snapshot();
          const b = bestChild(root, p.finalMoveSelection);
          ctx.bestCol = b ? b.move : null;
          ctx.pv = principal(root);
        }
        let node = root;
        const start = board.count;
        while (node.untried.length === 0 && node.children.length > 0 && node.terminal < 0) {
          const lnN = Math.log(node.visits);
          let best = node.children[0];
          let bestU = -Infinity;
          for (const ch of node.children) {
            const u = ch.reward / ch.visits + logC * Math.sqrt(lnN / ch.visits);
            if (u > bestU) {
              bestU = u;
              best = ch;
            }
          }
          node = best;
          board.play(node.move);
        }
        if (node.untried.length > 0 && node.terminal < 0) {
          const m = node.untried.pop() as number;
          const won = board.play(m);
          const term = won ? 1 : board.count === SIZE ? 0.5 : -1;
          const child = newNode(m, node, term);
          node.children.push(child);
          node = child;
          treeSize++;
          ctx.expand();
        }
        let reward: number;
        if (node.terminal >= 0) reward = node.terminal;
        else {
          const mover = board.turn === 1 ? 2 : 1;
          const rs = board.count;
          let winner = 0;
          let steps = 0;
          while (steps < p.maxRolloutDepth && board.count < SIZE) {
            const legal = board.legalMoves();
            const m = p.rolloutPolicy === 'rule' ? ruleMove(board) : legal[randInt(rng, legal.length)];
            ctx.stats.generated++;
            steps++;
            if (board.play(m)) {
              winner = board.turn === 1 ? 2 : 1;
              break;
            }
          }
          while (board.count > rs) board.undo();
          reward = winner === 0 ? 0.5 : winner === mover ? 1 : 0;
        }
        for (let n: Node | null = node; n; n = n.parent) {
          n.visits++;
          n.reward += reward;
          reward = 1 - reward;
        }
        while (board.count > start) board.undo();
        ctx.stats.iterations = it + 1;
      }
    } catch (e) {
      if (!(e instanceof StopSearch)) throw e;
      if (e.reason === 'abort') throw e;
      stop = e.reason;
      while (board.count > root0.count) board.undo();
    }
    ctx.stats.treeSize = treeSize;
    ctx.stats.memoryPeak = treeSize;
    const scores = snapshot();
    const immediate = root.children.find((c) => c.terminal === 1);
    const chosen = immediate ?? bestChild(root, p.finalMoveSelection);
    const col = chosen ? chosen.move : (root.untried[0] ?? root0.legalMoves()[0]);
    ctx.status = 'done';
    const decision: MoveDecision = {
      col,
      columnScores: scores,
      pv: principal(root),
      stats: ctx.finishStats(stop),
      depthHistory: [],
      tree: config.common.recordTree === 'off' ? null : exportTree(root, config.common.recordTree === 'full' ? 20000 : 1500),
      randomised: false,
      reason: `MCTS ran ${ctx.stats.iterations.toLocaleString('en-US')} iterations (${treeSize.toLocaleString('en-US')} tree nodes); chose the ${p.finalMoveSelection === 'visits' ? 'most visited' : 'best mean'} column.`,
      seedUsed: seed,
    };
    return decision;
  },
};

function shuffle(a: number[], rng: Rng): number[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function principal(root: Node): number[] {
  const pv: number[] = [];
  let n: Node | null = root;
  while (n && n.children.length && pv.length < 12) {
    let best: Node = n.children[0];
    for (const ch of n.children) if (ch.visits > best.visits) best = ch;
    pv.push(best.move);
    n = best;
  }
  return pv;
}

function exportTree(root: Node, limit: number): { nodes: TreeNodeRec[]; truncated: boolean; mode: 'sampled' | 'full' } {
  const nodes: TreeNodeRec[] = [];
  const queue: { n: Node; parent: number; depth: number }[] = root.children
    .slice()
    .sort((a, b) => b.visits - a.visits)
    .map((n) => ({ n, parent: -1, depth: 1 }));
  let truncated = false;
  while (queue.length) {
    const { n, parent, depth } = queue.shift() as { n: Node; parent: number; depth: number };
    if (nodes.length >= limit) {
      truncated = true;
      break;
    }
    const id = nodes.length;
    const wr = n.visits ? n.reward / n.visits : 0;
    const rootWr = depth % 2 === 1 ? wr : 1 - wr;
    nodes.push({
      id,
      parent,
      col: n.move,
      depth,
      order: id,
      value: Math.round((rootWr * 2 - 1) * 100),
      kind: n.terminal === 1 ? (depth % 2 === 1 ? 'win' : 'loss') : n.terminal === 0.5 ? 'draw' : 'state',
      label: `${n.visits} visits, ${Math.round(wr * 100)}%`,
    });
    for (const ch of n.children.slice().sort((a, b) => b.visits - a.visits)) {
      if (ch.visits >= 2 || limit > 1500) queue.push({ n: ch, parent: id, depth: depth + 1 });
    }
  }
  return { nodes, truncated, mode: limit > 1500 ? 'full' : 'sampled' };
}
