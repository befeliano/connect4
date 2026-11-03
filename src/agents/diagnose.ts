import { Board } from '../engine/board';
import { DEFAULT_WEIGHTS, type EvalWeights } from '../engine/heuristics';
import { committeeScore, handScore, linearScore, networkScore, tdScore } from '../engine/learned/evaluators';
import { solveColumns, valueLabel } from '../engine/solver';
import { winningColumns } from '../engine/tactics';

export interface DiagRow {
  col: number;
  legal: boolean;
  winsNow: boolean;
  hand: number | null;
  linear: number | null;
  td: number | null;
  network: number | null;
  committee: number | null;
  solver: number | null;
  solverLabel: string;
}

export interface Diagnosis {
  moves: number[];
  mover: 1 | 2;
  rows: DiagRow[];
  solver: { ran: boolean; aborted: boolean; nodes: number; weak: boolean; ms: number };
  optimal: number[];
}

export function diagnose(moves: number[], evaluation: EvalWeights = DEFAULT_WEIGHTS, solverBudgetK = 3000, weak = false): Diagnosis {
  const board = Board.fromMoves(moves);
  const me = board.turn;
  const them = me === 1 ? 2 : 1;
  const wins = new Set(winningColumns(board, me));
  const rows: DiagRow[] = [];
  for (let c = 0; c < 7; c++) {
    const legal = board.canPlay(c) && !board.isOver();
    const row: DiagRow = { col: c, legal, winsNow: wins.has(c), hand: null, linear: null, td: null, network: null, committee: null, solver: null, solverLabel: '—' };
    if (legal && !row.winsNow) {
      board.play(c);
      row.hand = -handScore(board, them);
      row.linear = -linearScore(board, them);
      row.td = -tdScore(board, them, evaluation.tdWeights);
      row.network = -networkScore(board, them);
      row.committee = -committeeScore(board, them, evaluation.committee, evaluation.tdWeights);
      board.undo();
    }
    rows.push(row);
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let solver = { ran: false, aborted: false, nodes: 0, weak, ms: 0 };
  let optimal: number[] = [];
  if (!board.isOver()) {
    const res = solveColumns(moves, weak, solverBudgetK);
    solver = { ran: true, aborted: res.aborted, nodes: res.nodes, weak, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
    if (!res.aborted) {
      res.values.forEach((v, c) => {
        rows[c].solver = v;
        rows[c].solverLabel = valueLabel(v, moves.length, weak);
      });
      const vals = res.values.filter((v): v is number => v !== null);
      if (vals.length) {
        const best = Math.max(...vals);
        optimal = res.values.map((v, c) => (v !== null && Math.sign(v) === Math.sign(best) ? c : -1)).filter((c) => c >= 0);
      }
    }
  }
  return { moves, mover: me as 1 | 2, rows, solver, optimal };
}
