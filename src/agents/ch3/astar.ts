import type { Board } from '../../engine/board';
import { bestFirst } from './bestFirst';
import type { Ch3Options, Ch3Result } from './common';

export const astar = (root: Board, o: Ch3Options): Ch3Result => bestFirst(root, o, (g, h) => g + h);
