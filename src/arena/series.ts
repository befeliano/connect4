import { Board } from '../engine/board';
import { mulberry32, randInt } from '../engine/rng';
import type { AgentConfig, MoveDecision, PlanMemo, Position } from '../agents/types';
import { otherSide, type GameRecord, type Side } from './stats';

export type Speed = 'instant' | 'fast' | 'watchable';

export interface SeriesSettings {
  games: number;
  alternate: boolean;
  randomOpenings: number;
  speed: Speed;
  timeOverride: number;
  seed: number;
}

export const DEFAULT_SETTINGS: SeriesSettings = { games: 20, alternate: true, randomOpenings: 2, speed: 'fast', timeOverride: 0, seed: 1 };

export function randomOpening(k: number, seed: number): number[] {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const b = new Board();
    const moves: number[] = [];
    let ok = true;
    for (let i = 0; i < k; i++) {
      const legal = b.legalMoves();
      const c = legal[randInt(rng, legal.length)];
      moves.push(c);
      if (b.play(c)) {
        ok = false;
        break;
      }
    }
    if (ok) return moves;
  }
  return [];
}

export function seriesConfig(c: AgentConfig, s: SeriesSettings, seed: number): AgentConfig {
  const out: AgentConfig = structuredClone(c);
  if (s.timeOverride > 0) out.common.timeLimitMs = s.timeOverride;
  out.common.minThinkMs = s.speed === 'watchable' ? Math.max(300, c.common.minThinkMs) : 0;
  if (s.speed === 'instant') {
    out.common.recordTree = 'off';
    out.common.telemetryHz = 1;
  }
  if (out.common.seed === null) out.common.seed = seed;
  return out;
}

export interface PlayHooks {
  think: (side: Side, position: Position, config: AgentConfig) => Promise<MoveDecision>;
  onMove?: (moves: number[], side: Side, d: MoveDecision) => void | Promise<void>;
  gate?: () => Promise<void>;
}

export async function playGame(
  index: number,
  step: number,
  configs: Record<Side, AgentConfig>,
  starter: Side,
  opening: number[],
  hooks: PlayHooks,
): Promise<GameRecord> {
  const b = Board.fromMoves(opening);
  const moves = [...opening];
  const sides: GameRecord['sides'] = { red: { moves: 0, timeMs: 0, nodes: 0 }, yellow: { moves: 0, timeMs: 0, nodes: 0 } };
  const memo: Record<Side, PlanMemo | null> = { red: null, yellow: null };
  const sideToMove = (): Side => (b.count % 2 === 0 ? starter : otherSide(starter));
  while (!b.isOver()) {
    await hooks.gate?.();
    const side = sideToMove();
    const d = await hooks.think(side, { moves: [...moves], planMemo: memo[side] }, configs[side]);
    if (!b.canPlay(d.col)) throw new Error(`Agent ${side} chose an illegal column ${d.col + 1}`);
    memo[side] = d.planMemo ?? null;
    b.play(d.col);
    moves.push(d.col);
    sides[side].moves++;
    sides[side].timeMs += d.stats.elapsedMs;
    sides[side].nodes += d.stats.expanded;
    await hooks.onMove?.([...moves], side, d);
  }
  const w = b.winner();
  const winner: GameRecord['winner'] = w === 0 ? 'draw' : w === 1 ? starter : otherSide(starter);
  return { index, step, starter, winner, plies: moves.length, moves, openingPlies: opening.length, sides };
}
