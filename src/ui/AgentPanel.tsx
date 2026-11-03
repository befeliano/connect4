import { useEffect, useMemo, useState } from 'react';
import { ALGORITHM_NAMES } from '../agents/registry';
import { familyOf, type ColumnScore, type SearchStats } from '../agents/types';
import { useGame, type SeatId } from '../state/gameStore';
import { getWorker } from '../state/controller';
import { t } from '../i18n/en';
import { useCountUp } from './useCountUp';
import { NodesChart, DepthChart, VisitsChart } from './Charts';
import { explainMove } from './explain';
import { download, toCsv } from './download';
import { TreeView } from './TreeView';
import type { BenchRow } from '../agents/benchmark';
import { useUi } from '../state/uiStore';
import { DecisionCard, DiagnosisSection } from './FinalPanels';

const fmtInt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');
const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

function Counter({ label, value, format = fmtInt, trend }: { label: string; value: number; format?: (n: number) => string; trend?: Trend | null }) {
  const v = useCountUp(value);
  return (
    <div className="min-w-0 px-2 py-1.5" style={{ borderLeft: '2px solid rgba(196,166,255,0.35)' }}>
      <div className="label truncate">{label}</div>
      <div className="mono truncate text-[17px] font-bold leading-tight">{format(v)}</div>
      {trend && (
        <div className="mt-0.5 flex items-center gap-1">
          <span className={`sector ${trend}`} style={{ width: 18 }} aria-hidden />
          <span className="text-[10px] uppercase tracking-wider" style={{ color: '#bfaee0' }}>
            {t.panel.trend[trend]}
          </span>
        </div>
      )}
    </div>
  );
}

type Trend = 'best' | 'improved' | 'slower';

function useTrend(seat: SeatId): Trend | null {
  const log = useGame((s) => s.log);
  return useMemo(() => {
    const mine = log.filter((e) => e.player === seat && e.by === 'agent' && e.nodes && e.timeMs > 0).map((e) => (e.nodes as number) / e.timeMs);
    if (mine.length < 2) return null;
    const last = mine[mine.length - 1];
    const prev = mine[mine.length - 2];
    if (last >= Math.max(...mine)) return 'best';
    return last >= prev ? 'improved' : 'slower';
  }, [log, seat]);
}

export function ScoreBars({ scores, best }: { scores: ColumnScore[]; best: number | null }) {
  const vals = scores.map((s) => (s.score === null ? 0 : Math.max(-1000, Math.min(1000, s.score))));
  const max = Math.max(1, ...vals.map(Math.abs));
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label={t.panel.columnScores}>
      {scores.map((s, i) => {
        const v = vals[i];
        const h = s.score === null ? 0 : Math.max(4, (Math.abs(v) / max) * 46);
        const tone = s.proven === 'win' ? 'var(--good)' : s.proven === 'loss' ? 'var(--bad)' : 'var(--accent)';
        return (
          <li key={s.col} className="flex min-w-0 flex-col items-center" aria-label={`Column ${s.col + 1}: ${s.label}`}>
            <div className="relative flex h-[100px] w-full flex-col items-center justify-center" style={{ background: 'rgba(196,166,255,0.06)' }}>
              <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'var(--line)' }} />
              <div
                className="absolute w-3/5"
                style={{
                  background: tone,
                  height: h,
                  borderRadius: v >= 0 ? '4px 4px 0 0' : '0 0 4px 4px',
                  bottom: v >= 0 ? '50%' : undefined,
                  top: v < 0 ? '50%' : undefined,
                  outline: best === s.col ? '2px solid var(--text)' : undefined,
                  outlineOffset: 2,
                }}
              />
            </div>
            <span className="mono mt-1 text-[12px] font-bold">{s.col + 1}</span>
            <span className="text-center text-[10px] leading-tight" style={{ color: s.proven === 'win' ? 'var(--good)' : s.proven === 'loss' ? 'var(--bad)' : 'var(--text-dim)', wordBreak: 'break-word' }}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function liveNumbers(stats: SearchStats, alg: string, timeLimit: number): { label: string; value: number; format?: (n: number) => string }[] {
  const fam = familyOf(alg as never);
  const rows: { label: string; value: number; format?: (n: number) => string }[] = [
    { label: t.panel.expanded, value: stats.expanded },
    { label: t.panel.generated, value: stats.generated },
    { label: t.panel.nps, value: stats.nodesPerSec },
  ];
  if (fam === 'ch3') {
    rows.push({ label: alg === 'idastar' ? t.panel.fLimit : alg === 'ids' ? t.panel.depthLimit : t.panel.depth, value: (alg === 'idastar' || alg === 'ids') && stats.fLimit !== null ? stats.fLimit : stats.depth });
    rows.push({ label: t.panel.frontier, value: stats.frontier }, { label: t.panel.reached, value: stats.reached }, { label: t.panel.memory, value: stats.memoryPeak });
  } else if (alg === 'mcts') {
    rows.push({ label: t.panel.iterations, value: stats.iterations }, { label: t.panel.treeSize, value: stats.treeSize });
  } else if (alg === 'minimax' || alg === 'alphabeta') {
    rows.push({ label: t.panel.depth, value: stats.depth });
    if (alg === 'alphabeta') {
      rows.push(
        { label: t.panel.depthCompleted, value: stats.depthCompleted },
        { label: t.panel.cutoffs, value: stats.cutoffs },
        { label: t.panel.pruneRatio, value: stats.pruned + stats.generated > 0 ? (100 * stats.pruned) / (stats.pruned + stats.generated) : 0, format: (n) => `${n.toFixed(0)}%` },
        { label: t.panel.ttHits, value: stats.ttHits },
        { label: t.panel.ttStores, value: stats.ttStores },
      );
    }
  }
  rows.push({ label: t.panel.elapsed, value: stats.elapsedMs, format: fmtMs });
  if (Number.isFinite(timeLimit)) rows.push({ label: t.panel.remaining, value: Math.max(0, timeLimit - stats.elapsedMs), format: fmtMs });
  return rows;
}

function Timer({ running, startedAt, elapsed }: { running: boolean; startedAt: number; elapsed: number }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const ms = running ? now - startedAt : elapsed;
  return <span className="mono text-[15px] font-bold">{(ms / 1000).toFixed(1)}s</span>;
}

export function AgentPanel({ showTree = true }: { showTree?: boolean }) {
  const seats = useGame((s) => s.seats);
  const focus = useGame((s) => s.focusSeat);
  const agentSeats = ([1, 2] as SeatId[]).filter((id) => seats[id].kind === 'agent');
  const seat: SeatId | null = agentSeats.includes(focus) ? focus : (agentSeats[0] ?? null);
  const rt = useGame((s) => (seat ? s.runtime[seat] : null));
  const log = useGame((s) => s.log);
  const trend = useTrend(seat ?? 2);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const [benching, setBenching] = useState(false);
  const dev = useUi((s) => s.devMode);
  useEffect(() => setExplanation(null), [rt?.decision]);

  if (!seat || !rt) {
    return (
      <div className="section">
        <h2 className="section-title speed">{t.panel.title}</h2>
        <p style={{ color: 'var(--text-dim)' }}>No agent is playing. Choose Human vs Agent or Agent vs Agent in Controls.</p>
        <MoveLog />
      </div>
    );
  }
  const config = seats[seat].config;
  const alg = config.algorithm;
  const fam = familyOf(alg);
  const tel = rt.telemetry;
  const stats = tel?.stats;
  const status = rt.status;
  const scores = tel?.columnScores ?? rt.decision?.columnScores ?? null;
  const pv = tel?.pv ?? [];
  const running = status === 'thinking' || status === 'replanning';
  const deviated = rt.decision?.deviated || status === 'replanning';

  return (
    <div>
      <section className="section timing" aria-label={t.panel.title}>
        <div className="flex items-center gap-2">
          {agentSeats.length > 1 && (
            <div className="seg mr-1">
              {agentSeats.map((s) => (
                <button key={s} className="btn sm" aria-pressed={s === seat} onClick={() => useGame.setState({ focusSeat: s })}>
                  {t.players[s]}
                </button>
              ))}
            </div>
          )}
          <span className="pill" style={{ color: fam === 'ch3' ? 'var(--sector-slower)' : fam === 'ch6' ? '#c4a6ff' : fam === 'final' ? 'var(--mint)' : '#cbbbe6' }}>
            <span>{t.chapter[fam]}</span>
          </span>
          <h2 className="display m-0 truncate text-[19px]">{ALGORITHM_NAMES[alg]}</h2>
          <span className="ml-auto">
            <Timer running={running} startedAt={rt.startedAt} elapsed={stats?.elapsedMs ?? 0} />
          </span>
        </div>
        <p className="mt-1 mb-2 text-[13px]" style={{ color: '#cbbbe6', fontFamily: 'var(--font-body)' }}>
          {t.algorithms[alg]}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill ${status === 'replanning' ? 'replanning' : running ? 'thinking' : 'done'}`} role="status">
            <span className="dot" />
            <span>{status === 'idle' ? t.status.idle : t.status[status]}</span>
          </span>
          <span className="text-[12px]" style={{ color: '#cbbbe6' }}>
            {t.panel.seat}: {t.players[seat]} · {seats[seat].name}
          </span>
        </div>
        {deviated && fam === 'ch3' && (
          <div className="mt-2 px-2 py-1 text-[13px] font-bold" style={{ background: 'rgba(255,176,32,0.15)', color: '#ffcf70', borderLeft: '3px solid #ffb020' }} role="alert">
            {t.panel.leftModel}
          </div>
        )}
      </section>

      <DecisionCard seat={seat} />

      {dev && (
      <section className="section timing">
        <h3 className="label mb-1">{t.panel.live}</h3>
        {stats ? (
          <div className="grid grid-cols-2 gap-x-1 gap-y-1 sm:grid-cols-3">
            {liveNumbers(stats, alg, config.common.timeLimitMs).map((r, i) => (
              <Counter key={r.label} label={r.label} value={r.value} format={r.format} trend={i === 2 ? trend : null} />
            ))}
            {fam === 'ch3' && tel && (
              <>
                <Counter label={t.panel.planLength} value={tel.planLength ?? 0} />
                <Counter label={t.panel.replans} value={tel.replans ?? 0} />
                <div className="px-2 py-1.5" style={{ borderLeft: '2px solid rgba(196,166,255,0.35)' }}>
                  <div className="label">{t.panel.planValid}</div>
                  <div className="text-[14px] font-bold">{tel.planStillValid ? 'Yes' : 'No'}</div>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: '#cbbbe6' }}>
            {t.status.waiting}
          </p>
        )}
      </section>
      )}

      <section className="section">
        <h3 className="section-title speed">{t.panel.columnScores}</h3>
        {scores ? <ScoreBars scores={scores} best={tel?.bestCol ?? rt.decision?.col ?? null} /> : <p style={{ color: 'var(--text-dim)' }}>{t.common.none}</p>}
      </section>

      {dev && <DiagnosisSection seat={seat} />}

      {dev && (
      <section className="section">
        <h3 className="section-title speed">{fam === 'ch3' ? t.panel.plan : t.panel.pv}</h3>
        {pv.length ? (
          <ol className="flex flex-wrap gap-1" aria-label={fam === 'ch3' ? t.panel.plan : t.panel.pv}>
            {pv.map((c, i) => {
              const mover = ((useGame.getState().moves.length + i) % 2 === 0 ? 1 : 2) as SeatId;
              return (
                <li key={i} className="mono flex items-center gap-1 px-1.5 py-0.5 text-[13px]" style={{ background: 'var(--panel-2)', opacity: deviated && fam === 'ch3' ? 0.55 : 1 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{i + 1}.</span>
                  <span>
                    {t.players[mover][0]}
                    {c + 1}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>{t.panel.noPv}</p>
        )}
      </section>
      )}

      <section className="section">
        <button className="btn sm primary" onClick={() => rt.decision && setExplanation(explainMove(rt.decision, config))} disabled={!rt.decision}>
          {t.panel.explain}
        </button>
        {explanation && (
          <p className="mt-2 text-[14px]" aria-live="polite">
            {explanation}
          </p>
        )}
        {!rt.decision && <p className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>{t.panel.explainEmpty}</p>}
      </section>

      {dev && (
      <section className="section">
        <h3 className="section-title speed">{t.panel.charts}</h3>
        <NodesChart series={rt.series} />
        {(tel?.depthHistory?.length ?? 0) > 0 && <DepthChart points={tel!.depthHistory} ch3={fam === 'ch3'} />}
        {alg === 'mcts' && scores && <VisitsChart scores={scores} />}
        <button
          className="btn sm"
          disabled={benching}
          onClick={async () => {
            setBenching(true);
            try {
              setBench(await getWorker(seat).benchmark());
            } finally {
              setBenching(false);
            }
          }}
        >
          {benching ? t.status.thinking : t.panel.benchmark}
        </button>
        {bench && (
          <table className="log mt-2">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Pos</th>
                <th>D</th>
                <th>Nodes/s</th>
              </tr>
            </thead>
            <tbody>
              {bench.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{r.position}</td>
                  <td>{r.depth}</td>
                  <td>{r.nodesPerSec.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      )}

      {showTree && dev && (
        <section className="section">
          <TreeView seat={seat} />
        </section>
      )}

      <section className="section">
        <MoveLog />
      </section>
      <span className="sr-only">{log.length} moves</span>
    </div>
  );
}

export function MoveLog() {
  const log = useGame((s) => s.log);
  const seats = useGame((s) => s.seats);
  const rows = log.map((e) => ({
    ply: e.ply,
    player: t.players[e.player],
    who: e.by === 'agent' ? seats[e.player].name : e.by,
    column: e.col + 1,
    timeMs: e.timeMs,
    nodes: e.nodes ?? '',
    depth: e.depth ?? '',
    score: e.score,
    level: e.level ?? '',
  }));
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="section-title speed m-0">{t.panel.moveLog}</h3>
        <span className="ml-auto" />
        <button className="btn sm" disabled={!log.length} onClick={() => download('connect4-moves.json', JSON.stringify({ moves: log.map((e) => e.col + 1).join(''), log: rows }, null, 2))}>
          JSON
        </button>
        <button className="btn sm" disabled={!log.length} onClick={() => download('connect4-moves.csv', toCsv(rows), 'text/csv')}>
          CSV
        </button>
      </div>
      <div className="max-h-[240px] overflow-auto scrollbar-thin">
        <table className="log">
          <thead>
            <tr>
              <th>{t.log.ply}</th>
              <th>{t.log.who}</th>
              <th>{t.log.col}</th>
              <th>{t.log.time}</th>
              <th>{t.log.nodes}</th>
              <th>{t.log.depth}</th>
              <th>{t.log.score}</th>
              <th>{t.log.level}</th>
            </tr>
          </thead>
          <tbody>
            {log
              .slice()
              .reverse()
              .map((e) => (
                <tr key={e.ply}>
                  <td>{e.ply}</td>
                  <td>
                    {t.players[e.player][0]} · {e.by === 'agent' ? t.log.agent : e.by === 'guest' ? t.log.guest : t.log.human}
                  </td>
                  <td>{e.col + 1}</td>
                  <td>{fmtMs(e.timeMs)}</td>
                  <td>{e.nodes !== null ? fmtInt(e.nodes) : '—'}</td>
                  <td>{e.depth ?? '—'}</td>
                  <td>{e.score}</td>
                  <td>{e.level ? t.panel.level[e.level] : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MiniTelemetry({ seat }: { seat: SeatId }) {
  const s = useGame((x) => x.seats[seat]);
  const rt = useGame((x) => x.runtime[seat]);
  const colorOf = useGame((x) => x.colorOf);
  const st = rt.telemetry?.stats;
  const running = rt.status === 'thinking' || rt.status === 'replanning';
  return (
    <div className="timing min-w-0 p-2">
      <div className="flex items-center gap-1">
        <span className="label truncate">{t.players[colorOf[seat]]}</span>
        <span className={`pill ml-auto ${running ? 'thinking' : 'done'}`}>
          <span className="dot" />
          <span>{rt.status === 'idle' ? t.status.idle : t.status[rt.status]}</span>
        </span>
      </div>
      <div className="mono truncate text-[12px]" style={{ color: '#cbbbe6' }}>
        {s.name}
      </div>
      <div className="mono mt-1 grid grid-cols-2 gap-x-2 text-[12px]">
        <span>{t.presentation.nodes}</span>
        <b className="text-right">{st ? fmtInt(st.expanded) : '—'}</b>
        <span>{t.presentation.depth}</span>
        <b className="text-right">{st ? st.depthCompleted || st.depth : '—'}</b>
        <span>{t.presentation.time}</span>
        <b className="text-right">{st ? fmtMs(st.elapsedMs) : '—'}</b>
        <span>{t.presentation.best}</span>
        <b className="text-right">{rt.telemetry?.bestCol != null ? rt.telemetry.bestCol + 1 : '—'}</b>
      </div>
    </div>
  );
}
