import type { Board } from '../../engine/board';
import { CENTRE_ORDER, SIZE } from '../../engine/lines';
import { WIN, evaluate } from '../../engine/heuristics';
import { StopSearch, type SearchContext } from '../context';
import { describeScore, emptyColumnScores, isProvenLoss, isProvenWin } from '../scoring';
import type { ColumnScore, SearchParams, TreeNodeRec } from '../types';
import { MoveOrderer } from './ordering';
import { EXACT, LOWER, TranspositionTable, UPPER } from './tt';

export interface NegamaxOptions {
  pruning: boolean;
  params: SearchParams;
}

export interface RootResult {
  bestCol: number;
  bestScore: number;
  scores: ColumnScore[];
  pv: number[];
  depthCompleted: number;
  tree: TreeNodeRec[] | null;
  treeTruncated: boolean;
}

const TIE_RANK = new Int8Array(7);
CENTRE_ORDER.forEach((c, i) => (TIE_RANK[c] = i));

export class Negamax {
  private readonly board: Board;
  private readonly ctx: SearchContext;
  private readonly o: NegamaxOptions;
  private readonly tt: TranspositionTable | null;
  private readonly orderer: MoveOrderer;
  private readonly pvTable: number[][] = [];

  constructor(board: Board, ctx: SearchContext, o: NegamaxOptions) {
    this.board = board.clone();
    this.ctx = ctx;
    this.o = o;
    this.tt = o.pruning && o.params.transpositionTable ? new TranspositionTable(o.params.ttSizeMB) : null;
    this.orderer = new MoveOrderer(o.pruning ? o.params.moveOrdering : 'none');
  }

  private evalLeaf(): number {
    return evaluate(this.board, this.board.turn, this.o.params.evaluation);
  }

  private winScore(ply: number): number {
    return this.o.params.preferFasterWins ? WIN - ply : WIN;
  }

  private search(ply: number, depth: number, alpha: number, beta: number, tid: number): number {
    const ctx = this.ctx;
    const b = this.board;
    if (depth === 0) return this.evalLeaf();
    ctx.expand();
    if (ply > ctx.stats.depth) ctx.stats.depth = ply;

    let ttMove = -1;
    const tt = this.tt;
    if (tt) {
      const slot = tt.probe(b.hashHi, b.hashLo);
      if (slot >= 0) {
        ctx.stats.ttHits++;
        ttMove = tt.moveAt(slot);
        if (tt.depthAt(slot) === depth) {
          const s = fromTT(tt.scoreAt(slot), ply);
          const f = tt.flagAt(slot);
          if (f === EXACT) {
            this.pvTable[ply] = ttMove >= 0 ? [ttMove] : [];
            return s;
          }
          if (f === LOWER && s > alpha) alpha = s;
          else if (f === UPPER && s < beta) beta = s;
          if (alpha >= beta) return s;
        }
      }
    }

    const moves = this.orderer.order(b, ply, ttMove);
    const alpha0 = alpha;
    let best = -Infinity;
    let bestMove = moves[0];
    this.pvTable[ply] = [];
    const recording = tid !== -2 && ctx.tree.enabled;

    for (let i = 0; i < moves.length; i++) {
      const c = moves[i];
      ctx.stats.generated++;
      let v: number;
      let childId = -2;
      const won = b.play(c);
      if (won) {
        v = this.winScore(ply + 1);
        if (recording) childId = ctx.tree.add(tid, c, ply + 1, 'win', this.rootView(v, ply + 1));
      } else if (b.count === SIZE) {
        v = 0;
        if (recording) childId = ctx.tree.add(tid, c, ply + 1, 'draw', 0);
      } else {
        if (recording) childId = ctx.tree.add(tid, c, ply + 1, depth - 1 === 0 ? 'leaf' : 'state');
        this.pvTable[ply + 1] = [];
        v = -this.search(ply + 1, depth - 1, -beta, -alpha, childId);
        if (childId >= 0) ctx.tree.set(childId, this.rootView(v, ply + 1));
      }
      b.undo();
      if (v > best) {
        best = v;
        bestMove = c;
        this.pvTable[ply] = [c, ...(this.pvTable[ply + 1] ?? [])];
      }
      if (this.o.pruning) {
        if (best > alpha) alpha = best;
        if (alpha >= beta) {
          ctx.stats.cutoffs++;
          const skipped = moves.length - i - 1;
          ctx.stats.pruned += skipped;
          this.orderer.cutoff(b, ply, c, depth);
          if (recording) {
            for (let j = i + 1; j < moves.length; j++) {
              const id = ctx.tree.add(tid, moves[j], ply + 1, 'pruned');
              ctx.tree.set(id, null, 'pruned', 'pruned');
            }
          }
          break;
        }
      }
    }

    if (tt) {
      const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
      tt.store(b.hashHi, b.hashLo, depth, flag, toTT(best, ply), bestMove);
      ctx.stats.ttStores++;
    }
    return best;
  }

  private rootView(v: number, ply: number): number {
    return ply % 2 === 1 ? v : -v;
  }

  searchRoot(depth: number, previous: RootResult | null): RootResult {
    const ctx = this.ctx;
    const b = this.board;
    const p = this.o.params;
    const legal = b.legalMoves();
    let order = this.orderer.order(b, 0, previous ? previous.bestCol : -1);
    if (previous && this.o.pruning) order = [previous.bestCol, ...order.filter((c) => c !== previous.bestCol)];
    order = order.filter((c) => legal.includes(c));

    const scores = emptyColumnScores();
    const exact: (number | null)[] = Array(7).fill(null);
    let bestCol = -1;
    let bestScore = -Infinity;
    let bestPv: number[] = [];
    ctx.tree.reset();

    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      ctx.stats.generated++;
      let v: number;
      let childPv: number[] = [];
      const won = b.play(c);
      if (won) {
        v = this.winScore(1);
        ctx.tree.add(-1, c, 1, 'win', v);
      } else if (b.count === SIZE) {
        v = 0;
        ctx.tree.add(-1, c, 1, 'draw', 0);
      } else {
        const id = ctx.tree.add(-1, c, 1, depth - 1 === 0 ? 'leaf' : 'state');
        this.pvTable[1] = [];
        const w = p.aspirationWindow;
        if (this.o.pruning && w > 0 && i === 0 && previous && !isProvenWin(previous.bestScore) && !isProvenLoss(previous.bestScore)) {
          const lo = previous.bestScore - w;
          const hi = previous.bestScore + w;
          v = -this.search(1, depth - 1, -hi, -lo, id);
          if (v <= lo || v >= hi) {
            ctx.stats.researches++;
            this.pvTable[1] = [];
            v = -this.search(1, depth - 1, -Infinity, Infinity, id);
          }
        } else {
          v = -this.search(1, depth - 1, -Infinity, Infinity, id);
        }
        childPv = this.pvTable[1] ?? [];
        ctx.tree.set(id, v);
      }
      b.undo();
      exact[c] = v;
      scores[c] = describeScore(c, v, p.preferFasterWins);
      if (v > bestScore || (v === bestScore && TIE_RANK[c] < TIE_RANK[bestCol])) {
        bestScore = v;
        bestCol = c;
        bestPv = [c, ...childPv];
      }
      ctx.columnScores = scores.map((s) => ({ ...s }));
      ctx.bestCol = bestCol;
      ctx.pv = bestPv;
    }
    return {
      bestCol,
      bestScore,
      scores,
      pv: bestPv,
      depthCompleted: depth,
      tree: ctx.tree.enabled ? ctx.tree.nodes : null,
      treeTruncated: ctx.tree.truncated,
    };
  }

  run(): { result: RootResult | null; stop: 'done' | 'time' | 'budget' | 'abort' } {
    const p = this.o.params;
    const ctx = this.ctx;
    const empty = SIZE - this.board.count;
    const maxDepth = Math.min(p.iterativeDeepening && this.o.pruning ? 42 : p.depth, empty);
    let result: RootResult | null = null;
    const start = p.iterativeDeepening && this.o.pruning ? 1 : maxDepth;
    try {
      for (let d = start; d <= maxDepth; d++) {
        const before = ctx.stats.expanded;
        const r = this.searchRoot(d, result);
        result = r;
        ctx.stats.depthCompleted = d;
        ctx.depthHistory.push({
          depth: d,
          nodes: ctx.stats.expanded - before,
          ms: performance.now() - ctx.start,
          best: r.bestCol,
          score: r.bestScore,
        });
        ctx.emitNow();
        if (isProvenWin(r.bestScore) || r.scores.every((s) => s.score === null || isProvenLoss(s.score) || isProvenWin(s.score))) {
          break;
        }
      }
      return { result, stop: 'done' };
    } catch (e) {
      if (e instanceof StopSearch) return { result, stop: e.reason };
      throw e;
    }
  }

  partialScores(): ColumnScore[] | null {
    return this.ctx.columnScores;
  }
}

function toTT(score: number, ply: number): number {
  if (score >= WIN - 1000) return score + ply;
  if (score <= -(WIN - 1000)) return score - ply;
  return score;
}

function fromTT(score: number, ply: number): number {
  if (score >= WIN - 1000) return score - ply;
  if (score <= -(WIN - 1000)) return score + ply;
  return score;
}
