import { useEffect, useMemo, useState } from 'react';
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy';
import { familyOf, type TreeNodeRec } from '../agents/types';
import { useGame, type SeatId } from '../state/gameStore';
import { t } from '../i18n/en';

interface TNode {
  rec: TreeNodeRec | null;
  children: TNode[];
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const BASE_RATE = 12;

function build(nodes: TreeNodeRec[]): { root: TNode; byId: Map<number, TNode> } {
  const root: TNode = { rec: null, children: [] };
  const byId = new Map<number, TNode>();
  for (const r of nodes) byId.set(r.id, { rec: r, children: [] });
  for (const r of nodes) {
    const parent = r.parent < 0 ? root : byId.get(r.parent);
    parent?.children.push(byId.get(r.id) as TNode);
  }
  return { root, byId };
}

function tone(rec: TreeNodeRec, ch3: boolean): { fill: string; text: string; dashed: boolean } {
  if (rec.kind === 'pruned') return { fill: 'transparent', text: 'var(--text-dim)', dashed: true };
  if (rec.kind === 'goal' || rec.kind === 'win') return { fill: 'var(--good)', text: 'var(--good)', dashed: false };
  if (rec.kind === 'dead' || rec.kind === 'loss') return { fill: 'var(--bad)', text: 'var(--bad)', dashed: false };
  if (ch3 || rec.value === null) return { fill: 'var(--accent)', text: 'var(--text)', dashed: false };
  if (rec.value > 0.5) return { fill: 'var(--good)', text: 'var(--text)', dashed: false };
  if (rec.value < -0.5) return { fill: 'var(--bad)', text: 'var(--text)', dashed: false };
  return { fill: 'var(--text-dim)', text: 'var(--text)', dashed: false };
}

function valueText(rec: TreeNodeRec, ch3: boolean): string {
  if (rec.label) return rec.label;
  if (rec.kind === 'goal') return 'goal';
  if (rec.kind === 'dead') return 'dead end';
  if (rec.kind === 'win') return 'win';
  if (rec.kind === 'loss') return 'loss';
  if (rec.kind === 'draw') return 'draw';
  if (rec.value === null) return '';
  if (ch3) return `f=${rec.value === Infinity ? '∞' : rec.value}`;
  if (Math.abs(rec.value) >= 99000) return rec.value > 0 ? 'win' : 'loss';
  const r = Math.round(rec.value * 10) / 10;
  return r > 0 ? `+${r}` : String(r);
}

export function TreeView({ seat }: { seat: SeatId }) {
  const decision = useGame((s) => s.runtime[seat].decision);
  const alg = useGame((s) => s.seats[seat].config.algorithm);
  const ch3 = familyOf(alg) === 'ch3';
  const treeData = decision?.tree ?? null;
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<number>(Infinity);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const built = useMemo(() => (treeData ? build(treeData.nodes) : null), [treeData]);
  const total = treeData?.nodes.length ?? 0;

  useEffect(() => {
    if (!treeData) return;
    setCollapsed(new Set(treeData.nodes.filter((n) => n.depth >= 2 && treeData.nodes.some((c) => c.parent === n.id)).map((n) => n.id)));
    setStep(Infinity);
    setPlaying(false);
  }, [treeData]);

  useEffect(() => {
    if (!playing) return;
    const interval = 1000 / (BASE_RATE * speed);
    const id = setInterval(() => {
      setStep((s) => {
        const next = (Number.isFinite(s) ? s : -1) + 1;
        if (next >= total - 1) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, Math.max(16, interval));
    return () => clearInterval(id);
  }, [playing, speed, total]);

  const layout = useMemo(() => {
    if (!built) return null;
    const visible = (n: TNode): TNode => ({
      rec: n.rec,
      children: n.rec && collapsed.has(n.rec.id) ? [] : n.children.filter((c) => !c.rec || c.rec.order <= step).map(visible),
    });
    const h = hierarchy(visible(built.root), (d) => d.children);
    return d3tree<TNode>().nodeSize([24, 96])(h);
  }, [built, collapsed, step]);

  if (!treeData || !layout) {
    return (
      <div>
        <h3 className="section-title speed">{t.tree.title}</h3>
        <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>
          {t.tree.empty}
        </p>
      </div>
    );
  }

  const nodes = layout.descendants();
  const xs = nodes.map((n) => n.x);
  const minX = Math.min(...xs) - 16;
  const maxX = Math.max(...xs) + 16;
  const maxY = Math.max(...nodes.map((n) => n.y)) + 120;
  const width = maxY;
  const height = maxX - minX;
  const current = Number.isFinite(step) ? treeData.nodes.find((n) => n.order === step) : null;
  const moverAt = (depth: number) => t.players[depth % 2 === 1 ? seat : seat === 1 ? 2 : 1][0];

  const toggle = (n: HierarchyPointNode<TNode>) => {
    const id = n.data.rec?.id;
    if (id === undefined) return;
    const hasKids = built?.byId.get(id)?.children.length;
    if (!hasKids) return;
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="section-title speed m-0">{t.tree.title}</h3>
        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {total.toLocaleString('en-US')} nodes{treeData.truncated ? ` · ${t.tree.truncated}` : ''}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1" role="group" aria-label={t.tree.replay}>
        <span className="label mr-1">{t.tree.replay}</span>
        <button
          className="btn sm"
          onClick={() => {
            if (!playing && (!Number.isFinite(step) || step >= total - 1)) setStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? t.tree.pause : t.tree.play}
        </button>
        <button className="btn sm" onClick={() => setStep((s) => Math.min(total - 1, (Number.isFinite(s) ? s : -1) + 1))}>
          {t.tree.step}
        </button>
        <button className="btn sm" onClick={() => { setPlaying(false); setStep(Infinity); }}>
          {t.common.reset}
        </button>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="label">{t.tree.speed}</span>
          <select className="select !w-auto" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
      {Number.isFinite(step) && (
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
          aria-label="Replay position"
        />
      )}
      {current && (
        <p className="mono text-[12px]" aria-live="polite">
          #{step + 1}: depth {current.depth}, column {current.col + 1} ({nodeText(current, ch3) || current.kind})
        </p>
      )}
      <div className="max-h-[420px] overflow-auto scrollbar-thin" style={{ background: 'var(--bg-deep)' }}>
        <svg width={width} height={height} role="tree" aria-label={t.tree.title} style={{ display: 'block' }}>
          <g transform={`translate(24, ${-minX})`}>
            {layout.links().map((l, i) => (
              <path
                key={i}
                d={`M${l.source.y},${l.source.x} C${(l.source.y + l.target.y) / 2},${l.source.x} ${(l.source.y + l.target.y) / 2},${l.target.x} ${l.target.y},${l.target.x}`}
                fill="none"
                stroke={l.target.data.rec?.kind === 'pruned' ? 'var(--line)' : 'rgba(196,166,255,0.45)'}
                strokeDasharray={l.target.data.rec?.kind === 'pruned' ? '3 3' : undefined}
                strokeWidth={1.5}
              />
            ))}
            {nodes.map((n, i) => {
              const rec = n.data.rec;
              if (!rec) {
                return (
                  <g key="root" transform={`translate(${n.y},${n.x})`}>
                    <rect x={-10} y={-8} width={16} height={16} fill="var(--accent)" />
                    <text x={10} y={-12} fontSize={11} fill="var(--text-dim)">
                      {t.tree.root}
                    </text>
                  </g>
                );
              }
              const c = tone(rec, ch3);
              const kids = built?.byId.get(rec.id)?.children.length ?? 0;
              const isCollapsed = collapsed.has(rec.id) && kids > 0;
              const isCurrent = current?.id === rec.id;
              return (
                <g
                  key={i}
                  transform={`translate(${n.y},${n.x})`}
                  role="treeitem"
                  aria-expanded={kids ? !isCollapsed : undefined}
                  aria-label={`${moverAt(rec.depth)}${rec.col + 1}, ${nodeText(rec, ch3)}`}
                  tabIndex={kids ? 0 : -1}
                  onClick={() => toggle(n)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(n))}
                  style={{ cursor: kids ? 'pointer' : 'default' }}
                >
                  <circle r={7} fill={c.fill} stroke={isCurrent ? 'var(--text)' : c.dashed ? 'var(--text-dim)' : 'none'} strokeWidth={isCurrent ? 2.5 : 1.2} strokeDasharray={c.dashed ? '2 2' : undefined} opacity={rec.kind === 'pruned' ? 0.7 : 1} />
                  {isCollapsed && (
                    <text x={-3.5} y={3.5} fontSize={10} fontWeight={700} fill="var(--bg)">
                      +
                    </text>
                  )}
                  <text x={11} y={4} fontSize={11} fontFamily="var(--font-mono)" fill={c.text}>
                    {moverAt(rec.depth)}
                    {rec.col + 1} {nodeText(rec, ch3)}
                    {isCollapsed ? ` (+${kids})` : ''}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        {ch3
          ? 'Labels show f = g + h. Green = goal (win), red = dead end, dashed grey = pruned (f above the limit).'
          : 'Values from the agent’s view: green = good, red = bad, dashed grey = pruned.'}{' '}
        Click a node to expand or collapse it.
      </p>
    </div>
  );
}

function nodeText(rec: TreeNodeRec, ch3: boolean): string {
  if (rec.kind !== 'pruned') return valueText(rec, ch3);
  return rec.label && rec.label !== 'pruned' ? `${t.tree.pruned} (${rec.label})` : t.tree.pruned;
}
