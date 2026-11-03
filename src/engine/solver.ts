import { SOLVER_WASM_B64 } from './solverWasm';

interface Exports {
  c4_init(): void;
  c4_clear_tt(): void;
  c4_reset(): void;
  c4_play(c: number): number;
  c4_set_budget_k(k: number): void;
  c4_nodes(): number;
  c4_aborted(): number;
  c4_solve(weak: number): number;
  c4_column(c: number, weak: number): number;
}

let X: Exports | null = null;

function decode(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Uint8Array((globalThis as any).Buffer.from(b64, 'base64'));
}

function exportsOf(): Exports {
  if (X) return X;
  const mod = new WebAssembly.Module(decode(SOLVER_WASM_B64) as BufferSource);
  const inst = new WebAssembly.Instance(mod, {});
  X = inst.exports as unknown as Exports;
  X.c4_init();
  X.c4_clear_tt();
  return X;
}

export interface SolverResult {
  values: (number | null)[];
  nodes: number;
  aborted: boolean;
  weak: boolean;
}

export type SolverOutcome = 'win' | 'draw' | 'loss';

export const outcomeOf = (v: number): SolverOutcome => (v > 0 ? 'win' : v < 0 ? 'loss' : 'draw');

export function movesToEnd(value: number, plies: number): number {
  if (value === 0) return 0;
  const u = Math.abs(value);
  const wantParity = value > 0 ? plies % 2 : (plies + 1) % 2;
  let p = 43 - 2 * u;
  if (p % 2 !== wantParity) p = 42 - 2 * u;
  return value > 0 ? (p - plies) / 2 + 1 : (p - plies + 1) / 2;
}

export function valueLabel(v: number | null, plies: number, weak: boolean): string {
  if (v === null) return '—';
  if (v === 0) return 'Draw';
  if (weak) return v > 0 ? 'Win' : 'Loss';
  const n = movesToEnd(v, plies);
  return v > 0 ? (n <= 1 ? 'Wins now' : `Win in ${n}`) : `Loses in ${n}`;
}

function setPosition(x: Exports, moves: readonly number[]): void {
  x.c4_reset();
  for (const c of moves) if (!x.c4_play(c)) throw new Error(`illegal move ${c + 1}`);
}

export function solveColumns(moves: readonly number[], weak: boolean, budgetK = 0): SolverResult {
  const x = exportsOf();
  const values: (number | null)[] = Array(7).fill(null);
  let nodes = 0;
  let aborted = false;
  for (const c of [3, 2, 4, 1, 5, 0, 6]) {
    setPosition(x, moves);
    const left = budgetK > 0 ? Math.max(1, budgetK - Math.floor(nodes / 1000)) : 0;
    x.c4_set_budget_k(left);
    const v = x.c4_column(c, weak ? 1 : 0);
    nodes += x.c4_nodes();
    if (v === 127) continue;
    if (x.c4_aborted()) {
      aborted = true;
      break;
    }
    values[c] = v;
  }
  return { values, nodes, aborted, weak };
}

export function solvePosition(moves: readonly number[], weak: boolean, budgetK = 0): { value: number | null; nodes: number } {
  const x = exportsOf();
  setPosition(x, moves);
  x.c4_set_budget_k(budgetK);
  const v = x.c4_solve(weak ? 1 : 0);
  return { value: x.c4_aborted() ? null : v, nodes: x.c4_nodes() };
}

export function clearSolverCache(): void {
  exportsOf().c4_clear_tt();
}
