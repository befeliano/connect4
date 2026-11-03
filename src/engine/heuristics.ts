import type { Board } from './board';
import { LINES, LINE_COUNT, COLS, ROWS } from './lines';
import { committeeScore, linearScore, networkScore, tdScore, TD_TRAINED, type CommitteeMembers } from './learned/evaluators';

export function hCost(board: Board, us: number): number {
  const cells = board.cells;
  let best = -1;
  for (let l = 0; l < LINE_COUNT; l++) {
    const b = l * 4;
    let mine = 0;
    let blocked = false;
    for (let k = 0; k < 4; k++) {
      const v = cells[LINES[b + k]];
      if (v === us) mine++;
      else if (v !== 0) {
        blocked = true;
        break;
      }
    }
    if (!blocked && mine > best) {
      best = mine;
      if (best === 4) break;
    }
  }
  return best < 0 ? Infinity : 4 - best;
}

export type EvaluationKind = 'weighted' | 'ourH' | 'linear' | 'td' | 'network' | 'committee';
export const LEARNED_KINDS: readonly EvaluationKind[] = ['linear', 'td', 'network', 'committee'];

export interface EvalWeights {
  kind: EvaluationKind;
  w2: number;
  w3: number;
  centreBonus: number;
  defenceMultiplier: number;
  tdWeights: number[];
  committee: CommitteeMembers;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  kind: 'weighted',
  w2: 2,
  w3: 5,
  centreBonus: 3,
  defenceMultiplier: 1.2,
  tdWeights: [...TD_TRAINED],
  committee: { linear: true, td: true, network: true },
};

export const WIN = 100_000;

export function evaluate(board: Board, me: number, w: EvalWeights): number {
  switch (w.kind) {
    case 'linear':
      return linearScore(board, me);
    case 'td':
      return tdScore(board, me, w.tdWeights ?? TD_TRAINED);
    case 'network':
      return networkScore(board, me);
    case 'committee':
      return committeeScore(board, me, w.committee ?? DEFAULT_WEIGHTS.committee, w.tdWeights ?? TD_TRAINED);
    default:
      break;
  }
  const them = me === 1 ? 2 : 1;
  if (w.kind === 'ourH') {
    const hm = hCost(board, me);
    const ht = hCost(board, them);
    return -(hm === Infinity ? 5 : hm) + (ht === Infinity ? 5 : ht);
  }
  const cells = board.cells;
  let mine = 0;
  let theirs = 0;
  for (let l = 0; l < LINE_COUNT; l++) {
    const b = l * 4;
    let a = 0;
    let o = 0;
    for (let k = 0; k < 4; k++) {
      const v = cells[LINES[b + k]];
      if (v === me) a++;
      else if (v === them) o++;
    }
    if (o === 0) {
      if (a === 2) mine += w.w2;
      else if (a === 3) mine += w.w3;
    } else if (a === 0) {
      if (o === 2) theirs += w.w2;
      else if (o === 3) theirs += w.w3;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    const v = cells[r * COLS + 3];
    if (v === me) mine += w.centreBonus;
    else if (v === them) theirs += w.centreBonus;
  }
  return mine - w.defenceMultiplier * theirs;
}
