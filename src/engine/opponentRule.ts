import type { Board } from './board';
import { CENTRE_ORDER } from './lines';

export function ruleMove(board: Board): number {
  const me = board.turn;
  const them = me === 1 ? 2 : 1;
  for (const c of CENTRE_ORDER) if (board.wouldWin(c, me)) return c;
  for (const c of CENTRE_ORDER) if (board.wouldWin(c, them)) return c;
  for (const c of CENTRE_ORDER) if (board.canPlay(c)) return c;
  return -1;
}

export type RuleReason = 'win' | 'block' | 'centre';

export function ruleReason(board: Board, col: number): RuleReason {
  const me = board.turn;
  if (board.wouldWin(col, me)) return 'win';
  if (board.wouldWin(col, me === 1 ? 2 : 1)) return 'block';
  return 'centre';
}
