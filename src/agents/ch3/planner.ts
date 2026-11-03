import { Board } from '../../engine/board';
import { hCost } from '../../engine/heuristics';
import { DEAD, GOAL, step } from '../../engine/model';
import { ruleMove } from '../../engine/opponentRule';
import { mulberry32, randInt } from '../../engine/rng';
import { StopSearch } from '../context';
import { contextFor } from '../ch6/minimax';
import { emptyColumnScores } from '../scoring';
import type { Agent, Ch3Algorithm, ColumnScore, MoveDecision, PlanMemo } from '../types';
import { astar } from './astar';
import { bfs } from './bfs';
import type { Ch3Options, Ch3Result } from './common';
import { dfs } from './dfs';
import { greedy } from './greedy';
import { ids, idaStar } from './idastar';

const SEARCH: Record<Ch3Algorithm, (b: Board, o: Ch3Options) => Ch3Result> = {
  bfs,
  dfs,
  ids,
  greedy,
  astar,
  idastar: idaStar,
};

export const DEFAULT_REACHED: Record<Ch3Algorithm, boolean> = {
  bfs: true,
  dfs: false,
  ids: false,
  greedy: true,
  astar: true,
  idastar: false,
};

export const CH3_NAMES: Record<Ch3Algorithm, string> = {
  bfs: 'Breadth-first',
  dfs: 'Depth-first',
  ids: 'Iterative deepening',
  greedy: 'Greedy best-first',
  astar: 'A*',
  idastar: 'IDA*',
};

export function simulatePlan(board: Board, plan: number[]): number[] {
  const b = board.clone();
  const plies: number[] = [];
  for (const c of plan) {
    if (!b.canPlay(c)) break;
    plies.push(c);
    if (b.play(c) || b.isFull()) break;
    const r = ruleMove(b);
    plies.push(r);
    if (b.play(r) || b.isFull()) break;
  }
  return plies;
}

export function checkDeviation(moves: number[], memo: PlanMemo | null | undefined): { deviated: boolean; stillValid: boolean } {
  if (!memo || memo.basedOnCount > moves.length) return { deviated: false, stillValid: false };
  const actual = moves.slice(memo.basedOnCount);
  for (let i = 0; i < actual.length; i++) {
    if (i >= memo.predictedPlies.length || actual[i] !== memo.predictedPlies[i]) return { deviated: true, stillValid: false };
  }
  return { deviated: false, stillValid: true };
}

function columnView(board: Board, us: number, plan: number[], cost: number | null, useH: boolean): ColumnScore[] {
  const scores = emptyColumnScores();
  for (const c of board.legalMoves()) {
    const b = board.clone();
    const out = step(b, c);
    if (out === GOAL) {
      scores[c] = { col: c, score: 100, proven: 'win', provenIn: 1, label: 'Wins now' };
    } else if (out === DEAD) {
      const oppWon = b.winner() !== 0 && b.winner() !== us;
      scores[c] = {
        col: c,
        score: -100,
        proven: oppWon ? 'loss' : 'draw',
        provenIn: 1,
        label: oppWon ? 'Opponent wins (model)' : 'Draw (model)',
      };
    } else {
      const h = useH ? hCost(b, us) : 0;
      const f = 1 + h;
      scores[c] = {
        col: c,
        score: h === Infinity ? -50 : -f,
        proven: null,
        provenIn: null,
        label: h === Infinity ? 'f = ∞ (no open line)' : `f = 1 + ${h} = ${f}`,
      };
    }
  }
  if (plan.length && cost !== null) {
    const c = plan[0];
    scores[c] = { ...scores[c], score: 100 - cost, proven: 'win', provenIn: cost, label: cost === 1 ? 'Wins now' : `Plan: win in ${cost} (model)` };
  }
  return scores;
}

export function makeCh3Agent(alg: Ch3Algorithm): Agent {
  return {
    id: alg,
    family: 'ch3',
    chooseMove: async (position, config, onTelemetry, signal) => {
      const board = Board.fromMoves(position.moves);
      const us = board.turn;
      const p = config.ch3;
      const ctx = contextFor(config, onTelemetry, signal);
      const { deviated, stillValid } = checkDeviation(position.moves, position.planMemo);
      const replans = (position.planMemo?.replans ?? 0) + (deviated ? 1 : 0);
      ctx.status = deviated ? 'replanning' : 'thinking';
      ctx.extra = { planStillValid: stillValid, replans, planLength: 0 };
      ctx.emitNow();

      const useReached = p.useReachedSet === 'default' ? DEFAULT_REACHED[alg] : p.useReachedSet === 'on';
      const useH = p.heuristic === 'h';
      let result: Ch3Result | null = null;
      let stop: 'done' | 'time' | 'budget' | 'abort' = 'done';
      try {
        result = SEARCH[alg](board, {
          heuristic: useH ? (b) => hCost(b, us) : () => 0,
          depthCap: p.depthCap,
          useReachedSet: useReached,
          ctx,
        });
      } catch (e) {
        if (!(e instanceof StopSearch)) throw e;
        if (e.reason === 'abort') throw e;
        stop = e.reason;
      }

      const found = !!result && result.cost !== null && result.plan.length > 0;
      const plan = found ? (result as Ch3Result).plan : [];
      let col: number;
      let reason: string;
      const name = CH3_NAMES[alg];
      const seed = config.common.seed ?? 1;
      if (found) {
        col = plan[0];
        reason = `${name} found a plan to win in ${result!.cost} of our moves inside the model (opponent replies win → block → centre).`;
      } else {
        const why =
          stop === 'time' ? 'ran out of time' : stop === 'budget' ? 'hit the node budget' : `found no win within ${p.depthCap} moves`;
        if (p.fallback === 'rule') {
          col = ruleMove(board);
          reason = `${name} ${why}; falling back to the rule (win → block → centre).`;
        } else {
          const legal = board.legalMoves();
          col = legal[randInt(mulberry32(seed), legal.length)];
          reason = `${name} ${why}; falling back to a random column.`;
        }
      }
      const predicted = simulatePlan(board, found ? plan : [col]);
      const memo: PlanMemo = { basedOnCount: position.moves.length, predictedPlies: predicted, replans };
      ctx.status = 'done';
      ctx.extra = { planStillValid: stillValid, replans, planLength: plan.length };
      if (deviated) reason = `Opponent left the model → re-planning. ${reason}`;
      const decision: MoveDecision = {
        col,
        columnScores: columnView(board, us, plan, found ? result!.cost : null, useH),
        pv: predicted,
        stats: { ...ctx.finishStats(stop), memoryPeak: Math.max(ctx.stats.memoryPeak, result?.memory ?? 0) },
        depthHistory: ctx.depthHistory,
        tree: ctx.tree.result(),
        randomised: false,
        reason,
        planMemo: memo,
        planFound: found,
        planStillValid: stillValid,
        deviated,
        seedUsed: seed,
      };
      return decision;
    },
  };
}
