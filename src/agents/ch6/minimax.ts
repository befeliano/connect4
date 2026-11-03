import { Board } from '../../engine/board';
import { CENTRE_ORDER } from '../../engine/lines';
import { SearchContext, StopSearch } from '../context';
import type { Agent, AgentConfig, CancelSignal, MoveDecision, Position, SearchParams, Telemetry } from '../types';
import { Negamax } from './negamax';

export function contextFor(config: AgentConfig, onTelemetry: (t: Telemetry) => void, signal: CancelSignal): SearchContext {
  const c = config.common;
  return new SearchContext({
    signal,
    timeLimitMs: c.timeLimitMs,
    nodeBudget: c.nodeBudget,
    telemetryHz: c.telemetryHz,
    onTelemetry,
    recordTree: c.recordTree,
  });
}

export function runNegamax(
  kind: 'minimax' | 'alphabeta',
  position: Position,
  config: AgentConfig,
  onTelemetry: (t: Telemetry) => void,
  signal: CancelSignal,
): MoveDecision {
  const board = Board.fromMoves(position.moves);
  const ctx = contextFor(config, onTelemetry, signal);
  const params: SearchParams =
    kind === 'minimax'
      ? { ...config.search, moveOrdering: 'none', transpositionTable: false, iterativeDeepening: false, aspirationWindow: 0 }
      : config.search;
  ctx.emitNow();
  const engine = new Negamax(board, ctx, { pruning: kind === 'alphabeta', params });
  const { result, stop } = engine.run();
  if (stop === 'abort') throw new StopSearch('abort');

  const name = kind === 'minimax' ? 'Minimax' : 'Alpha-beta';
  let col: number;
  let reason: string;
  let scores = result?.scores ?? null;
  let pv = result?.pv ?? [];
  if (result) {
    col = result.bestCol;
    const limited = stop === 'time' ? ' (time limit reached during the next depth)' : stop === 'budget' ? ' (node budget reached)' : '';
    reason = `${name} completed depth ${result.depthCompleted}${limited}.`;
  } else {
    const partial = engine.partialScores();
    const scored = partial?.filter((s) => s.score !== null) ?? [];
    if (scored.length) {
      const best = scored.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a));
      col = best.col;
      scores = partial;
      pv = [col];
    } else {
      col = CENTRE_ORDER.find((c) => board.canPlay(c)) as number;
    }
    reason = `${name} ran out of ${stop === 'budget' ? 'node budget' : 'time'} before finishing depth 1; playing the best column found so far.`;
  }
  ctx.status = 'done';
  return {
    col,
    columnScores: scores ?? [],
    pv,
    stats: ctx.finishStats(stop),
    depthHistory: ctx.depthHistory,
    tree: result?.tree ? { nodes: result.tree, truncated: result.treeTruncated, mode: config.common.recordTree } : null,
    randomised: false,
    reason,
    seedUsed: config.common.seed ?? 0,
  };
}

export const minimaxAgent: Agent = {
  id: 'minimax',
  family: 'ch6',
  chooseMove: async (position, config, onTelemetry, signal) => runNegamax('minimax', position, config, onTelemetry, signal),
};
