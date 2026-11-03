import { useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import { BEST_TD, DEFAULT_TD, type TDParams, type TDProgress } from '../agents/learn/tdTrainer';
import { FEATURE_NAMES } from '../engine/learned/features';
import { TD_TRAINED } from '../engine/learned/weights';
import type { LearnWorkerApi } from '../worker/learn.worker';
import { useGame, type SeatId } from '../state/gameStore';
import { setSeatConfig } from '../state/controller';
import { t } from '../i18n/en';

let worker: Worker | null = null;
let api: Comlink.Remote<LearnWorkerApi> | null = null;
function learnApi(): Comlink.Remote<LearnWorkerApi> {
  if (!api) {
    worker = new Worker(new URL('../worker/learn.worker.ts', import.meta.url), { type: 'module' });
    api = Comlink.wrap<LearnWorkerApi>(worker);
  }
  return api;
}

function NumIn({ label, hint, value, onChange, step = 1, min = 0, max = 1e9 }: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft);
    if (!Number.isFinite(v)) return setDraft(String(value));
    onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <input
          className="input"
          inputMode="decimal"
          value={draft}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            e.stopPropagation();
          }}
        />
      </label>
      {hint && <p className="hint">{hint}</p>}
    </>
  );
}

function Curve({ curve }: { curve: TDProgress['curve'] }) {
  const W = 320;
  const H = 120;
  const maxEp = Math.max(1, ...curve.map((c) => c.episode));
  const x = (e: number) => 30 + (e / maxEp) * (W - 40);
  const y = (s: number) => H - 18 - s * (H - 30);
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.episode).toFixed(1)} ${y(c.score).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t.learn.curve}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={30} x2={W - 10} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray={g === 0.5 ? '4 4' : undefined} />
          <text x={24} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--text-dim)">
            {g}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--good)" strokeWidth={2.5} />
      {curve.map((c) => (
        <circle key={c.episode} cx={x(c.episode)} cy={y(c.score)} r={3} fill="var(--good)">
          <title>{`${c.episode} ${t.learn.games}: ${c.score.toFixed(2)} (W ${c.w} D ${c.d} L ${c.l})`}</title>
        </circle>
      ))}
      <text x={W - 10} y={H - 4} textAnchor="end" fontSize={10} fill="var(--text-dim)">
        {maxEp.toLocaleString('en-US')} {t.learn.games}
      </text>
    </svg>
  );
}

function WeightBars({ w }: { w: number[] }) {
  const max = Math.max(1, ...w.map(Math.abs));
  return (
    <div>
      {FEATURE_NAMES.map((n, i) => {
        const v = w[i] ?? 0;
        const f = (Math.abs(v) / max) * 50;
        return (
          <div key={i} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: '140px 1fr 52px', height: 20 }}>
            <span className="truncate" style={{ color: 'var(--text-dim)' }}>
              {n}
            </span>
            <span className="relative block h-[12px]" style={{ background: 'rgba(196,166,255,0.08)' }}>
              <span className="absolute top-0 bottom-0" style={{ left: '50%', width: 1, background: 'var(--line)' }} />
              <span
                className="absolute top-0 bottom-0"
                style={{ left: v >= 0 ? '50%' : `${50 - f}%`, width: `${f}%`, background: v >= 0 ? 'var(--good)' : 'var(--bad)', transition: 'all .25s' }}
              />
            </span>
            <span className="mono text-right">{(v >= 0 ? '+' : '') + v.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LearnPanel() {
  const [p, setP] = useState<TDParams>({ ...DEFAULT_TD });
  const [prog, setProg] = useState<TDProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seats = useGame((s) => s.seats);
  const runRef = useRef(0);

  const start = async () => {
    const id = ++runRef.current;
    setRunning(true);
    setNote(null);
    setProg({ episode: 0, weights: p.init === 'trained' ? [...TD_TRAINED] : Array(13).fill(0), curve: [], done: false, msPerGame: 0, best: null });
    try {
      const out = await learnApi().train(
        p,
        Comlink.proxy((x: TDProgress) => {
          if (id === runRef.current) setProg(x);
        }),
      );
      if (id === runRef.current) setProg(out);
    } finally {
      if (id === runRef.current) setRunning(false);
    }
  };
  const stop = () => {
    void learnApi().stop();
  };
  const use = (weights: number[]) => {
    for (const seat of [1, 2] as SeatId[]) {
      const s = seats[seat];
      if (s.kind !== 'agent') continue;
      const c = structuredClone(s.config);
      c.search.evaluation.tdWeights = [...weights];
      if (!['td', 'committee'].includes(c.search.evaluation.kind)) c.search.evaluation.kind = 'td';
      setSeatConfig(seat, c);
    }
    setNote(t.learn.used);
  };
  const set = (k: keyof TDParams) => (v: number) => setP((x) => ({ ...x, [k]: v }));
  const last = prog?.curve[prog.curve.length - 1];

  return (
    <div>
      <section className="section">
        <h2 className="section-title speed">{t.learn.title}</h2>
        <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>
          {t.learn.intro}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button className="btn sm" disabled={running} aria-pressed={JSON.stringify(p) === JSON.stringify(DEFAULT_TD)} onClick={() => setP({ ...DEFAULT_TD })}>
            {t.learn.quick}
          </button>
          <button className="btn sm" disabled={running} aria-pressed={JSON.stringify(p) === JSON.stringify(BEST_TD)} onClick={() => setP({ ...BEST_TD })}>
            {t.learn.bestSetting}
          </button>
        </div>
        <p className="hint mt-1">{t.learn.recipes}</p>
        <h3 className="label mt-2 mb-1">{t.learn.learning}</h3>
        <NumIn label={t.learn.alpha} hint={t.learn.hAlpha} value={p.alpha} onChange={set('alpha')} step={0.001} min={0} max={1} />
        <NumIn label={t.learn.lambda} hint={t.learn.hLambda} value={p.lambda} onChange={set('lambda')} step={0.1} min={0} max={1} />
        <NumIn label={t.learn.epsilon} hint={t.learn.hEpsilon} value={p.epsilon} onChange={set('epsilon')} step={0.05} min={0} max={1} />
        <NumIn label={t.learn.episodes} hint={t.learn.hEpisodes} value={p.episodes} onChange={(v) => set('episodes')(Math.round(v))} min={100} max={200000} />
        <label className="field">
          <span>{t.learn.init}</span>
          <select className="select" value={p.init} onChange={(e) => setP((x) => ({ ...x, init: e.target.value as TDParams['init'] }))}>
            <option value="zero">{t.learn.initZero}</option>
            <option value="trained">{t.learn.initTrained}</option>
          </select>
        </label>
        <p className="hint">{t.learn.hInit}</p>
        <NumIn label={t.learn.seed} hint={t.learn.hSeed} value={p.seed} onChange={(v) => set('seed')(Math.round(v))} min={0} max={2 ** 31} />
        <h3 className="label mt-2 mb-1">{t.learn.checking}</h3>
        <NumIn label={t.learn.evalEvery} hint={t.learn.hEvalEvery} value={p.evalEvery} onChange={(v) => set('evalEvery')(Math.round(v))} min={100} max={100000} />
        <NumIn label={t.learn.evalGames} hint={t.learn.hEvalGames} value={p.evalGames} onChange={(v) => set('evalGames')(Math.round(v))} min={2} max={1000} />
        <NumIn label={t.learn.evalDepth} hint={t.learn.hEvalDepth} value={p.evalDepth} onChange={(v) => set('evalDepth')(Math.round(v))} min={1} max={6} />
        <p className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {t.learn.note}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button className="btn sm primary" disabled={running} onClick={() => void start()}>
            {t.learn.start}
          </button>
          <button className="btn sm" disabled={!running} onClick={stop}>
            {t.learn.stop}
          </button>
          <button className="btn sm" disabled={!prog?.best || running} onClick={() => prog?.best && use(prog.best.weights)}>
            {t.learn.useBest}
          </button>
          <button className="btn sm" disabled={!prog || running} onClick={() => prog && use(prog.weights)}>
            {t.learn.use}
          </button>
        </div>
        {note && (
          <p className="mt-2 text-[13px]" role="status" style={{ color: 'var(--good)' }}>
            {note}
          </p>
        )}
      </section>
      {prog && (
        <section className="section timing">
          <div className="mono flex flex-wrap gap-x-4 text-[13px]">
            <span>
              {prog.episode.toLocaleString('en-US')} / {p.episodes.toLocaleString('en-US')} {t.learn.games}
            </span>
            {prog.msPerGame > 0 && (
              <span>
                {prog.msPerGame.toFixed(2)} {t.learn.speed}
              </span>
            )}
            {last && <span>score {last.score.toFixed(2)}</span>}
          </div>
          {prog.best && (
            <p className="mono mt-1 text-[13px]" style={{ color: 'var(--good)' }}>
              {t.learn.bestSoFar} {prog.best.score.toFixed(2)} @ {prog.best.episode.toLocaleString('en-US')} {t.learn.games}
            </p>
          )}
          <h3 className="label mt-2 mb-1">{t.learn.weights}</h3>
          <WeightBars w={prog.weights} />
          <h3 className="label mt-3 mb-1">{t.learn.curve}</h3>
          {prog.curve.length > 0 && <Curve curve={prog.curve} />}
        </section>
      )}
    </div>
  );
}

export default LearnPanel;
