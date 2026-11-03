import { DEFAULT_WEIGHTS } from '../engine/heuristics';
import type { AgentConfig } from './types';

export type PresetId = 'easy' | 'medium' | 'hard' | 'ch3' | 'ch6' | 'learned' | 'final';

export const DIFFICULTY_PRESETS: PresetId[] = ['easy', 'medium', 'hard'];
export const CHAPTER_PRESETS: PresetId[] = ['ch3', 'ch6', 'learned', 'final'];

export function defaultConfig(): AgentConfig {
  return {
    algorithm: 'alphabeta',
    common: {
      timeLimitMs: 1000,
      nodeBudget: Infinity,
      minThinkMs: 400,
      epsilon: 0,
      temperature: 0,
      seed: null,
      telemetryHz: 10,
      recordTree: 'sampled',
    },
    ch3: {
      opponentModel: 'rule',
      heuristic: 'h',
      depthCap: 10,
      useReachedSet: 'default',
      fallback: 'rule',
    },
    search: {
      depth: 4,
      evaluation: { ...DEFAULT_WEIGHTS, tdWeights: [...DEFAULT_WEIGHTS.tdWeights], committee: { ...DEFAULT_WEIGHTS.committee } },
      preferFasterWins: true,
      moveOrdering: 'centre',
      transpositionTable: false,
      ttSizeMB: 32,
      iterativeDeepening: false,
      aspirationWindow: 0,
    },
    mcts: {
      iterations: 5000,
      timeBounded: false,
      explorationC: Math.SQRT2,
      rolloutPolicy: 'random',
      maxRolloutDepth: 42,
      finalMoveSelection: 'visits',
    },
    final: {
      useOpening: true,
      openPlies: 6,
      useSolver: true,
      solveFrom: 16,
      solverBudgetK: 15000,
      solverMode: 'weak',
      tieBreakDepth: 2,
    },
  };
}

export const PRESET_LABELS: Record<PresetId, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  ch3: 'Ch 3–4 agent',
  ch6: 'Ch 6 agent',
  learned: 'Ch 19–22 agent',
  final: 'Final agent',
};

export function presetConfig(id: PresetId): AgentConfig {
  const c = defaultConfig();
  switch (id) {
    case 'easy':
      c.algorithm = 'minimax';
      c.search.depth = 2;
      c.search.moveOrdering = 'none';
      c.common.epsilon = 0.25;
      c.common.minThinkMs = 600;
      break;
    case 'medium':
      c.algorithm = 'alphabeta';
      c.search.depth = 5;
      c.search.moveOrdering = 'centre';
      c.search.transpositionTable = false;
      c.common.minThinkMs = 500;
      break;
    case 'hard':
      return presetConfig('final');
    case 'ch6':
      c.algorithm = 'alphabeta';
      c.search.depth = 6;
      c.search.moveOrdering = 'centre';
      c.common.minThinkMs = 500;
      break;
    case 'learned':
      c.algorithm = 'alphabeta';
      c.search.depth = 6;
      c.search.moveOrdering = 'centre';
      c.search.evaluation = { ...c.search.evaluation, kind: 'committee' };
      c.common.timeLimitMs = 6000;
      c.common.minThinkMs = 500;
      break;
    case 'ch3':
      c.algorithm = 'idastar';
      c.ch3.heuristic = 'h';
      c.ch3.opponentModel = 'rule';
      break;
    case 'final':
      c.algorithm = 'final';
      c.search.depth = 6;
      c.search.moveOrdering = 'centre';
      c.search.evaluation = { ...c.search.evaluation, kind: 'committee' };
      c.common.timeLimitMs = 6000;
      c.common.minThinkMs = 500;
      break;
  }
  return c;
}

export function matchingPresets(config: AgentConfig): PresetId[] {
  return (Object.keys(PRESET_LABELS) as PresetId[]).filter((id) => sameConfig(presetConfig(id), config));
}

export function matchPreset(config: AgentConfig): PresetId | null {
  for (const id of Object.keys(PRESET_LABELS) as PresetId[]) {
    const p = presetConfig(id);
    if (sameConfig(p, config)) return id;
  }
  return null;
}

function sameConfig(a: AgentConfig, b: AgentConfig): boolean {
  const norm = (c: AgentConfig) => JSON.stringify({ ...c, common: { ...c.common, seed: null } });
  return norm(a) === norm(b);
}

export function configToJSON(c: AgentConfig): unknown {
  return { ...c, common: { ...c.common, nodeBudget: Number.isFinite(c.common.nodeBudget) ? c.common.nodeBudget : null } };
}

export function configFromJSON(v: unknown): AgentConfig {
  const base = defaultConfig();
  const o = (v ?? {}) as Partial<AgentConfig>;
  const merged: AgentConfig = {
    algorithm: o.algorithm ?? base.algorithm,
    common: { ...base.common, ...(o.common ?? {}) },
    ch3: { ...base.ch3, ...(o.ch3 ?? {}) },
    search: { ...base.search, ...(o.search ?? {}), evaluation: { ...base.search.evaluation, ...(o.search?.evaluation ?? {}) } },
    mcts: { ...base.mcts, ...(o.mcts ?? {}) },
    final: { ...base.final, ...(o.final ?? {}) },
  };
  const ev = merged.search.evaluation;
  if (!Array.isArray(ev.tdWeights) || ev.tdWeights.length !== 13) ev.tdWeights = [...base.search.evaluation.tdWeights];
  ev.committee = { ...base.search.evaluation.committee, ...(ev.committee ?? {}) };
  if (merged.common.nodeBudget === null || merged.common.nodeBudget === undefined) merged.common.nodeBudget = Infinity;
  return merged;
}
