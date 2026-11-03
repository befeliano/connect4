import { create } from 'zustand';
import { Board } from '../engine/board';
import { presetConfig, type PresetId } from '../agents/presets';
import { ALGORITHM_NAMES } from '../agents/registry';
import type { AgentConfig, AgentStatus, MoveDecision, PlanMemo, Telemetry } from '../agents/types';
import { t } from '../i18n/en';

export type SeatId = 1 | 2;
export type SeatKind = 'human' | 'agent' | 'guest';
export type GameMode = 'hva' | 'hvh' | 'ava' | 'arena';

export interface Seat {
  kind: SeatKind;
  name: string;
  config: AgentConfig;
}

export interface SeatRuntime {
  status: AgentStatus | 'idle';
  telemetry: Telemetry | null;
  series: { t: number; nodes: number }[];
  decision: MoveDecision | null;
  planMemo: PlanMemo | null;
  startedAt: number;
  basedOn: number;
}

export interface LogEntry {
  ply: number;
  player: SeatId;
  by: SeatKind;
  col: number;
  timeMs: number;
  nodes: number | null;
  depth: number | null;
  score: string;
  reason?: string;
  level?: string;
}

export interface GameState {
  moves: number[];
  mode: GameMode;
  humanSeat: SeatId;
  seats: Record<SeatId, Seat>;
  runtime: Record<SeatId, SeatRuntime>;
  log: LogEntry[];
  paused: boolean;
  focusSeat: SeatId;
  announcement: string;
  turnStartedAt: number;
  gameId: number;
  colorOf: Record<SeatId, 1 | 2>;
}

const freshRuntime = (): SeatRuntime => ({ status: 'idle', telemetry: null, series: [], decision: null, planMemo: null, startedAt: 0, basedOn: 0 });

export function agentName(config: AgentConfig): string {
  const short: Record<string, string> = {
    bfs: 'BFS',
    dfs: 'DFS',
    ids: 'IDS',
    greedy: 'GREEDY',
    astar: 'A*',
    idastar: 'IDA*',
    minimax: 'MINIMAX',
    alphabeta: 'ALPHABETA',
    mcts: 'MCTS',
    random: 'RANDOM',
    rule: 'RULE',
    final: 'FINAL',
  };
  const fam = ['bfs', 'dfs', 'ids', 'greedy', 'astar', 'idastar'].includes(config.algorithm)
    ? ' (Ch3)'
    : ['minimax', 'alphabeta', 'mcts'].includes(config.algorithm)
      ? ' (Ch6)'
      : config.algorithm === 'final'
        ? ' (Ch19–23)'
        : '';
  return `CLUSTER-${short[config.algorithm] ?? ALGORITHM_NAMES[config.algorithm]}${fam}`;
}

export const agentSeat = (config: AgentConfig): Seat => ({ kind: 'agent', name: agentName(config), config });
export const humanSeatOf = (name = 'HUMAN'): Seat => ({ kind: 'human', name, config: presetConfig('medium') });

export const useGame = create<GameState>(() => ({
  moves: [],
  mode: 'hva',
  humanSeat: 1,
  seats: { 1: humanSeatOf('YOU'), 2: agentSeat(presetConfig('final')) },
  runtime: { 1: freshRuntime(), 2: freshRuntime() },
  log: [],
  paused: false,
  focusSeat: 2,
  announcement: '',
  turnStartedAt: Date.now(),
  gameId: 0,
  colorOf: { 1: 1, 2: 2 },
}));

export function boardOf(moves: number[]): Board {
  return Board.fromMoves(moves);
}

export function seatToMove(moves: number[]): SeatId {
  return moves.length % 2 === 0 ? 1 : 2;
}

export function gameResult(moves: number[]): { over: boolean; winner: 0 | SeatId; line: number[] | null } {
  const b = Board.fromMoves(moves);
  return { over: b.isOver(), winner: b.winner(), line: b.winningLine() };
}

export const resetRuntime = (): Record<SeatId, SeatRuntime> => ({ 1: freshRuntime(), 2: freshRuntime() });

export function patchRuntime(seat: SeatId, patch: Partial<SeatRuntime>): void {
  useGame.setState((s) => ({ runtime: { ...s.runtime, [seat]: { ...s.runtime[seat], ...patch } } }));
}

export function announceMove(moves: number[]): string {
  const b = Board.fromMoves(moves);
  const col = moves[moves.length - 1] + 1;
  const colorOf = useGame.getState().colorOf;
  const mover = t.players[colorOf[(moves.length % 2 === 1 ? 1 : 2) as SeatId]];
  if (b.winner()) return t.game.droppedWin(mover, col);
  if (b.isFull()) return t.game.droppedDraw(mover, col);
  return t.game.dropped(mover, col, t.players[colorOf[seatToMove(moves)]]);
}

export function setupSeats(mode: GameMode, humanSeat: SeatId, preset: PresetId | AgentConfig, preset2?: PresetId | AgentConfig): Record<SeatId, Seat> {
  const cfg = (p: PresetId | AgentConfig) => (typeof p === 'string' ? presetConfig(p) : p);
  if (mode === 'hvh') return { 1: humanSeatOf('RED'), 2: humanSeatOf('YELLOW') };
  if (mode === 'ava') return { 1: agentSeat(cfg(preset)), 2: agentSeat(cfg(preset2 ?? preset)) };
  const agent = agentSeat(cfg(preset));
  return humanSeat === 1 ? { 1: humanSeatOf('YOU'), 2: agent } : { 1: agent, 2: humanSeatOf('YOU') };
}
