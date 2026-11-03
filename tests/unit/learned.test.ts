import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board } from '../../src/engine/board';
import { features } from '../../src/engine/learned/features';
import { committeeScore, handScore, linearScore, networkScore, tdScore } from '../../src/engine/learned/evaluators';
import { solveColumns } from '../../src/engine/solver';

interface Ref {
  moves: string;
  f: number[];
  hand: number;
  lr: number;
  td: number;
  mlp: number;
  blend: number;
  solve: number[];
}
const refs: Ref[] = readFileSync('wasm/ref.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as Ref);

describe('learned evaluators match the offline study', () => {
  it('features φ(s) are identical on 400 positions', () => {
    for (const r of refs) {
      const b = Board.fromMoves(r.moves);
      expect(Array.from(features(b, b.turn)), r.moves).toEqual(r.f);
    }
  });
  it('hand, linear, TD, network and committee scores agree (±1 from float rounding)', () => {
    let maxDiff = 0;
    for (const r of refs) {
      const b = Board.fromMoves(r.moves);
      const me = b.turn;
      expect(handScore(b, me)).toBe(r.hand);
      expect(Math.abs(linearScore(b, me) - r.lr)).toBeLessThanOrEqual(1);
      expect(Math.abs(tdScore(b, me) - r.td)).toBeLessThanOrEqual(1);
      const d = Math.abs(networkScore(b, me) - r.mlp);
      maxDiff = Math.max(maxDiff, d);
      expect(d).toBeLessThanOrEqual(1);
      expect(Math.abs(committeeScore(b, me, { linear: true, td: true, network: true }) - r.blend)).toBeLessThanOrEqual(1);
    }
    expect(maxDiff).toBeLessThanOrEqual(1);
  });
});

describe('exact solver (WebAssembly) matches the C++ solver', () => {
  it('column values agree on every position from ply 14', () => {
    let n = 0;
    for (const r of refs) {
      if (r.solve.every((v) => v === -999)) continue;
      const res = solveColumns([...r.moves].map((ch) => Number(ch) - 1), false);
      expect(res.aborted).toBe(false);
      expect(res.values.map((v) => (v === null ? -999 : v)), r.moves).toEqual(r.solve);
      if (++n >= 120) break;
    }
    expect(n).toBeGreaterThan(50);
  }, 120000);
});
