export function wilson(k: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export type Side = 'red' | 'yellow';
export const otherSide = (s: Side): Side => (s === 'red' ? 'yellow' : 'red');

export interface SideMoveStats {
  moves: number;
  timeMs: number;
  nodes: number;
}

export interface GameRecord {
  index: number;
  step: number;
  starter: Side;
  winner: Side | 'draw';
  plies: number;
  moves: number[];
  openingPlies: number;
  sides: Record<Side, SideMoveStats>;
}

export interface SideSummary {
  wins: number;
  draws: number;
  losses: number;
  winRate: { p: number; lo: number; hi: number };
  avgTimeMs: number;
  avgNodes: number;
}

export interface Summary {
  games: number;
  avgLength: number;
  sides: Record<Side, SideSummary>;
}

export function summarise(games: GameRecord[]): Summary {
  const n = games.length;
  const side = (s: Side): SideSummary => {
    const wins = games.filter((g) => g.winner === s).length;
    const draws = games.filter((g) => g.winner === 'draw').length;
    const moves = games.reduce((a, g) => a + g.sides[s].moves, 0);
    return {
      wins,
      draws,
      losses: n - wins - draws,
      winRate: wilson(wins, n),
      avgTimeMs: moves ? games.reduce((a, g) => a + g.sides[s].timeMs, 0) / moves : 0,
      avgNodes: moves ? games.reduce((a, g) => a + g.sides[s].nodes, 0) / moves : 0,
    };
  };
  return {
    games: n,
    avgLength: n ? games.reduce((a, g) => a + g.plies, 0) / n : 0,
    sides: { red: side('red'), yellow: side('yellow') },
  };
}
