import {
  emptyStats,
  type CancelSignal,
  type ColumnScore,
  type DepthPoint,
  type RecordTree,
  type SearchStats,
  type SearchTree,
  type Telemetry,
  type TreeNodeRec,
  type AgentStatus,
} from './types';

export class StopSearch extends Error {
  constructor(readonly reason: 'time' | 'budget' | 'abort') {
    super(`search stopped: ${reason}`);
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const TREE_LIMIT: Record<RecordTree, number> = { off: 0, sampled: 1500, full: 20000 };
const SAMPLED_MAX_DEPTH = 4;

export class TreeRecorder {
  nodes: TreeNodeRec[] = [];
  truncated = false;
  private order = 0;
  constructor(readonly mode: RecordTree) {}

  get enabled(): boolean {
    return this.mode !== 'off';
  }

  reset(): void {
    this.nodes = [];
    this.truncated = false;
    this.order = 0;
  }

  add(parent: number, col: number, depth: number, kind: TreeNodeRec['kind'], value: number | null = null): number {
    if (this.mode === 'off' || parent === -2) return -2;
    if (this.nodes.length >= TREE_LIMIT[this.mode] || (this.mode === 'sampled' && depth > SAMPLED_MAX_DEPTH)) {
      this.truncated = true;
      return -2;
    }
    const id = this.nodes.length;
    this.nodes.push({ id, parent, col, depth, order: this.order++, value, kind });
    return id;
  }

  set(id: number, value: number | null, kind?: TreeNodeRec['kind'], label?: string): void {
    if (id < 0) return;
    const n = this.nodes[id];
    n.value = value;
    if (kind) n.kind = kind;
    if (label) n.label = label;
  }

  result(): SearchTree | null {
    if (this.mode === 'off') return null;
    return { nodes: this.nodes, truncated: this.truncated, mode: this.mode };
  }
}

export interface ContextOptions {
  signal?: CancelSignal;
  timeLimitMs?: number;
  nodeBudget?: number;
  telemetryHz?: number;
  onTelemetry?: (t: Telemetry) => void;
  recordTree?: RecordTree;
}

export class SearchContext {
  readonly stats: SearchStats = emptyStats();
  readonly tree: TreeRecorder;
  readonly start = now();
  status: AgentStatus = 'thinking';
  columnScores: ColumnScore[] | null = null;
  pv: number[] = [];
  bestCol: number | null = null;
  depthHistory: DepthPoint[] = [];
  extra: Partial<Telemetry> = {};
  private readonly deadline: number;
  private readonly budget: number;
  private readonly interval: number;
  private lastEmit: number;
  private readonly signal?: CancelSignal;
  private readonly onTelemetry?: (t: Telemetry) => void;

  constructor(o: ContextOptions = {}) {
    this.deadline = o.timeLimitMs != null && Number.isFinite(o.timeLimitMs) ? this.start + o.timeLimitMs : Infinity;
    this.budget = o.nodeBudget ?? Infinity;
    this.interval = 1000 / Math.max(1, Math.min(30, o.telemetryHz ?? 10));
    this.lastEmit = this.start;
    this.signal = o.signal;
    this.onTelemetry = o.onTelemetry;
    this.tree = new TreeRecorder(o.recordTree ?? 'off');
  }

  expand(): void {
    const n = ++this.stats.expanded;
    if (n > this.budget) throw new StopSearch('budget');
    if ((n & 255) === 0) this.check();
  }

  check(): void {
    if (this.signal?.aborted) throw new StopSearch('abort');
    const t = now();
    if (t >= this.deadline) throw new StopSearch('time');
    if (this.onTelemetry && t - this.lastEmit >= this.interval) {
      this.lastEmit = t;
      this.onTelemetry(this.telemetry());
    }
  }

  get timeLeft(): number {
    return this.deadline - now();
  }

  get outOfTime(): boolean {
    return now() >= this.deadline;
  }

  peak(memory: number): void {
    if (memory > this.stats.memoryPeak) this.stats.memoryPeak = memory;
  }

  finishStats(stopReason: SearchStats['stopReason']): SearchStats {
    const s = this.stats;
    s.elapsedMs = now() - this.start;
    s.nodesPerSec = s.elapsedMs > 0 ? Math.round((s.expanded * 1000) / s.elapsedMs) : 0;
    s.stopReason = stopReason;
    return { ...s };
  }

  telemetry(): Telemetry {
    const s = this.stats;
    s.elapsedMs = now() - this.start;
    s.nodesPerSec = s.elapsedMs > 0 ? Math.round((s.expanded * 1000) / s.elapsedMs) : 0;
    return {
      status: this.status,
      stats: { ...s },
      columnScores: this.columnScores ? this.columnScores.map((c) => ({ ...c })) : null,
      pv: [...this.pv],
      bestCol: this.bestCol,
      depthHistory: [...this.depthHistory],
      ...this.extra,
    };
  }

  emitNow(): void {
    if (this.onTelemetry) {
      this.lastEmit = now();
      this.onTelemetry(this.telemetry());
    }
  }
}
