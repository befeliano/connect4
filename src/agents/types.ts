import type { EvalWeights } from '../engine/heuristics';

export type Family = 'ch3' | 'ch6' | 'baseline' | 'final';
export type Ch3Algorithm = 'bfs' | 'dfs' | 'ids' | 'greedy' | 'astar' | 'idastar';
export type Ch6Algorithm = 'minimax' | 'alphabeta' | 'mcts';
export type BaselineAlgorithm = 'random' | 'rule';
export type FinalAlgorithm = 'final';
export type AlgorithmId = Ch3Algorithm | Ch6Algorithm | BaselineAlgorithm | FinalAlgorithm;

export const CH3_ALGORITHMS: Ch3Algorithm[] = ['bfs', 'dfs', 'ids', 'greedy', 'astar', 'idastar'];
export const CH6_ALGORITHMS: Ch6Algorithm[] = ['minimax', 'alphabeta', 'mcts'];
export const BASELINE_ALGORITHMS: BaselineAlgorithm[] = ['random', 'rule'];

export function familyOf(a: AlgorithmId): Family {
  if ((CH3_ALGORITHMS as string[]).includes(a)) return 'ch3';
  if ((CH6_ALGORITHMS as string[]).includes(a)) return 'ch6';
  if (a === 'final') return 'final';
  return 'baseline';
}

export type RecordTree = 'off' | 'sampled' | 'full';

export interface CommonParams {
  timeLimitMs: number;
  nodeBudget: number;
  minThinkMs: number;
  epsilon: number;
  temperature: number;
  seed: number | null;
  telemetryHz: number;
  recordTree: RecordTree;
}

export interface Ch3Params {
  opponentModel: 'rule';
  heuristic: 'h' | 'zero';
  depthCap: number;
  useReachedSet: 'default' | 'on' | 'off';
  fallback: 'rule' | 'random';
}

export type MoveOrdering = 'none' | 'centre' | 'killerHistory';

export interface SearchParams {
  depth: number;
  evaluation: EvalWeights;
  preferFasterWins: boolean;
  moveOrdering: MoveOrdering;
  transpositionTable: boolean;
  ttSizeMB: number;
  iterativeDeepening: boolean;
  aspirationWindow: number;
}

export interface MctsParams {
  iterations: number;
  timeBounded: boolean;
  explorationC: number;
  rolloutPolicy: 'random' | 'rule';
  maxRolloutDepth: number;
  finalMoveSelection: 'visits' | 'mean';
}

export interface FinalParams {
  useOpening: boolean;
  openPlies: number;
  useSolver: boolean;
  solveFrom: number;
  solverBudgetK: number;
  solverMode: 'weak' | 'strong';
  tieBreakDepth: number;
}

export type Level = 'plan' | 'search' | 'solve';

export interface AgentConfig {
  algorithm: AlgorithmId;
  common: CommonParams;
  ch3: Ch3Params;
  search: SearchParams;
  mcts: MctsParams;
  final: FinalParams;
}

export interface PlanMemo {
  basedOnCount: number;
  predictedPlies: number[];
  replans: number;
}

export interface Position {
  moves: number[];
  planMemo?: PlanMemo | null;
}

export interface SearchStats {
  expanded: number;
  generated: number;
  elapsedMs: number;
  nodesPerSec: number;
  depth: number;
  fLimit: number | null;
  cutoffs: number;
  pruned: number;
  researches: number;
  ttHits: number;
  ttStores: number;
  frontier: number;
  reached: number;
  memoryPeak: number;
  iterations: number;
  treeSize: number;
  depthCompleted: number;
  stopReason: 'done' | 'time' | 'budget' | 'abort' | null;
}

export type ProvenResult = 'win' | 'loss' | 'draw' | null;

export interface ColumnScore {
  col: number;
  score: number | null;
  proven: ProvenResult;
  provenIn: number | null;
  label: string;
  visits?: number;
  winRate?: number;
  pruned?: boolean;
}

export interface DepthPoint {
  depth: number;
  nodes: number;
  ms: number;
  best: number;
  score: number | null;
}

export type AgentStatus = 'thinking' | 'waiting' | 'replanning' | 'done';

export interface Telemetry {
  status: AgentStatus;
  stats: SearchStats;
  columnScores: ColumnScore[] | null;
  pv: number[];
  bestCol: number | null;
  depthHistory: DepthPoint[];
  planLength?: number;
  planStillValid?: boolean;
  replans?: number;
  level?: Level;
}

export interface TreeNodeRec {
  id: number;
  parent: number;
  col: number;
  depth: number;
  order: number;
  value: number | null;
  kind: 'state' | 'goal' | 'dead' | 'pruned' | 'leaf' | 'win' | 'loss' | 'draw';
  label?: string;
}

export interface SearchTree {
  nodes: TreeNodeRec[];
  truncated: boolean;
  mode: RecordTree;
}

export interface MoveDecision {
  col: number;
  columnScores: ColumnScore[];
  pv: number[];
  stats: SearchStats;
  depthHistory: DepthPoint[];
  tree: SearchTree | null;
  randomised: boolean;
  reason: string;
  planMemo?: PlanMemo | null;
  planFound?: boolean;
  planStillValid?: boolean;
  deviated?: boolean;
  seedUsed: number;
  level?: Level;
  levelNote?: string;
  solver?: { values: (number | null)[]; weak: boolean; aborted: boolean; nodes: number } | null;
}

export interface CancelSignal {
  readonly aborted: boolean;
}

export interface Agent {
  id: AlgorithmId;
  family: Family;
  chooseMove(
    position: Position,
    config: AgentConfig,
    onTelemetry: (t: Telemetry) => void,
    signal: CancelSignal,
  ): Promise<MoveDecision>;
}

export function emptyStats(): SearchStats {
  return {
    expanded: 0,
    generated: 0,
    elapsedMs: 0,
    nodesPerSec: 0,
    depth: 0,
    fLimit: null,
    cutoffs: 0,
    pruned: 0,
    researches: 0,
    ttHits: 0,
    ttStores: 0,
    frontier: 0,
    reached: 0,
    memoryPeak: 0,
    iterations: 0,
    treeSize: 0,
    depthCompleted: 0,
    stopReason: null,
  };
}
