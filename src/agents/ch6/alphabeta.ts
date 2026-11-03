import type { Agent } from '../types';
import { runNegamax } from './minimax';

export const alphaBetaAgent: Agent = {
  id: 'alphabeta',
  family: 'ch6',
  chooseMove: async (position, config, onTelemetry, signal) => runNegamax('alphabeta', position, config, onTelemetry, signal),
};
