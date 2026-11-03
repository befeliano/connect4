import * as Comlink from 'comlink';
import type { AgentConfig, MoveDecision, Position, Telemetry } from '../agents/types';
import type { BenchRow } from '../agents/benchmark';
import type { Diagnosis } from '../agents/diagnose';
import type { EvalWeights } from '../engine/heuristics';
import type { AgentWorkerApi } from './agent.worker';

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

export class AgentWorker {
  private worker!: Worker;
  private api!: Comlink.Remote<AgentWorkerApi>;
  private flag: Int32Array | null = null;
  private reqId = 0;
  private pending: { id: number; reject: (e: unknown) => void } | null = null;

  constructor() {
    this.spawn();
  }

  private spawn(): void {
    this.worker = new Worker(new URL('./agent.worker.ts', import.meta.url), { type: 'module' });
    this.api = Comlink.wrap<AgentWorkerApi>(this.worker);
    if (typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated) {
      const sab = new SharedArrayBuffer(4);
      this.flag = new Int32Array(sab);
      void this.api.init(sab);
    } else {
      this.flag = null;
      void this.api.init(null);
    }
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  think(position: Position, config: AgentConfig, onTelemetry: (t: Telemetry) => void): Promise<MoveDecision> {
    this.cancel();
    const id = ++this.reqId;
    return new Promise<MoveDecision>((resolve, reject) => {
      this.pending = { id, reject };
      this.api
        .think(
          position,
          config,
          Comlink.proxy((t: Telemetry) => {
            if (id === this.reqId) onTelemetry(t);
          }),
        )
        .then(
          (d) => {
            if (id !== this.reqId) return;
            this.pending = null;
            resolve(d);
          },
          (e) => {
            if (id !== this.reqId) return;
            this.pending = null;
            reject(e);
          },
        );
    });
  }

  cancel(): void {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    this.reqId++;
    if (this.flag) {
      Atomics.store(this.flag, 0, 1);
    } else {
      this.worker.terminate();
      this.spawn();
    }
    p.reject(new CancelledError());
  }

  benchmark(): Promise<BenchRow[]> {
    return this.api.benchmark();
  }

  diagnose(moves: number[], evaluation: EvalWeights, solverBudgetK: number, weak: boolean): Promise<Diagnosis> {
    return this.api.diagnose(moves, evaluation, solverBudgetK, weak);
  }

  dispose(): void {
    this.cancel();
    this.worker.terminate();
  }
}

export const isCancelled = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';
