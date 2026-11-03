import { useEffect, useState } from 'react';
import type { Diagnosis } from '../agents/diagnose';
import type { Level } from '../agents/types';
import { useGame, type SeatId } from '../state/gameStore';
import { AgentWorker } from '../worker/client';
import { useUi } from '../state/uiStore';
import { t } from '../i18n/en';

const LEVELS: Level[] = ['plan', 'search', 'solve'];
const LEVEL_COLOR: Record<Level, string> = { plan: '#ffd166', search: 'var(--accent)', solve: 'var(--good)' };

export function DecisionCard({ seat }: { seat: SeatId }) {
  const rt = useGame((s) => s.runtime[seat]);
  const config = useGame((s) => s.seats[seat].config);
  const dev = useUi((s) => s.devMode);
  const running = rt.status === 'thinking' || rt.status === 'replanning';
  const d = rt.decision;
  const isFinal = config.algorithm === 'final';
  const level: Level | undefined = running ? rt.telemetry?.level : d?.level;
  const chosen = d ? d.columnScores[d.col] : null;

  return (
    <section className="section" aria-live="polite">
      <h3 className="section-title speed">{t.panel.decision}</h3>
      {isFinal && (
        <ol className="mb-2 flex gap-1" aria-label="Levels">
          {LEVELS.map((l) => {
            const on = level === l;
            return (
              <li
                key={l}
                className="flex-1 px-2 py-1 text-center text-[12px] font-bold uppercase tracking-wider"
                style={{
                  border: `2px solid ${on ? LEVEL_COLOR[l] : 'var(--line)'}`,
                  color: on ? 'var(--text)' : 'var(--text-dim)',
                  background: on ? 'rgba(196,166,255,0.12)' : 'transparent',
                }}
                aria-current={on ? 'step' : undefined}
              >
                {t.panel.level[l]}
              </li>
            );
          })}
        </ol>
      )}
      {running ? (
        <p className="text-[14px]">{level ? `${t.panel.levelLong[level]} · ${t.status.thinking}` : t.status.thinking}</p>
      ) : d ? (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="display text-[22px]">{t.panel.played(d.col + 1)}</span>
            {chosen && chosen.label !== '—' && (
              <span className="text-[14px]" style={{ color: chosen.proven === 'win' ? 'var(--good)' : chosen.proven === 'loss' ? 'var(--bad)' : 'var(--text-dim)' }}>
                {t.panel.expects}: {chosen.label}
              </span>
            )}
          </div>
          {d.level && (
            <p className="mt-1 text-[13px] font-bold" style={{ color: LEVEL_COLOR[d.level] }}>
              {t.panel.levelLong[d.level]}
            </p>
          )}
          <p className="mt-1 text-[14px]">{d.reason}</p>
          {dev && d.levelNote && (
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              {d.levelNote}
            </p>
          )}
        </div>
      ) : (
        <p style={{ color: 'var(--text-dim)' }}>{t.panel.noDecision}</p>
      )}
    </section>
  );
}

let diagWorker: AgentWorker | null = null;
const diagnoser = (): AgentWorker => (diagWorker ??= new AgentWorker());

const fmt = (v: number | null) => (v === null ? '—' : (v > 0 ? '+' : '') + v);

export function DiagnosisSection({ seat }: { seat: SeatId }) {
  const moves = useGame((s) => s.moves);
  const log = useGame((s) => s.log);
  const config = useGame((s) => s.seats[seat].config);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [chose, setChose] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);

  const lastAgent = [...log].reverse().find((e) => e.player === seat && e.by === 'agent');
  const target = lastAgent && lastAgent.ply <= moves.length ? moves.slice(0, lastAgent.ply - 1) : moves;
  const targetKey = target.join('') + '|' + (lastAgent?.ply ?? 0);

  const run = async () => {
    setBusy(true);
    try {
      const w = diagnoser();
      const budget = Math.max(2000, config.final?.solverBudgetK ?? 15000);
      const r = await w.diagnose(target, config.search.evaluation, budget, false);
      setDiag(r);
      setChose(lastAgent && lastAgent.ply <= moves.length ? lastAgent.col : null);
    } catch {
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!auto) return;
    const st = useGame.getState().runtime[seat].status;
    if (st === 'thinking' || st === 'replanning') return;
    void run();
  }, [targetKey, auto]);

  const ok = diag && chose !== null && diag.optimal.length ? diag.optimal.includes(chose) : null;
  const cols = t.panel.diagCols;

  return (
    <section className="section">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="section-title speed m-0">{t.panel.diagnosis}</h3>
        <label className="ml-auto flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto
        </label>
        <button className="btn sm" disabled={busy} onClick={() => void run()}>
          {busy ? t.panel.diagnosing : t.panel.diagnose}
        </button>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
        {t.panel.diagHint}
      </p>
      {diag && (
        <>
          {chose !== null && (
            <p className="mt-1 text-[14px] font-bold" style={{ color: ok === null ? 'var(--text)' : ok ? 'var(--good)' : 'var(--bad)' }}>
              {t.panel.diagAgentChose(chose + 1, ok)}
            </p>
          )}
          <div className="mt-1 overflow-auto scrollbar-thin">
            <table className="log">
              <thead>
                <tr>
                  <th>{cols.col}</th>
                  <th>{cols.hand}</th>
                  <th>{cols.linear}</th>
                  <th>{cols.td}</th>
                  <th>{cols.network}</th>
                  <th>{cols.committee}</th>
                  <th>{cols.solver}</th>
                </tr>
              </thead>
              <tbody>
                {diag.rows.map((r) => (
                  <tr key={r.col} style={{ opacity: r.legal ? 1 : 0.35, outline: chose === r.col ? '2px solid var(--accent)' : undefined }}>
                    <td>
                      {r.col + 1}
                      {diag.optimal.includes(r.col) ? ' ✓' : ''}
                    </td>
                    {r.winsNow ? (
                      <td colSpan={5}>{t.panel.winsNow}</td>
                    ) : (
                      <>
                        <td>{fmt(r.hand)}</td>
                        <td>{fmt(r.linear)}</td>
                        <td>{fmt(r.td)}</td>
                        <td>{fmt(r.network)}</td>
                        <td>{fmt(r.committee)}</td>
                      </>
                    )}
                    <td style={{ color: r.solver === null ? undefined : r.solver > 0 ? 'var(--good)' : r.solver < 0 ? 'var(--bad)' : undefined }}>{r.solverLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mono mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {diag.solver.aborted
              ? t.panel.diagSolverOff
              : `solver: ${Math.round(diag.solver.nodes).toLocaleString('en-US')} positions, ${Math.round(diag.solver.ms)} ms · ✓ = ${t.panel.optimal}`}
          </p>
        </>
      )}
    </section>
  );
}
