import { Board } from '../../engine/board';
import { ruleMove, ruleReason } from '../../engine/opponentRule';
import { SearchContext } from '../context';
import { emptyColumnScores } from '../scoring';
import type { Agent } from '../types';

const LABEL = { win: 'Wins now', block: 'Blocks a win', centre: 'Most central free' } as const;

export const ruleAgent: Agent = {
  id: 'rule',
  family: 'baseline',
  chooseMove: async (position, config) => {
    const board = Board.fromMoves(position.moves);
    const col = ruleMove(board);
    const why = ruleReason(board, col);
    const scores = emptyColumnScores();
    for (const c of board.legalMoves()) {
      const r = ruleReason(board, c);
      const rank = r === 'win' ? 100 : r === 'block' ? 50 : 0;
      scores[c] = { col: c, score: c === col ? rank + 1 : rank, proven: r === 'win' ? 'win' : null, provenIn: r === 'win' ? 1 : null, label: r === 'centre' ? (c === col ? LABEL.centre : '—') : LABEL[r] };
    }
    return {
      col,
      columnScores: scores,
      pv: [col],
      stats: new SearchContext().finishStats('done'),
      depthHistory: [],
      tree: null,
      randomised: false,
      reason: `Rule: ${why === 'win' ? 'it can win in this column' : why === 'block' ? 'it blocks the opponent’s immediate win' : 'no win or block, so the most central free column'}.`,
      seedUsed: config.common.seed ?? 0,
    };
  },
};
