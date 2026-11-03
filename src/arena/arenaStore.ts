import { create } from 'zustand';
import { presetConfig } from '../agents/presets';
import type { AgentConfig, MoveDecision } from '../agents/types';
import { AgentWorker, isCancelled } from '../worker/client';
import { agentSeat, patchRuntime, useGame, type SeatId } from '../state/gameStore';
import { loadMoves, playMove, telemetryFromDecision } from '../state/controller';
import { DEFAULT_SETTINGS, playGame, randomOpening, seriesConfig, type SeriesSettings } from './series';
import { otherSide, type GameRecord, type Side } from './stats';

export type TemplateId = 'ch3vsch6' | 'mmVsAb' | 'mctsSweep' | 'a3vsFinal' | 'ablation' | 'handVsLearned';

export interface Sweep {
  label: string;
  values: number[];
  apply: 'mcts.iterations';
}

export interface ArenaState {
  red: AgentConfig;
  yellow: AgentConfig;
  settings: SeriesSettings;
  sweep: Sweep | null;
  results: GameRecord[];
  running: boolean;
  paused: boolean;
  progress: { game: number; total: number; step: number };
  error: string | null;
  togglePause: () => void;
}

const defaultYellow = (): AgentConfig => presetConfig('medium');

export const useArena = create<ArenaState>((set) => ({
  red: presetConfig('ch3'),
  yellow: defaultYellow(),
  settings: { ...DEFAULT_SETTINGS },
  sweep: null,
  results: [],
  running: false,
  paused: false,
  progress: { game: 0, total: 0, step: 0 },
  error: null,
  togglePause: () => {
    set((s) => ({ paused: !s.paused }));
    wake();
  },
}));

const workers: Partial<Record<Side, AgentWorker>> = {};
const worker = (s: Side) => (workers[s] ??= new AgentWorker());
let runId = 0;
let stepOnce = false;
let waiter: (() => void) | null = null;
let replayTimer: ReturnType<typeof setTimeout> | null = null;

function wake(): void {
  const w = waiter;
  waiter = null;
  w?.();
}

class Stopped extends Error {}

export function stepArena(): void {
  stepOnce = true;
  wake();
}

export function stopArena(): void {
  runId++;
  for (const w of Object.values(workers)) w?.cancel();
  useArena.setState({ running: false, paused: false });
  wake();
}

function sweepConfig(base: AgentConfig, sweep: Sweep | null, step: number): AgentConfig {
  if (!sweep) return base;
  const c = structuredClone(base);
  if (sweep.apply === 'mcts.iterations') {
    c.mcts.iterations = sweep.values[step];
    c.mcts.timeBounded = false;
    c.common.timeLimitMs = Math.max(c.common.timeLimitMs, 10_000);
  }
  return c;
}

function showOnBoard(configs: Record<Side, AgentConfig>, starter: Side, opening: number[]): void {
  const seat1 = agentSeat(configs[starter]);
  const seat2 = agentSeat(configs[otherSide(starter)]);
  seat1.name = `${starter.toUpperCase()} · ${seat1.name}`;
  seat2.name = `${otherSide(starter).toUpperCase()} · ${seat2.name}`;
  useGame.setState({
    mode: 'arena',
    seats: { 1: seat1, 2: seat2 },
    colorOf: { 1: starter === 'red' ? 1 : 2, 2: starter === 'red' ? 2 : 1 },
    paused: false,
  });
  loadMoves(opening);
}

const seatOf = (side: Side, starter: Side): SeatId => (side === starter ? 1 : 2);

export async function startArena(): Promise<void> {
  const id = ++runId;
  if (replayTimer) clearTimeout(replayTimer);
  const { red, yellow, settings, sweep } = useArena.getState();
  const steps = sweep ? sweep.values.length : 1;
  const total = steps * settings.games;
  useArena.setState({ running: true, paused: false, results: [], error: null, progress: { game: 0, total, step: 0 } });
  const visible = settings.speed !== 'instant';

  const gate = async () => {
    if (id !== runId) throw new Stopped();
    while (useArena.getState().paused && !stepOnce) {
      await new Promise<void>((r) => (waiter = r));
      if (id !== runId) throw new Stopped();
    }
    stepOnce = false;
  };

  try {
    let n = 0;
    for (let step = 0; step < steps; step++) {
      for (let g = 0; g < settings.games; g++) {
        if (id !== runId) return;
        const starter: Side = settings.alternate && g % 2 === 1 ? 'yellow' : 'red';
        const seed = settings.seed * 100_003 + step * 1009 + g;
        const opening = randomOpening(settings.randomOpenings, seed);
        const configs: Record<Side, AgentConfig> = {
          red: seriesConfig(sweepConfig(red, sweep, step), settings, seed * 2 + 1),
          yellow: seriesConfig(yellow, settings, seed * 2 + 2),
        };
        useArena.setState({ progress: { game: n + 1, total, step } });
        if (visible) showOnBoard(configs, starter, opening);
        const record = await playGame(n, step, configs, starter, opening, {
          gate,
          think: async (side, position, config) => {
            const seat = seatOf(side, starter);
            const started = performance.now();
            if (visible) patchRuntime(seat, { status: 'thinking', telemetry: null, series: [{ t: 0, nodes: 0 }], startedAt: started, basedOn: position.moves.length });
            const d: MoveDecision = await worker(side).think(position, config, (tel) => {
              if (!visible || id !== runId) return;
              const rt = useGame.getState().runtime[seat];
              patchRuntime(seat, { status: tel.status, telemetry: tel, series: [...rt.series, { t: tel.stats.elapsedMs, nodes: tel.stats.expanded }].slice(-400) });
            });
            const wait = config.common.minThinkMs - (performance.now() - started);
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            if (id !== runId) throw new Stopped();
            return d;
          },
          onMove: async (_moves, side, d) => {
            if (!visible) return;
            const seat = seatOf(side, starter);
            patchRuntime(seat, { status: 'done', telemetry: telemetryFromDecision(d), decision: d, planMemo: d.planMemo ?? null });
            playMove(d.col, 'agent', d);
          },
        });
        if (id !== runId) return;
        n++;
        useArena.setState((s) => ({ results: [...s.results, record] }));
        if (settings.speed === 'watchable') await new Promise((r) => setTimeout(r, 1500));
        else if (settings.speed === 'fast') await new Promise((r) => setTimeout(r, 250));
        else if (n % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (e) {
    if (!(e instanceof Stopped) && !isCancelled(e)) {
      console.error(e);
      useArena.setState({ error: String(e instanceof Error ? e.message : e) });
    }
  } finally {
    if (id === runId) useArena.setState({ running: false, paused: false });
  }
}

export function watchGame(rec: GameRecord): void {
  if (useArena.getState().running) return;
  if (replayTimer) clearTimeout(replayTimer);
  const { red, yellow } = useArena.getState();
  showOnBoard({ red, yellow }, rec.starter, rec.moves.slice(0, rec.openingPlies));
  let i = rec.openingPlies;
  const tick = () => {
    if (i >= rec.moves.length) return;
    playMove(rec.moves[i++], 'agent');
    replayTimer = setTimeout(tick, 450);
  };
  replayTimer = setTimeout(tick, 600);
}

const fair = (games: number): SeriesSettings => ({ ...DEFAULT_SETTINGS, games, alternate: true, randomOpenings: 2, speed: 'fast' });

export function applyTemplate(id: TemplateId): void {
  stopArena();
  if (id === 'a3vsFinal') {
    useArena.setState({ red: presetConfig('ch3'), yellow: presetConfig('final'), sweep: null, settings: fair(10), results: [] });
    return;
  }
  if (id === 'ablation') {
    const off = presetConfig('final');
    off.final.useSolver = false;
    useArena.setState({ red: presetConfig('final'), yellow: off, sweep: null, settings: fair(10), results: [] });
    return;
  }
  if (id === 'handVsLearned') {
    const hand = presetConfig('medium');
    hand.search.depth = 4;
    const learned = presetConfig('medium');
    learned.search.depth = 4;
    learned.search.evaluation = { ...learned.search.evaluation, kind: 'committee' };
    useArena.setState({ red: hand, yellow: learned, sweep: null, settings: fair(20), results: [] });
    return;
  }
  if (id === 'ch3vsch6') {
    const ab = presetConfig('medium');
    ab.search.depth = 5;
    useArena.setState({
      red: presetConfig('ch3'),
      yellow: ab,
      sweep: null,
      settings: { ...DEFAULT_SETTINGS, games: 20, alternate: true, randomOpenings: 2, speed: 'fast' },
      results: [],
    });
  } else if (id === 'mmVsAb') {
    const mm = presetConfig('easy');
    mm.common.epsilon = 0;
    mm.search.depth = 4;
    const ab = presetConfig('medium');
    ab.search.depth = 4;
    ab.search.moveOrdering = 'none';
    useArena.setState({
      red: mm,
      yellow: ab,
      sweep: null,
      settings: { ...DEFAULT_SETTINGS, games: 10, alternate: true, randomOpenings: 2, speed: 'fast' },
      results: [],
    });
  } else {
    const mcts = presetConfig('medium');
    mcts.algorithm = 'mcts';
    const ab = presetConfig('medium');
    ab.search.depth = 4;
    useArena.setState({
      red: mcts,
      yellow: ab,
      sweep: { label: 'MCTS iterations', values: [250, 1000, 4000, 16000], apply: 'mcts.iterations' },
      settings: { ...DEFAULT_SETTINGS, games: 10, alternate: true, randomOpenings: 2, speed: 'instant' },
      results: [],
    });
  }
}

export function swapSides(): void {
  const s = useArena.getState();
  useArena.setState({ red: s.yellow, yellow: s.red, sweep: null, results: [] });
}
