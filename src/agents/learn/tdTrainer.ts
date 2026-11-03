import { Board } from '../../engine/board';
import { CENTRE_ORDER, SIZE } from '../../engine/lines';
import { FS, NF, features } from '../../engine/learned/features';
import { handScore } from '../../engine/learned/evaluators';
import { nonLosingColumns, winningColumns } from '../../engine/tactics';
import { mulberry32, randInt, type Rng } from '../../engine/rng';

export interface TDParams {
  alpha: number;
  lambda: number;
  epsilon: number;
  episodes: number;
  seed: number;
  init: 'zero' | 'trained';
  evalEvery: number;
  evalGames: number;
  evalDepth: number;
}

export const DEFAULT_TD: TDParams = { alpha: 0.003, lambda: 0.7, epsilon: 0.1, episodes: 3000, seed: 5, init: 'zero', evalEvery: 1000, evalGames: 40, evalDepth: 4 };
export const BEST_TD: TDParams = { alpha: 0.003, lambda: 0.7, epsilon: 0.1, episodes: 30000, seed: 5, init: 'zero', evalEvery: 2500, evalGames: 40, evalDepth: 4 };

export interface TDProgress {
  episode: number;
  weights: number[];
  curve: { episode: number; score: number; w: number; d: number; l: number }[];
  done: boolean;
  msPerGame: number;
  best: { episode: number; score: number; weights: number[] } | null;
}

const phi = new Float64Array(NF);

export class TDTrainer {
  readonly w: Float64Array;
  private readonly rng: Rng;
  constructor(
    readonly p: TDParams,
    init?: readonly number[],
  ) {
    this.w = new Float64Array(NF);
    if (init) this.w.set(init);
    this.rng = mulberry32(p.seed);
  }

  private value(board: Board, f: Float64Array): number {
    features(board, board.turn, f);
    let z = 0;
    for (let i = 0; i < NF; i++) z += (this.w[i] * f[i]) / FS[i];
    return Math.tanh(z);
  }

  episode(): void {
    const { alpha, lambda, epsilon } = this.p;
    const w = this.w;
    const b = new Board();
    const e = new Float64Array(NF);
    const prevGrad = new Float64Array(NF);
    const f = new Float64Array(NF);
    let prevU = 0;
    let have = false;
    const finish = (z: number) => {
      const delta = z - prevU;
      for (let i = 0; i < NF; i++) {
        e[i] = lambda * e[i] + prevGrad[i];
        w[i] += alpha * delta * e[i];
      }
    };
    for (;;) {
      const sg = b.count % 2 === 0 ? 1 : -1;
      const v = this.value(b, f);
      const u = sg * v;
      if (have) {
        const delta = u - prevU;
        for (let i = 0; i < NF; i++) {
          e[i] = lambda * e[i] + prevGrad[i];
          w[i] += alpha * delta * e[i];
        }
      }
      const g = sg * (1 - v * v);
      for (let i = 0; i < NF; i++) prevGrad[i] = (g * f[i]) / FS[i];
      prevU = u;
      have = true;
      if (b.count >= SIZE) return finish(0);
      if (winningColumns(b, b.turn).length) return finish(sg);
      const nl = nonLosingColumns(b);
      const pool = nl.length ? nl : b.legalMoves();
      let c: number;
      if (this.rng() < epsilon) c = pool[randInt(this.rng, pool.length)];
      else {
        let best = -Infinity;
        c = pool[0];
        for (const m of pool) {
          b.play(m);
          const vq = -this.value(b, phi);
          b.undo();
          if (vq > best + 1e-12) {
            best = vq;
            c = m;
          } else if (Math.abs(vq - best) <= 1e-12 && this.rng() < 0.5) c = m;
        }
      }
      b.play(c);
    }
  }
}

type Score = (b: Board, me: number) => number;

function tdEval(w: readonly number[]): Score {
  const f = new Float64Array(NF);
  return (b, me) => {
    features(b, me, f);
    let z = 0;
    for (let i = 0; i < NF; i++) z += (w[i] * f[i]) / FS[i];
    return Math.trunc(1000 * Math.tanh(z));
  };
}

const WIN = 100000;

function negamax(b: Board, depth: number, alpha: number, beta: number, ev: Score): number {
  if (depth === 0) return ev(b, b.turn);
  let best = -Infinity;
  for (const c of CENTRE_ORDER) {
    if (!b.canPlay(c)) continue;
    let v: number;
    if (b.play(c)) v = WIN - b.count;
    else if (b.count === SIZE) v = 0;
    else v = -negamax(b, depth - 1, -beta, -alpha, ev);
    b.undo();
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function pickMove(b: Board, depth: number, ev: Score): number {
  let best = -Infinity;
  let col = -1;
  for (const c of CENTRE_ORDER) {
    if (!b.canPlay(c)) continue;
    let v: number;
    if (b.play(c)) v = WIN;
    else if (b.count === SIZE) v = 0;
    else v = -negamax(b, depth - 1, -Infinity, Infinity, ev);
    b.undo();
    if (v > best) {
      best = v;
      col = c;
    }
  }
  return col;
}

export function strengthVsHand(w: readonly number[], depth: number, games: number, seed: number): { score: number; w: number; d: number; l: number } {
  const rng = mulberry32(seed);
  const A = tdEval(w);
  const H: Score = (b, me) => handScore(b, me);
  let W = 0,
    D = 0,
    L = 0;
  for (let g = 0; g < games; g++) {
    const b = new Board();
    for (let k = 0; k < 2; k++) b.play(randInt(rng, 7));
    const tdIs = g % 2 === 0 ? 1 : 2;
    let result = 0;
    for (;;) {
      const mover = b.turn;
      const c = pickMove(b, depth, mover === tdIs ? A : H);
      if (b.play(c)) {
        result = mover === tdIs ? 1 : -1;
        break;
      }
      if (b.count === SIZE) break;
    }
    if (result > 0) W++;
    else if (result < 0) L++;
    else D++;
  }
  return { score: (W + D / 2) / games, w: W, d: D, l: L };
}
