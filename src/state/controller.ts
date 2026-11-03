import { AgentWorker, isCancelled } from '../worker/client';
import type { AgentConfig, MoveDecision, Telemetry } from '../agents/types';
import { presetConfig, type PresetId } from '../agents/presets';
import { t } from '../i18n/en';
import {
  agentName,
  announceMove,
  boardOf,
  patchRuntime,
  resetRuntime,
  seatToMove,
  setupSeats,
  useGame,
  type GameMode,
  type LogEntry,
  type Seat,
  type SeatId,
  type SeatKind,
} from './gameStore';

const workers: Partial<Record<SeatId, AgentWorker>> = {};
let thinkingFor: string | null = null;
let stepOnce = false;
type MoveListener = (moves: number[], by: SeatKind) => void;
const moveListeners = new Set<MoveListener>();
const resetListeners = new Set<() => void>();

const worker = (seat: SeatId): AgentWorker => (workers[seat] ??= new AgentWorker());
export const getWorker = worker;

export function onMove(fn: MoveListener): () => void {
  moveListeners.add(fn);
  return () => moveListeners.delete(fn);
}

export function onReset(fn: () => void): () => void {
  resetListeners.add(fn);
  return () => resetListeners.delete(fn);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function telemetryFromDecision(d: MoveDecision): Telemetry {
  return {
    status: 'done',
    stats: d.stats,
    columnScores: d.columnScores,
    pv: d.pv,
    bestCol: d.col,
    depthHistory: d.depthHistory,
    planLength: d.planMemo ? d.pv.filter((_, i) => i % 2 === 0).length : undefined,
    planStillValid: d.planStillValid,
    replans: d.planMemo?.replans,
    level: d.level,
  };
}

function cancelSearches(): void {
  thinkingFor = null;
  for (const w of Object.values(workers)) w?.cancel();
}

function schedule(): void {
  queueMicrotask(maybeThink);
}

function scoreText(d: MoveDecision): string {
  const s = d.columnScores[d.col];
  return s ? s.label : '—';
}

export function playMove(col: number, by: SeatKind, decision?: MoveDecision): boolean {
  const s = useGame.getState();
  const b = boardOf(s.moves);
  if (b.isOver() || !b.canPlay(col)) return false;
  const seat = seatToMove(s.moves);
  const moves = [...s.moves, col];
  const entry: LogEntry = {
    ply: moves.length,
    player: seat,
    by,
    col,
    timeMs: decision ? Math.round(decision.stats.elapsedMs) : Date.now() - s.turnStartedAt,
    nodes: decision ? decision.stats.expanded : null,
    depth: decision ? decision.stats.depthCompleted || decision.stats.depth : null,
    score: decision ? scoreText(decision) : '—',
    reason: decision?.reason,
    level: decision?.level,
  };
  useGame.setState({ moves, log: [...s.log, entry], announcement: announceMove(moves), turnStartedAt: Date.now() });
  for (const fn of moveListeners) fn(moves, by);
  schedule();
  return true;
}

export function humanMove(col: number): boolean {
  const s = useGame.getState();
  if (s.seats[seatToMove(s.moves)].kind !== 'human') return false;
  return playMove(col, 'human');
}

export function guestMove(col: number): string | null {
  const s = useGame.getState();
  const b = boardOf(s.moves);
  if (b.isOver()) return 'The game is over.';
  if (s.seats[seatToMove(s.moves)].kind !== 'guest') return 'It is not your turn.';
  if (!Number.isInteger(col) || col < 0 || col > 6) return 'No such column.';
  if (!b.canPlay(col)) return `Column ${col + 1} is full.`;
  playMove(col, 'guest');
  return null;
}

function maybeThink(): void {
  const s = useGame.getState();
  const b = boardOf(s.moves);
  if (b.isOver()) {
    for (const seat of [1, 2] as SeatId[]) if (s.seats[seat].kind === 'agent') patchRuntime(seat, { status: 'idle' });
    return;
  }
  const seat = seatToMove(s.moves);
  const other: SeatId = seat === 1 ? 2 : 1;
  const st = s.seats[seat];
  if (s.seats[other].kind === 'agent' && s.runtime[other].status !== 'done') patchRuntime(other, { status: 'waiting' });
  if (st.kind !== 'agent' || s.mode === 'arena') return;
  if (s.mode === 'ava' && s.paused && !stepOnce) return;
  stepOnce = false;
  const key = `${s.gameId}:${seat}:${s.moves.join('')}`;
  if (thinkingFor === key) return;
  thinkingFor = key;
  const config = st.config;
  const startedAt = performance.now();
  patchRuntime(seat, { status: 'thinking', telemetry: null, series: [{ t: 0, nodes: 0 }], startedAt, basedOn: s.moves.length });
  if (s.seats[other].kind === 'agent') patchRuntime(other, { status: 'waiting' });

  worker(seat)
    .think({ moves: s.moves, planMemo: s.runtime[seat].planMemo }, config, (tel) => {
      if (thinkingFor !== key) return;
      const rt = useGame.getState().runtime[seat];
      patchRuntime(seat, {
        status: tel.status,
        telemetry: tel,
        series: [...rt.series, { t: tel.stats.elapsedMs, nodes: tel.stats.expanded }].slice(-600),
      });
    })
    .then(async (d) => {
      if (thinkingFor !== key) return;
      const rt = useGame.getState().runtime[seat];
      patchRuntime(seat, {
        telemetry: { ...telemetryFromDecision(d), status: 'thinking' },
        series: [...rt.series, { t: d.stats.elapsedMs, nodes: d.stats.expanded }],
        decision: d,
      });
      const wait = config.common.minThinkMs - (performance.now() - startedAt);
      if (wait > 0) await sleep(wait);
      if (thinkingFor !== key) return;
      thinkingFor = null;
      patchRuntime(seat, { status: 'done', telemetry: telemetryFromDecision(d), decision: d, planMemo: d.planMemo ?? null });
      playMove(d.col, 'agent', d);
    })
    .catch((e) => {
      if (isCancelled(e)) return;
      if (thinkingFor === key) thinkingFor = null;
      console.error(e);
      patchRuntime(seat, { status: 'idle' });
      useGame.setState({ announcement: t.errors.workerFailed });
    });
}

export function newGame(): void {
  cancelSearches();
  useGame.setState((s) => ({
    moves: [],
    log: [],
    runtime: resetRuntime(),
    gameId: s.gameId + 1,
    announcement: `New game. ${t.players[1]} to move.`,
    turnStartedAt: Date.now(),
  }));
  for (const fn of resetListeners) fn();
  schedule();
}

export function loadMoves(moves: number[]): void {
  cancelSearches();
  useGame.setState((s) => ({
    moves,
    log: moves.map((col, i) => ({ ply: i + 1, player: (i % 2 === 0 ? 1 : 2) as SeatId, by: 'human', col, timeMs: 0, nodes: null, depth: null, score: '—' })),
    runtime: resetRuntime(),
    gameId: s.gameId + 1,
    turnStartedAt: Date.now(),
  }));
  schedule();
}

export function undo(): void {
  const s = useGame.getState();
  if (s.mode === 'ava' || s.moves.length === 0) return;
  if (Object.values(s.seats).some((x) => x.kind === 'guest')) return;
  cancelSearches();
  const moves = [...s.moves];
  moves.pop();
  while (moves.length > 0 && s.seats[seatToMove(moves)].kind === 'agent') moves.pop();
  useGame.setState({
    moves,
    log: s.log.slice(0, moves.length),
    runtime: { 1: { ...s.runtime[1], status: 'idle', planMemo: null }, 2: { ...s.runtime[2], status: 'idle', planMemo: null } },
    announcement: `Undone. ${t.players[seatToMove(moves)]} to move.`,
    turnStartedAt: Date.now(),
  });
  for (const fn of moveListeners) fn(moves, 'human');
  schedule();
}

export function setMode(mode: GameMode, opts: { humanSeat?: SeatId; preset?: PresetId | AgentConfig; preset2?: PresetId | AgentConfig } = {}): void {
  const s = useGame.getState();
  const humanSeat = opts.humanSeat ?? s.humanSeat;
  const currentAgent = Object.values(s.seats).find((x) => x.kind === 'agent');
  const seats = setupSeats(mode, humanSeat, opts.preset ?? currentAgent?.config ?? 'medium', opts.preset2);
  useGame.setState({
    mode,
    humanSeat,
    seats,
    paused: false,
    colorOf: { 1: 1, 2: 2 },
    focusSeat: mode === 'hva' ? (humanSeat === 1 ? 2 : 1) : s.focusSeat,
  });
  newGame();
}

export function setSeats(seats: Record<SeatId, Seat>, mode: GameMode = 'hva'): void {
  useGame.setState({ seats, mode, paused: false, colorOf: { 1: 1, 2: 2 }, focusSeat: seats[2].kind === 'agent' ? 2 : 1 });
  newGame();
}

export function setSeatConfig(seat: SeatId, config: AgentConfig): void {
  const s = useGame.getState();
  if (s.seats[seat].kind !== 'agent') return;
  if (thinkingFor?.includes(`:${seat}:`)) cancelSearches();
  useGame.setState({ seats: { ...s.seats, [seat]: { ...s.seats[seat], config, name: agentName(config) } } });
  schedule();
}

export function setPreset(seat: SeatId, preset: PresetId): void {
  setSeatConfig(seat, presetConfig(preset));
}

export function setPaused(paused: boolean): void {
  useGame.setState({ paused });
  schedule();
}

export function step(): void {
  stepOnce = true;
  schedule();
}

export function refreshAgents(): void {
  schedule();
}
