import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { AgentConfigEditor, PresetButtons } from '../ui/AgentConfigEditor';
import { ALGORITHM_NAMES } from '../agents/registry';
import { configToJSON } from '../agents/presets';
import { download, toCsv } from '../ui/download';
import { t } from '../i18n/en';
import { DISC_COLOR } from '../scene/colors';
import { applyTemplate, startArena, stepArena, stopArena, swapSides, useArena, watchGame, type TemplateId } from './arenaStore';
import { summarise, type GameRecord, type Side } from './stats';
import { MiniTelemetry } from '../ui/AgentPanel';
import { useGame } from '../state/gameStore';
import { encodeArena } from './share';
import type { Speed } from './series';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function SideCard({ side }: { side: Side }) {
  const config = useArena((s) => s[side]);
  const running = useArena((s) => s.running);
  const set = (c: typeof config) => useArena.setState({ [side]: c, results: [] } as never);
  return (
    <div className="panel-2 min-w-0 p-2">
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="inline-block h-4 w-4 rounded-full" style={{ background: DISC_COLOR[side === 'red' ? 1 : 2] }} />
        <h3 className="display m-0 text-[15px]">{side === 'red' ? t.arena.red : t.arena.yellow}</h3>
        <span className="ml-auto truncate text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {ALGORITHM_NAMES[config.algorithm]}
        </span>
      </div>
      <fieldset disabled={running} className="m-0 border-0 p-0">
        <PresetButtons config={config} onChange={set} idPrefix={`arena-${side}`} />
        <details className="mt-2">
          <summary className="label cursor-pointer py-2">Parameters</summary>
          <AgentConfigEditor config={config} onChange={set} idPrefix={`arena-${side}`} />
        </details>
      </fieldset>
    </div>
  );
}

function Scoreboard({ games }: { games: GameRecord[] }) {
  const sum = summarise(games);
  const rows: [string, (s: Side) => string][] = [
    [t.arena.wins, (s) => String(sum.sides[s].wins)],
    [t.arena.draws, (s) => String(sum.sides[s].draws)],
    [t.arena.losses, (s) => String(sum.sides[s].losses)],
    [t.arena.winRate, (s) => pct(sum.sides[s].winRate.p)],
    [t.arena.ci, (s) => `${pct(sum.sides[s].winRate.lo)}–${pct(sum.sides[s].winRate.hi)}`],
    [t.arena.avgTime, (s) => `${fmt(sum.sides[s].avgTimeMs)} ms`],
    [t.arena.avgNodes, (s) => fmt(sum.sides[s].avgNodes)],
  ];
  return (
    <div className="timing p-2">
      <table className="log" style={{ background: 'transparent' }}>
        <thead>
          <tr>
            <th style={{ background: 'transparent' }} />
            <th style={{ background: 'transparent' }}>{t.arena.red}</th>
            <th style={{ background: 'transparent' }}>{t.arena.yellow}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <td style={{ color: '#bfaee0' }}>{label}</td>
              <td className="text-[14px] font-bold">{f('red')}</td>
              <td className="text-[14px] font-bold">{f('yellow')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mono mt-1 text-[12px]" style={{ color: '#bfaee0' }}>
        {t.arena.games}: {sum.games} · {t.arena.avgLength}: {sum.avgLength.toFixed(1)} plies
      </p>
    </div>
  );
}

function ResultsChart({ games }: { games: GameRecord[] }) {
  const data = useMemo(() => {
    let score = 0;
    return games.map((g, i) => {
      score += g.winner === 'red' ? 1 : g.winner === 'draw' ? 0.5 : 0;
      return { game: i + 1, red: Math.round((score / (i + 1)) * 1000) / 10 };
    });
  }, [games]);
  if (data.length < 2) return null;
  return (
    <figure className="m-0 mt-2">
      <figcaption className="label mb-1">Red score so far (draw = ½), %</figcaption>
      <div className="h-[130px]" role="img" aria-label={`Red score after ${data.length} games: ${data[data.length - 1].red}%`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="game" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
            <YAxis domain={[0, 100]} stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
            <ReferenceLine y={50} stroke="var(--text-dim)" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{ background: 'var(--timing-bg)', border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              formatter={(v) => [`${v}%`, 'Red score']}
              labelFormatter={(v) => `After game ${v}`}
            />
            <Line dataKey="red" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function ArenaPanel() {
  const s = useArena();
  const [copied, setCopied] = useState(false);
  const setSettings = (patch: Partial<typeof s.settings>) => useArena.setState({ settings: { ...s.settings, ...patch } });
  const rows = s.results.map((g) => ({
    game: g.index + 1,
    step: s.sweep ? s.sweep.values[g.step] : '',
    starter: g.starter,
    winner: g.winner,
    plies: g.plies,
    moves: g.moves.map((c) => c + 1).join(''),
    redMoves: g.sides.red.moves,
    redTimeMs: Math.round(g.sides.red.timeMs),
    redNodes: g.sides.red.nodes,
    yellowMoves: g.sides.yellow.moves,
    yellowTimeMs: Math.round(g.sides.yellow.timeMs),
    yellowNodes: g.sides.yellow.nodes,
  }));

  const onBoard = useGame((g) => g.mode === 'arena');
  return (
    <div>
      {onBoard && (s.running || s.results.length > 0) && (
        <section className="section grid grid-cols-2 gap-1">
          <MiniTelemetry seat={1} />
          <MiniTelemetry seat={2} />
        </section>
      )}
      <section className="section">
        <h2 className="section-title speed">{t.arena.templates}</h2>
        <div className="seg">
          {(
            [
              ['ch3vsch6', t.arena.tplCh3vsCh6],
              ['mmVsAb', t.arena.tplMmVsAb],
              ['mctsSweep', t.arena.tplMctsSweep],
              ['a3vsFinal', t.arena.tplA3vsFinal],
              ['ablation', t.arena.tplAblation],
              ['handVsLearned', t.arena.tplHandVsLearned],
            ] as [TemplateId, string][]
          ).map(([id, label]) => (
            <button key={id} className="btn sm" disabled={s.running} onClick={() => applyTemplate(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          <SideCard side="red" />
          <SideCard side="yellow" />
        </div>
        <button className="btn sm mt-2" onClick={swapSides} disabled={s.running}>
          ⇄ {t.arena.swap}
        </button>
        {s.sweep && (
          <p className="mt-2 text-[13px]">
            Sweep on Red: {s.sweep.label} = {s.sweep.values.join(', ')} ({s.settings.games} games each).{' '}
            <button className="btn sm ghost" onClick={() => useArena.setState({ sweep: null })} disabled={s.running}>
              {t.common.reset}
            </button>
          </p>
        )}
      </section>

      <section className="section">
        <fieldset disabled={s.running} className="m-0 border-0 p-0">
          <label className="field">
            <span>{t.arena.games}</span>
            <input className="input" type="number" min={1} max={1000} value={s.settings.games} onChange={(e) => setSettings({ games: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
          </label>
          <label className="field">
            <span>{t.arena.alternate}</span>
            <input type="checkbox" checked={s.settings.alternate} onChange={(e) => setSettings({ alternate: e.target.checked })} />
          </label>
          <label className="field">
            <span>{t.arena.randomOpenings}</span>
            <input className="input" type="number" min={0} max={10} value={s.settings.randomOpenings} onChange={(e) => setSettings({ randomOpenings: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
          </label>
          <label className="field">
            <span>{t.arena.speed}</span>
            <select className="select" value={s.settings.speed} onChange={(e) => setSettings({ speed: e.target.value as Speed })}>
              <option value="instant">{t.arena.instant}</option>
              <option value="fast">{t.arena.fast}</option>
              <option value="watchable">{t.arena.watchable}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.arena.timeOverride}</span>
            <input className="input" type="number" min={0} max={10000} value={s.settings.timeOverride} onChange={(e) => setSettings({ timeOverride: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })} />
          </label>
          <label className="field">
            <span>{t.params.seed}</span>
            <input className="input" type="number" value={s.settings.seed} onChange={(e) => setSettings({ seed: Number(e.target.value) || 1 })} />
          </label>
        </fieldset>
        <div className="mt-2 flex flex-wrap gap-1">
          {!s.running ? (
            <button className="btn primary" onClick={() => void startArena()}>
              {t.arena.start}
            </button>
          ) : (
            <>
              <button className="btn" onClick={stopArena}>
                {t.arena.stop}
              </button>
              <button className="btn" onClick={() => s.togglePause()} aria-pressed={s.paused}>
                {s.paused ? t.arena.resume : t.arena.pause}
              </button>
              {s.paused && (
                <button className="btn" onClick={stepArena}>
                  {t.tree.step}
                </button>
              )}
            </>
          )}
        </div>
        {s.running && (
          <p className="mono mt-2 text-[13px]" aria-live="polite">
            {t.arena.game} {s.progress.game} / {s.progress.total}
            {s.sweep ? ` · ${s.sweep.label} ${s.sweep.values[s.progress.step]}` : ''}
          </p>
        )}
        {s.error && (
          <p className="bad mt-2 text-[13px]" role="alert">
            Error: {s.error}
          </p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title speed">{t.arena.scoreboard}</h2>
        {s.sweep ? (
          s.sweep.values.map((v, i) => {
            const games = s.results.filter((g) => g.step === i);
            if (!games.length) return null;
            return (
              <div key={v} className="mb-2">
                <h3 className="label">
                  {s.sweep!.label}: {v}
                </h3>
                <Scoreboard games={games} />
              </div>
            );
          })
        ) : (
          <Scoreboard games={s.results} />
        )}
        <ResultsChart games={s.results} />
      </section>

      <section className="section">
        <div className="mb-1 flex flex-wrap items-center gap-1">
          <h2 className="section-title speed m-0">{t.arena.results}</h2>
          <span className="ml-auto" />
          <button
            className="btn sm"
            disabled={!s.results.length}
            onClick={() =>
              download(
                'arena-results.json',
                JSON.stringify({ red: configToJSON(s.red), yellow: configToJSON(s.yellow), settings: s.settings, sweep: s.sweep, summary: summarise(s.results), games: rows }, null, 2),
              )
            }
          >
            JSON
          </button>
          <button className="btn sm" disabled={!s.results.length} onClick={() => download('arena-results.csv', toCsv(rows), 'text/csv')}>
            CSV
          </button>
          <button
            className="btn sm"
            onClick={async () => {
              const url = encodeArena({ red: s.red, yellow: s.yellow, settings: s.settings });
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                window.prompt(t.arena.shareLink, url);
              }
            }}
          >
            {copied ? t.common.copied : t.arena.shareLink}
          </button>
        </div>
        <div className="max-h-[260px] overflow-auto scrollbar-thin">
          <table className="log">
            <thead>
              <tr>
                <th>{t.arena.game}</th>
                {s.sweep && <th>Iter.</th>}
                <th>{t.arena.starter}</th>
                <th>{t.arena.winner}</th>
                <th>{t.arena.plies}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.results
                .slice()
                .reverse()
                .map((g) => (
                  <tr key={g.index}>
                    <td>{g.index + 1}</td>
                    {s.sweep && <td>{s.sweep.values[g.step]}</td>}
                    <td>{g.starter === 'red' ? t.arena.red : t.arena.yellow}</td>
                    <td className={g.winner === 'red' ? '' : ''}>{g.winner === 'draw' ? t.arena.draws.slice(0, -1) : g.winner === 'red' ? t.arena.red : t.arena.yellow}</td>
                    <td>{g.plies}</td>
                    <td>
                      <button className="btn sm ghost" disabled={s.running} onClick={() => watchGame(g)}>
                        {t.arena.watch}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
