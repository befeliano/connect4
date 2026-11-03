import { WIN } from '../engine/heuristics';
import { COLS } from '../engine/lines';
import type { ColumnScore, ProvenResult } from './types';

export const PROVEN = WIN - 1000;

export const isProvenWin = (s: number): boolean => s >= PROVEN;
export const isProvenLoss = (s: number): boolean => s <= -PROVEN;

export function describeScore(col: number, score: number, preferFasterWins: boolean): ColumnScore {
  let proven: ProvenResult = null;
  let provenIn: number | null = null;
  let label: string;
  if (isProvenWin(score)) {
    proven = 'win';
    if (preferFasterWins) {
      provenIn = Math.ceil((WIN - score) / 2);
      label = provenIn <= 1 ? 'Wins now' : `Win in ${provenIn}`;
    } else label = 'Win (proven)';
  } else if (isProvenLoss(score)) {
    proven = 'loss';
    if (preferFasterWins) {
      provenIn = Math.ceil((WIN + score) / 2);
      label = `Loses in ${provenIn}`;
    } else label = 'Loss (proven)';
  } else {
    const r = Math.round(score * 10) / 10;
    label = r > 0 ? `+${r}` : `${r}`;
  }
  return { col, score, proven, provenIn, label };
}

export function emptyColumnScores(): ColumnScore[] {
  return Array.from({ length: COLS }, (_, col) => ({ col, score: null, proven: null, provenIn: null, label: '—' }));
}

export function rankValue(c: ColumnScore): number {
  if (c.score === null) return -Infinity;
  return Math.max(-1000, Math.min(1000, c.score));
}
