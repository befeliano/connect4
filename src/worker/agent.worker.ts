/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { runAgent } from '../agents/registry';
import { runBenchmark, type BenchRow } from '../agents/benchmark';
import type { AgentConfig, MoveDecision, Position, Telemetry } from '../agents/types';
import { diagnose, type Diagnosis } from '../agents/diagnose';
import type { EvalWeights } from '../engine/heuristics';

let flag: Int32Array | null = null;
let generation = 0;

const api = {
  init(buffer: SharedArrayBuffer | null): void {
    flag = buffer ? new Int32Array(buffer) : null;
  },

  async think(position: Position, config: AgentConfig, onTelemetry: (t: Telemetry) => void): Promise<MoveDecision> {
    const gen = ++generation;
    if (flag) Atomics.store(flag, 0, 0);
    const signal = {
      get aborted(): boolean {
        return gen !== generation || (flag !== null && Atomics.load(flag, 0) === 1);
      },
    };
    return runAgent(position, config, (t) => void onTelemetry(t), signal);
  },

  cancel(): void {
    generation++;
  },

  benchmark(): Promise<BenchRow[]> {
    return runBenchmark();
  },

  diagnose(moves: number[], evaluation: EvalWeights, solverBudgetK: number, weak: boolean): Diagnosis {
    return diagnose(moves, evaluation, solverBudgetK, weak);
  },
};

export type AgentWorkerApi = typeof api;

Comlink.expose(api);
