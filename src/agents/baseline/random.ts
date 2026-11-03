import { Board } from '../../engine/board';
import { mulberry32, randInt } from '../../engine/rng';
import { SearchContext } from '../context';
import { emptyColumnScores } from '../scoring';
import type { Agent } from '../types';

export const randomAgent: Agent = {
  id: 'random',
  family: 'baseline',
  chooseMove: async (position, config) => {
    const board = Board.fromMoves(position.moves);
    const legal = board.legalMoves();
    const seed = config.common.seed ?? 1;
    const col = legal[randInt(mulberry32(seed + position.moves.length * 7919), legal.length)];
    const scores = emptyColumnScores();
    for (const c of legal) scores[c] = { col: c, score: 0, proven: null, provenIn: null, label: `1/${legal.length}` };
    const ctx = new SearchContext();
    return {
      col,
      columnScores: scores,
      pv: [col],
      stats: ctx.finishStats('done'),
      depthHistory: [],
      tree: null,
      randomised: true,
      reason: `Random: picked uniformly among ${legal.length} legal columns.`,
      seedUsed: seed,
    };
  },
};
