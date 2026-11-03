import type { Board } from '../board';
import { COLS, ROWS } from '../lines';
import { FS, NF, features } from './features';
import { LR_PHI, MLP_B64, MLP_SIZES, TD_TRAINED } from './weights';

const phi = new Float64Array(NF);

export function handScore(board: Board, me: number): number {
  const f = features(board, me, phi);
  return Math.trunc(10 * (2 * f[0] + 5 * f[1] - 1.2 * 2 * f[2] - 1.2 * 5 * f[3] + 3 * f[4] - 1.2 * 3 * f[5]));
}

export function linearProbs(board: Board, me: number): [number, number, number] {
  const f = features(board, me, phi);
  const z = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const row = LR_PHI[k];
    let s = row[NF];
    for (let i = 0; i < NF; i++) s += (row[i] * f[i]) / FS[i];
    z[k] = s;
  }
  return softmax3(z[0], z[1], z[2]);
}

export function linearScore(board: Board, me: number): number {
  const p = linearProbs(board, me);
  return Math.trunc(1000 * (p[2] - p[0]));
}

export function tdValue(board: Board, me: number, w: readonly number[] = TD_TRAINED): number {
  const f = features(board, me, phi);
  let z = 0;
  for (let i = 0; i < NF; i++) z += (w[i] * f[i]) / FS[i];
  return Math.tanh(z);
}

export function tdScore(board: Board, me: number, w: readonly number[] = TD_TRAINED): number {
  return Math.trunc(1000 * tdValue(board, me, w));
}

interface Net {
  sizes: number[];
  w: Float32Array[];
  b: Float32Array[];
}

let net: Net | null = null;

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Uint8Array((globalThis as any).Buffer.from(b64, 'base64'));
}

function loadNet(): Net {
  if (net) return net;
  const bytes = decodeBase64(MLP_B64);
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const sizes = MLP_SIZES;
  const w: Float32Array[] = [];
  const b: Float32Array[] = [];
  let o = 0;
  for (let l = 0; l + 1 < sizes.length; l++) {
    const n = sizes[l] * sizes[l + 1];
    w.push(all.slice(o, o + n));
    o += n;
    b.push(all.slice(o, o + sizes[l + 1]));
    o += sizes[l + 1];
  }
  net = { sizes, w, b };
  return net;
}

let bufA = new Float32Array(256);
let bufB = new Float32Array(256);

export function networkProbs(board: Board, me: number): [number, number, number] {
  const N = loadNet();
  const sz = N.sizes;
  const h1 = sz[1];
  if (bufA.length < Math.max(...sz)) {
    bufA = new Float32Array(Math.max(...sz));
    bufB = new Float32Array(Math.max(...sz));
  }
  let a = bufA;
  let b = bufB;
  a.set(N.b[0].subarray(0, h1));
  const cells = board.cells;
  const them = me === 1 ? 2 : 1;
  const W0 = N.w[0];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = cells[r * COLS + c];
      if (!v) continue;
      const idx = c * ROWS + r;
      const input = v === me ? idx : v === them ? 42 + idx : -1;
      if (input < 0) continue;
      const base = input * h1;
      for (let j = 0; j < h1; j++) a[j] += W0[base + j];
    }
  }
  if (sz[0] === 97) {
    const f = features(board, me, phi);
    for (let k = 0; k < NF; k++) {
      const x = Math.fround(f[k] / FS[k]);
      if (x === 0) continue;
      const base = (84 + k) * h1;
      for (let j = 0; j < h1; j++) a[j] += Math.fround(x * W0[base + j]);
    }
  }
  for (let l = 1; l < sz.length - 1; l++) {
    const nIn = sz[l];
    const nOut = sz[l + 1];
    for (let i = 0; i < nIn; i++) if (a[i] < 0) a[i] = 0;
    b.set(N.b[l].subarray(0, nOut));
    const Wl = N.w[l];
    for (let i = 0; i < nIn; i++) {
      const xi = a[i];
      if (xi === 0) continue;
      const base = i * nOut;
      for (let j = 0; j < nOut; j++) b[j] += Math.fround(xi * Wl[base + j]);
    }
    const t = a;
    a = b;
    b = t;
  }
  return softmax3(a[0], a[1], a[2]);
}

export function networkScore(board: Board, me: number): number {
  const p = networkProbs(board, me);
  return Math.trunc(1000 * (p[2] - p[0]));
}

export function networkCost(): number {
  const s = MLP_SIZES;
  let n = 0;
  for (let l = 0; l + 1 < s.length; l++) n += s[l] * s[l + 1];
  return n;
}

export interface CommitteeMembers {
  linear: boolean;
  td: boolean;
  network: boolean;
}

export function committeeScore(board: Board, me: number, m: CommitteeMembers, tdW: readonly number[] = TD_TRAINED): number {
  let total = 0;
  let n = 0;
  if (m.linear) {
    total += linearScore(board, me);
    n++;
  }
  if (m.td) {
    total += tdScore(board, me, tdW);
    n++;
  }
  if (m.network) {
    total += networkScore(board, me);
    n++;
  }
  if (!n) return linearScore(board, me);
  return Math.trunc(total / n);
}

function softmax3(z0: number, z1: number, z2: number): [number, number, number] {
  const m = Math.max(z0, z1, z2);
  const e0 = Math.exp(z0 - m);
  const e1 = Math.exp(z1 - m);
  const e2 = Math.exp(z2 - m);
  const s = e0 + e1 + e2;
  return [e0 / s, e1 / s, e2 / s];
}

export { TD_TRAINED };
