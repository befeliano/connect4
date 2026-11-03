import { makeCh3Agent, CH3_NAMES, simulatePlan } from './ch3/planner';
import { minimaxAgent } from './ch6/minimax';
import { alphaBetaAgent } from './ch6/alphabeta';
import { mctsAgent } from './ch6/mcts';
import { randomAgent } from './baseline/random';
import { ruleAgent } from './baseline/ruleBased';
import { finalAgent } from './final/hierarchical';
import { Board } from '../engine/board';
import { mulberry32, randInt, randomSeed } from '../engine/rng';
import { rankValue } from './scoring';
import type { Agent, AgentConfig, AlgorithmId, CancelSignal, MoveDecision, Position, Telemetry } from './types';

export const AGENTS: Record<AlgorithmId, Agent> = {
  bfs: makeCh3Agent('bfs'),
  dfs: makeCh3Agent('dfs'),
  ids: makeCh3Agent('ids'),
  greedy: makeCh3Agent('greedy'),
  astar: makeCh3Agent('astar'),
  idastar: makeCh3Agent('idastar'),
  minimax: minimaxAgent,
  alphabeta: alphaBetaAgent,
  mcts: mctsAgent,
  random: randomAgent,
  rule: ruleAgent,
  final: finalAgent,
};

export const ALGORITHM_NAMES: Record<AlgorithmId, string> = {
  ...CH3_NAMES,
  minimax: 'Minimax',
  alphabeta: 'Alpha-beta',
  mcts: 'MCTS (UCT)',
  random: 'Random',
  rule: 'Rule-based',
  final: 'Final agent (plan · search · solve)',
};

export async function runAgent(
  position: Position,
  config: AgentConfig,
  onTelemetry: (t: Telemetry) => void,
  signal: CancelSignal,
): Promise<MoveDecision> {
  const seed = config.common.seed ?? randomSeed();
  const cfg: AgentConfig = { ...config, common: { ...config.common, seed } };
  const decision = await AGENTS[config.algorithm].chooseMove(position, cfg, onTelemetry, signal);
  decision.seedUsed = seed;
  const rng = mulberry32((seed ^ (position.moves.length * 2654435761)) >>> 0);
  const legal = Board.fromMoves(position.moves).legalMoves();
  const { temperature, epsilon } = config.common;

  if (temperature > 0 && decision.columnScores.length) {
    const cands = decision.columnScores.filter((c) => legal.includes(c.col) && c.score !== null);
    if (cands.length > 1) {
      const vals = cands.map(rankValue);
      const max = Math.max(...vals);
      const w = vals.map((v) => Math.exp((v - max) / temperature));
      const total = w.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let pick = cands[cands.length - 1].col;
      for (let i = 0; i < cands.length; i++) {
        r -= w[i];
        if (r <= 0) {
          pick = cands[i].col;
          break;
        }
      }
      if (pick !== decision.col) {
        decision.reason += ` Temperature ${temperature} sampled column ${pick + 1} instead of ${decision.col + 1}.`;
        decision.col = pick;
        decision.randomised = true;
      }
    }
  }
  if (epsilon > 0 && rng() < epsilon) {
    const pick = legal[randInt(rng, legal.length)];
    decision.reason += ` Epsilon ${epsilon}: played a random column (${pick + 1}) instead of ${decision.col + 1}.`;
    decision.col = pick;
    decision.randomised = true;
    if (decision.planMemo) {
      decision.planMemo = { ...decision.planMemo, predictedPlies: simulatePlan(Board.fromMoves(position.moves), [pick]) };
    }
  }
  return decision;
}
