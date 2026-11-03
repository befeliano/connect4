import { Board } from '../../engine/board';
import { CENTRE_ORDER, ROWS } from '../../engine/lines';
import { solveColumns, outcomeOf, valueLabel } from '../../engine/solver';
import { nonLosingColumns, winningColumns } from '../../engine/tactics';
import { StopSearch } from '../context';
import { emptyColumnScores } from '../scoring';
import { emptyStats, type Agent, type AgentConfig, type ColumnScore, type MoveDecision, type Position, type Telemetry } from '../types';
import { runNegamax } from '../ch6/minimax';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function tel(level: 'plan' | 'search' | 'solve', partial: Partial<Telemetry> = {}): Telemetry {
  return { status: 'thinking', stats: emptyStats(), columnScores: null, pv: [], bestCol: null, depthHistory: [], level, ...partial };
}

function solveLevel(position: Position, config: AgentConfig, signal: { aborted: boolean }): MoveDecision | null {
  const f = config.final;
  const t0 = now();
  const weak = f.solverMode === 'weak';
  const plies = position.moves.length;
  const res = solveColumns(position.moves, weak, f.solverBudgetK);
  if (signal.aborted) throw new StopSearch('abort');
  if (res.aborted) return null;
  const legal = res.values.map((v, c) => (v === null ? -1 : c)).filter((c) => c >= 0);
  if (!legal.length) return null;
  const best = Math.max(...legal.map((c) => res.values[c] as number));
  const sign = Math.sign(best);
  const keep = legal.filter((c) => Math.sign(res.values[c] as number) === sign);
  let candidates = keep;
  if (!weak) {
    const top = Math.max(...keep.map((c) => res.values[c] as number));
    candidates = keep.filter((c) => res.values[c] === top);
  }
  let pick = candidates[0];
  let tie: ColumnScore[] | null = null;
  if (candidates.length > 1) {
    const cfg: AgentConfig = {
      ...config,
      common: { ...config.common, timeLimitMs: Infinity, nodeBudget: Infinity, recordTree: 'off', epsilon: 0, temperature: 0 },
      search: { ...config.search, depth: Math.max(1, f.tieBreakDepth), iterativeDeepening: false, transpositionTable: false, aspirationWindow: 0 },
    };
    const d = runNegamax('alphabeta', position, cfg, () => {}, signal);
    tie = d.columnScores;
    pick = candidates.reduce((a, c) => {
      const sa = tie?.[a]?.score ?? -Infinity;
      const sc = tie?.[c]?.score ?? -Infinity;
      if (sc > sa) return c;
      if (sc === sa && CENTRE_ORDER.indexOf(c) < CENTRE_ORDER.indexOf(a)) return c;
      return a;
    }, candidates[0]);
  }
  const scores = emptyColumnScores().map((s, c): ColumnScore => {
    const v = res.values[c];
    if (v === null) return s;
    const o = outcomeOf(v);
    return { col: c, score: v * 40, proven: o, provenIn: null, label: valueLabel(v, plies, weak) };
  });
  const stats = emptyStats();
  stats.expanded = res.nodes;
  stats.elapsedMs = now() - t0;
  stats.nodesPerSec = stats.elapsedMs > 0 ? Math.round((res.nodes * 1000) / stats.elapsedMs) : 0;
  stats.stopReason = 'done';
  const outcome = sign > 0 ? 'win' : sign < 0 ? 'loss' : 'draw';
  const verdict = outcome === 'win' ? 'keeps the forced win' : outcome === 'draw' ? 'keeps the draw' : 'loses anyway, so it resists the longest';
  const tieNote = candidates.length > 1 ? ` ${candidates.length} columns are equally good; a depth-${f.tieBreakDepth} search with the ${config.search.evaluation.kind} evaluation chose between them.` : '';
  return {
    col: pick,
    columnScores: scores,
    pv: [pick],
    stats,
    depthHistory: [],
    tree: null,
    randomised: false,
    reason: `Exact solver: column ${pick + 1} ${verdict} (${valueLabel(res.values[pick] as number, plies, weak)}).${tieNote}`,
    seedUsed: config.common.seed ?? 0,
    level: 'solve',
    levelNote: `${plies} discs on the board (from ${f.solveFrom} the solver is in charge). It proved every column in ${Math.round(res.nodes).toLocaleString('en-US')} positions.`,
    solver: { values: res.values, weak, aborted: false, nodes: res.nodes },
  };
}

function planLevel(position: Position, config: AgentConfig): MoveDecision | null {
  const f = config.final;
  const plies = position.moves.length;
  if (!f.useOpening || plies >= f.openPlies) return null;
  const board = Board.fromMoves(position.moves);
  if (board.heights[3] !== 0 || board.heights[3] >= ROWS) return null;
  if (winningColumns(board, board.turn).length) return null;
  if (!nonLosingColumns(board).includes(3)) return null;
  const scores = emptyColumnScores();
  scores[3] = { col: 3, score: null, proven: null, provenIn: null, label: 'Plan' };
  return {
    col: 3,
    columnScores: scores,
    pv: [3],
    stats: { ...emptyStats(), stopReason: 'done' },
    depthHistory: [],
    tree: null,
    randomised: false,
    reason: 'Opening plan: take the centre column while it is empty. Under perfect play the centre is the only winning first move (Allis 1988).',
    seedUsed: config.common.seed ?? 0,
    level: 'plan',
    levelNote: `${plies} discs on the board (the plan is used for the first ${f.openPlies}). The centre column is empty and nothing is forced.`,
  };
}

export const finalAgent: Agent = {
  id: 'final',
  family: 'final',
  async chooseMove(position, config, onTelemetry, signal) {
    const f = config.final;
    const plies = position.moves.length;
    let fallback = '';
    if (f.useSolver && plies >= f.solveFrom) {
      onTelemetry(tel('solve'));
      const d = solveLevel(position, config, signal);
      if (d) return d;
      fallback = ` The solver ran out of its budget (${f.solverBudgetK.toLocaleString('en-US')}k positions), so the search level took over.`;
    }
    const plan = planLevel(position, config);
    if (plan) {
      onTelemetry(tel('plan', { bestCol: 3, pv: [3] }));
      return plan;
    }
    onTelemetry(tel('search'));
    const d = runNegamax('alphabeta', position, config, (t) => onTelemetry({ ...t, level: 'search' }), signal);
    d.level = 'search';
    const why =
      f.useSolver && plies < f.solveFrom
        ? `${plies} discs on the board: too early for the solver (from ${f.solveFrom}).`
        : !f.useSolver
          ? 'The solver level is switched off.'
          : '';
    d.levelNote = `${why}${fallback} Alpha-beta, depth ${config.search.depth}, ${config.search.evaluation.kind} evaluation at the leaves.`.trim();
    d.reason = `Search: ${d.reason}${fallback}`;
    return d;
  },
};
