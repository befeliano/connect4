import { useEffect, useState, type ReactNode } from 'react';
import { CHAPTER_PRESETS, DIFFICULTY_PRESETS, matchingPresets, presetConfig, type PresetId } from '../agents/presets';
import { ALGORITHM_NAMES } from '../agents/registry';
import { familyOf, type AgentConfig, type AlgorithmId } from '../agents/types';
import { t } from '../i18n/en';
import { FEATURE_NAMES } from '../engine/learned/features';
import { TD_TRAINED } from '../engine/learned/weights';
import type { EvaluationKind } from '../engine/heuristics';

const ALGS: AlgorithmId[] = ['final', 'idastar', 'astar', 'greedy', 'ids', 'dfs', 'bfs', 'minimax', 'alphabeta', 'mcts', 'rule', 'random'];

function Field({ label, children, id, hint }: { label: string; children: ReactNode; id: string; hint?: string }) {
  return (
    <>
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        {children}
      </label>
      {hint && <p className="hint">{hint}</p>}
    </>
  );
}

function Num({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  allowInfinity = false,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  allowInfinity?: boolean;
}) {
  const shown = Number.isFinite(value) ? String(value) : '∞';
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const raw = draft.trim();
    if (allowInfinity && (raw === '' || raw === '∞' || raw.toLowerCase() === 'inf')) return onChange(Infinity);
    const v = Number(raw);
    if (!Number.isFinite(v)) return setDraft(shown);
    const snapped = Math.round(v / step) * step;
    const next = Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
    if (next !== value) onChange(next);
    else setDraft(shown);
  };
  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        e.stopPropagation();
      }}
    />
  );
}

function Select<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Check({ id, value, onChange }: { id: string; value: boolean; onChange: (v: boolean) => void }) {
  return <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />;
}

export function PresetButtons({ config, onChange, idPrefix, chapters = true }: { config: AgentConfig; onChange: (c: AgentConfig) => void; idPrefix: string; chapters?: boolean }) {
  const current = matchingPresets(config);
  const row = (title: string, ids: PresetId[], suffix: string) => (
    <div className="mb-2">
      <div className="label mb-1">{title}</div>
      <div className="seg" role="group" aria-label={title} id={`${idPrefix}-presets-${suffix}`}>
        {ids.map((p) => (
          <button key={p} className="btn sm" aria-pressed={current.includes(p)} title={t.presets.about[p]} onClick={() => onChange(presetConfig(p))}>
            {t.presets[p]}
          </button>
        ))}
      </div>
    </div>
  );
  const shown = chapters ? (current.find((p) => CHAPTER_PRESETS.includes(p)) ?? current[0]) : current.find((p) => DIFFICULTY_PRESETS.includes(p));
  return (
    <div>
      {row(t.presets.difficulty, DIFFICULTY_PRESETS, 'difficulty')}
      {chapters && row(t.presets.byChapter, CHAPTER_PRESETS, 'chapter')}
      <p className="hint" aria-live="polite">
        {shown ? t.presets.about[shown] : chapters ? `${t.presets.custom}: ${t.presets.hint}` : t.presets.userCustom}
      </p>
    </div>
  );
}

export function AgentConfigEditor({ config, onChange, idPrefix }: { config: AgentConfig; onChange: (c: AgentConfig) => void; idPrefix: string }) {
  const fam = familyOf(config.algorithm);
  const set = (patch: (c: AgentConfig) => void) => {
    const c: AgentConfig = structuredClone(config);
    patch(c);
    onChange(c);
  };
  const id = (k: string) => `${idPrefix}-${k}`;
  const s = config.search;
  const isFinal = config.algorithm === 'final';
  const isAB = config.algorithm === 'alphabeta' || isFinal;
  const fp = config.final;

  return (
    <div>
      <Field label={t.params.algorithm} id={id('alg')} hint={t.hints.algorithm}>
        <Select
          id={id('alg')}
          value={config.algorithm}
          options={ALGS.map((a) => [a, `${ALGORITHM_NAMES[a]} · ${t.chapter[familyOf(a)]}`])}
          onChange={(v) => set((c) => (c.algorithm = v))}
        />
      </Field>
      <p className="mt-1 mb-2 text-[13px]" style={{ color: 'var(--text-dim)' }}>
        {t.algorithms[config.algorithm]}
      </p>

      {fam === 'ch3' && (
        <fieldset className="mb-2">
          <legend className="label mb-1">{t.params.ch3}</legend>
          <Field label={t.params.opponentModel} id={id('om')} hint={t.hints.opponentModel}>
            <Select id={id('om')} value={config.ch3.opponentModel} options={[['rule', t.params.ruleModel]]} onChange={() => {}} />
          </Field>
          <Field label={t.params.heuristic} id={id('h')} hint={t.hints.heuristic}>
            <Select
              id={id('h')}
              value={config.ch3.heuristic}
              options={[
                ['h', t.params.hOurs],
                ['zero', t.params.hZero],
              ]}
              onChange={(v) => set((c) => (c.ch3.heuristic = v))}
            />
          </Field>
          <Field label={t.params.depthCap} id={id('cap')} hint={t.hints.depthCap}>
            <Num id={id('cap')} value={config.ch3.depthCap} min={1} max={21} onChange={(v) => set((c) => (c.ch3.depthCap = Math.round(v)))} />
          </Field>
          <Field label={t.params.useReachedSet} id={id('rs')} hint={t.hints.useReachedSet}>
            <Select
              id={id('rs')}
              value={config.ch3.useReachedSet}
              options={[
                ['default', t.params.reachedDefault],
                ['on', t.common.on],
                ['off', t.common.off],
              ]}
              onChange={(v) => set((c) => (c.ch3.useReachedSet = v))}
            />
          </Field>
          <Field label={t.params.fallback} id={id('fb')} hint={t.hints.fallback}>
            <Select
              id={id('fb')}
              value={config.ch3.fallback}
              options={[
                ['rule', t.params.fallbackRule],
                ['random', t.params.fallbackRandom],
              ]}
              onChange={(v) => set((c) => (c.ch3.fallback = v))}
            />
          </Field>
        </fieldset>
      )}

      {isFinal && (
        <fieldset className="mb-2">
          <legend className="label mb-1">{t.params.final}</legend>
          <Field label={t.params.useOpening} id={id('fo')} hint={t.hints.useOpening}>
            <Check id={id('fo')} value={fp.useOpening} onChange={(v) => set((c) => (c.final.useOpening = v))} />
          </Field>
          {fp.useOpening && (
            <Field label={t.params.openPlies} id={id('fop')} hint={t.hints.openPlies}>
              <Num id={id('fop')} value={fp.openPlies} min={1} max={42} onChange={(v) => set((c) => (c.final.openPlies = Math.round(v)))} />
            </Field>
          )}
          <Field label={t.params.useSolver} id={id('fs')} hint={t.hints.useSolver}>
            <Check id={id('fs')} value={fp.useSolver} onChange={(v) => set((c) => (c.final.useSolver = v))} />
          </Field>
          {fp.useSolver && (
            <>
              <Field label={t.params.solveFrom} id={id('fsf')} hint={t.hints.solveFrom}>
                <Num id={id('fsf')} value={fp.solveFrom} min={0} max={41} onChange={(v) => set((c) => (c.final.solveFrom = Math.round(v)))} />
              </Field>
              <Field label={t.params.solverBudgetK} id={id('fsb')} hint={t.hints.solverBudgetK}>
                <Num id={id('fsb')} value={fp.solverBudgetK} min={0} max={1_000_000} onChange={(v) => set((c) => (c.final.solverBudgetK = Math.round(v)))} />
              </Field>
              <Field label={t.params.solverMode} id={id('fsm')} hint={t.hints.solverMode}>
                <Select
                  id={id('fsm')}
                  value={fp.solverMode}
                  options={[
                    ['weak', t.params.solverWeak],
                    ['strong', t.params.solverStrong],
                  ]}
                  onChange={(v) => set((c) => (c.final.solverMode = v))}
                />
              </Field>
              <Field label={t.params.tieBreakDepth} id={id('ftb')} hint={t.hints.tieBreakDepth}>
                <Num id={id('ftb')} value={fp.tieBreakDepth} min={1} max={8} onChange={(v) => set((c) => (c.final.tieBreakDepth = Math.round(v)))} />
              </Field>
            </>
          )}
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
            {t.params.level2}
          </p>
        </fieldset>
      )}

      {(config.algorithm === 'minimax' || isAB) && (
        <fieldset className="mb-2">
          <legend className="label mb-1">{t.params.search}</legend>
          {isAB && (
            <Field label={t.params.iterativeDeepening} id={id('id')} hint={t.hints.iterativeDeepening}>
              <Check id={id('id')} value={s.iterativeDeepening} onChange={(v) => set((c) => (c.search.iterativeDeepening = v))} />
            </Field>
          )}
          {isAB && s.iterativeDeepening ? (
            <p className="text-[12px] py-1" style={{ color: 'var(--text-dim)' }}>
              {t.params.depthByTime}
            </p>
          ) : (
            <Field label={t.params.depth} id={id('depth')} hint={t.hints.depth}>
              <Num id={id('depth')} value={s.depth} min={1} max={12} onChange={(v) => set((c) => (c.search.depth = Math.round(v)))} />
            </Field>
          )}
          <Field label={t.params.preferFasterWins} id={id('pfw')} hint={t.hints.preferFasterWins}>
            <Check id={id('pfw')} value={s.preferFasterWins} onChange={(v) => set((c) => (c.search.preferFasterWins = v))} />
          </Field>
          {isAB && (
            <>
              <Field label={t.params.moveOrdering} id={id('ord')} hint={t.hints.moveOrdering}>
                <Select
                  id={id('ord')}
                  value={s.moveOrdering}
                  options={[
                    ['none', t.params.orderNone],
                    ['centre', t.params.orderCentre],
                    ['killerHistory', t.params.orderKiller],
                  ]}
                  onChange={(v) => set((c) => (c.search.moveOrdering = v))}
                />
              </Field>
              <Field label={t.params.tt} id={id('tt')} hint={t.hints.tt}>
                <Check id={id('tt')} value={s.transpositionTable} onChange={(v) => set((c) => (c.search.transpositionTable = v))} />
              </Field>
              {s.transpositionTable && (
                <Field label={t.params.ttSize} id={id('ttmb')} hint={t.hints.ttSize}>
                  <Num id={id('ttmb')} value={s.ttSizeMB} min={1} max={256} onChange={(v) => set((c) => (c.search.ttSizeMB = Math.round(v)))} />
                </Field>
              )}
              <Field label={t.params.aspirationWindow} id={id('asp')} hint={t.hints.aspirationWindow}>
                <Num id={id('asp')} value={s.aspirationWindow} min={0} max={1000} onChange={(v) => set((c) => (c.search.aspirationWindow = v))} />
              </Field>
            </>
          )}
          <Field label={t.params.evaluation} id={id('ev')} hint={t.hints.evaluation}>
            <Select
              id={id('ev')}
              value={s.evaluation.kind}
              options={
                [
                  ['weighted', t.params.evalWeighted],
                  ['ourH', t.params.evalOurH],
                  ['linear', t.params.evalLinear],
                  ['td', t.params.evalTd],
                  ['network', t.params.evalNetwork],
                  ['committee', t.params.evalCommittee],
                ] as [EvaluationKind, string][]
              }
              onChange={(v) => set((c) => (c.search.evaluation.kind = v))}
            />
          </Field>
          {['linear', 'td', 'network', 'committee'].includes(s.evaluation.kind) && (
            <p className="mb-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              {t.params.evalNote}
            </p>
          )}
          {s.evaluation.kind === 'committee' && (
            <div className="mb-1">
              <span className="label">{t.params.committee}</span>
              <p className="hint">{t.hints.committee}</p>
              {(
                [
                  ['linear', t.params.memberLinear],
                  ['td', t.params.memberTd],
                  ['network', t.params.memberNetwork],
                ] as ['linear' | 'td' | 'network', string][]
              ).map(([k, l]) => (
                <Field key={k} label={l} id={id(`cm-${k}`)}>
                  <Check id={id(`cm-${k}`)} value={s.evaluation.committee[k]} onChange={(v) => set((c) => (c.search.evaluation.committee[k] = v))} />
                </Field>
              ))}
            </div>
          )}
          {(s.evaluation.kind === 'td' || (s.evaluation.kind === 'committee' && s.evaluation.committee.td)) && (
            <details className="mb-1">
              <summary className="label cursor-pointer py-1">{t.params.tdWeights}</summary>
              <p className="hint">{t.hints.tdWeights}</p>
              {FEATURE_NAMES.map((name, i) => (
                <Field key={i} label={name} id={id(`tdw${i}`)}>
                  <Num
                    id={id(`tdw${i}`)}
                    value={Math.round(s.evaluation.tdWeights[i] * 1000) / 1000}
                    min={-50}
                    max={50}
                    step={0.001}
                    onChange={(v) => set((c) => (c.search.evaluation.tdWeights[i] = v))}
                  />
                </Field>
              ))}
              <div className="mt-1 flex gap-1">
                <button className="btn sm" onClick={() => set((c) => (c.search.evaluation.tdWeights = [...TD_TRAINED]))}>
                  {t.params.tdReset}
                </button>
                <button className="btn sm" onClick={() => set((c) => (c.search.evaluation.tdWeights = Array(13).fill(0)))}>
                  {t.params.tdZero}
                </button>
              </div>
            </details>
          )}
          {s.evaluation.kind === 'weighted' && (
            <>
              <Field label={t.params.w2} id={id('w2')} hint={t.hints.w2}>
                <Num id={id('w2')} value={s.evaluation.w2} min={0} max={1000} step={0.5} onChange={(v) => set((c) => (c.search.evaluation.w2 = v))} />
              </Field>
              <Field label={t.params.w3} id={id('w3')} hint={t.hints.w3}>
                <Num id={id('w3')} value={s.evaluation.w3} min={0} max={1000} step={0.5} onChange={(v) => set((c) => (c.search.evaluation.w3 = v))} />
              </Field>
              <Field label={t.params.centreBonus} id={id('cb')} hint={t.hints.centreBonus}>
                <Num id={id('cb')} value={s.evaluation.centreBonus} min={0} max={1000} step={0.5} onChange={(v) => set((c) => (c.search.evaluation.centreBonus = v))} />
              </Field>
              <Field label={t.params.defenceMultiplier} id={id('dm')} hint={t.hints.defenceMultiplier}>
                <Num id={id('dm')} value={s.evaluation.defenceMultiplier} min={0} max={10} step={0.1} onChange={(v) => set((c) => (c.search.evaluation.defenceMultiplier = v))} />
              </Field>
            </>
          )}
        </fieldset>
      )}

      {config.algorithm === 'mcts' && (
        <fieldset className="mb-2">
          <legend className="label mb-1">{t.params.mcts}</legend>
          <Field label={t.params.timeBounded} id={id('tb')} hint={t.hints.timeBounded}>
            <Check id={id('tb')} value={config.mcts.timeBounded} onChange={(v) => set((c) => (c.mcts.timeBounded = v))} />
          </Field>
          {!config.mcts.timeBounded && (
            <Field label={t.params.iterations} id={id('it')} hint={t.hints.iterations}>
              <Num id={id('it')} value={config.mcts.iterations} min={100} max={200000} onChange={(v) => set((c) => (c.mcts.iterations = Math.round(v)))} />
            </Field>
          )}
          <Field label={t.params.explorationC} id={id('c')} hint={t.hints.explorationC}>
            <Num id={id('c')} value={Math.round(config.mcts.explorationC * 1000) / 1000} min={0} max={10} step={0.01} onChange={(v) => set((c) => (c.mcts.explorationC = v))} />
          </Field>
          <Field label={t.params.rolloutPolicy} id={id('rp')} hint={t.hints.rolloutPolicy}>
            <Select
              id={id('rp')}
              value={config.mcts.rolloutPolicy}
              options={[
                ['random', t.params.rolloutRandom],
                ['rule', t.params.rolloutRule],
              ]}
              onChange={(v) => set((c) => (c.mcts.rolloutPolicy = v))}
            />
          </Field>
          <Field label={t.params.maxRolloutDepth} id={id('rd')} hint={t.hints.maxRolloutDepth}>
            <Num id={id('rd')} value={config.mcts.maxRolloutDepth} min={1} max={42} onChange={(v) => set((c) => (c.mcts.maxRolloutDepth = Math.round(v)))} />
          </Field>
          <Field label={t.params.finalMoveSelection} id={id('fm')} hint={t.hints.finalMoveSelection}>
            <Select
              id={id('fm')}
              value={config.mcts.finalMoveSelection}
              options={[
                ['visits', t.params.mostVisits],
                ['mean', t.params.bestMean],
              ]}
              onChange={(v) => set((c) => (c.mcts.finalMoveSelection = v))}
            />
          </Field>
        </fieldset>
      )}

      <fieldset>
        <legend className="label mb-1">{t.params.common}</legend>
        <Field label={t.params.timeLimitMs} id={id('tl')} hint={t.hints.timeLimitMs}>
          <Num id={id('tl')} value={config.common.timeLimitMs} min={50} max={10000} onChange={(v) => set((c) => (c.common.timeLimitMs = Math.round(v)))} />
        </Field>
        <details className="mt-1">
          <summary className="label cursor-pointer py-1">{t.hints.advanced}</summary>
          <p className="hint">{t.hints.advancedNote}</p>
          <Field label={t.params.nodeBudget} id={id('nb')} hint={t.hints.nodeBudget}>
            <Num id={id('nb')} value={config.common.nodeBudget} min={1000} max={50_000_000} allowInfinity onChange={(v) => set((c) => (c.common.nodeBudget = v))} />
          </Field>
          <Field label={t.params.minThinkMs} id={id('mt')} hint={t.hints.minThinkMs}>
            <Num id={id('mt')} value={config.common.minThinkMs} min={0} max={3000} onChange={(v) => set((c) => (c.common.minThinkMs = Math.round(v)))} />
          </Field>
          <Field label={`${t.params.epsilon}: ${config.common.epsilon.toFixed(2)}`} id={id('eps')} hint={t.hints.epsilon}>
            <input
              id={id('eps')}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.common.epsilon}
              onChange={(e) => set((c) => (c.common.epsilon = Number(e.target.value)))}
            />
          </Field>
          <Field label={`${t.params.temperature}: ${config.common.temperature.toFixed(1)}`} id={id('temp')} hint={t.hints.temperature}>
            <input
              id={id('temp')}
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={config.common.temperature}
              onChange={(e) => set((c) => (c.common.temperature = Number(e.target.value)))}
            />
          </Field>
          <Field label={t.params.seed} id={id('seed')} hint={t.hints.seed}>
            <input
              id={id('seed')}
              className="input"
              placeholder={t.params.seedRandom}
              value={config.common.seed ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                set((c) => (c.common.seed = v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v))));
              }}
            />
          </Field>
          <Field label={t.params.telemetryHz} id={id('hz')} hint={t.hints.telemetryHz}>
            <Num id={id('hz')} value={config.common.telemetryHz} min={1} max={30} onChange={(v) => set((c) => (c.common.telemetryHz = Math.round(v)))} />
          </Field>
          <Field label={t.params.recordTree} id={id('rt')} hint={t.hints.recordTree}>
            <Select
              id={id('rt')}
              value={config.common.recordTree}
              options={[
                ['off', t.common.off],
                ['sampled', t.params.sampled],
                ['full', t.params.full],
              ]}
              onChange={(v) => set((c) => (c.common.recordTree = v))}
            />
          </Field>
        </details>
      </fieldset>
    </div>
  );
}
