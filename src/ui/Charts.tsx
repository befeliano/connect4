import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DepthPoint, ColumnScore } from '../agents/types';
import { t } from '../i18n/en';

const axis = { stroke: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)' };
const grid = { stroke: 'var(--line)', strokeDasharray: '2 4' };
const tooltipStyle = {
  contentStyle: { background: 'var(--timing-bg)', border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#f4eefb' },
  labelStyle: { color: '#bfaee0' },
  itemStyle: { color: '#f4eefb' },
  cursor: { stroke: 'var(--accent)', strokeWidth: 1, fill: 'rgba(196,166,255,0.08)' },
};
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));

function ChartFrame({ title, children, summary }: { title: string; children: React.ReactElement; summary: string }) {
  return (
    <figure className="m-0 mb-3">
      <figcaption className="label mb-1">{title}</figcaption>
      <div className="h-[130px]" role="img" aria-label={`${title}: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function NodesChart({ series }: { series: { t: number; nodes: number }[] }) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  return (
    <ChartFrame title={t.panel.nodesVsTime} summary={`${Math.round(last.nodes)} nodes after ${Math.round(last.t)} ms`}>
      <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tickFormatter={(v) => `${Math.round(v)}ms`} {...axis} tickLine={false} />
        <YAxis tickFormatter={fmt} {...axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip {...tooltipStyle} formatter={(v) => [Number(v).toLocaleString('en-US'), 'nodes']} labelFormatter={(v) => `${Math.round(Number(v))} ms`} />
        <Line type="monotone" dataKey="nodes" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartFrame>
  );
}

export function DepthChart({ points, ch3 }: { points: DepthPoint[]; ch3: boolean }) {
  if (points.length < 1) return null;
  const data = points.map((p) => ({ depth: p.depth, nodes: p.nodes }));
  return (
    <ChartFrame title={ch3 ? `${t.panel.depthPerIteration} (f-limit)` : t.panel.depthPerIteration} summary={`${points.length} iterations, deepest ${points[points.length - 1].depth}`}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -10 }} barCategoryGap={2}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey="depth" {...axis} tickLine={false} />
        <YAxis tickFormatter={fmt} {...axis} tickLine={false} axisLine={false} width={44} scale="sqrt" />
        <Tooltip {...tooltipStyle} formatter={(v) => [Number(v).toLocaleString('en-US'), 'nodes']} labelFormatter={(v) => `${ch3 ? 'f-limit' : 'depth'} ${v}`} />
        <Bar dataKey="nodes" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

export function VisitsChart({ scores }: { scores: ColumnScore[] }) {
  const data = scores.map((s) => ({ col: s.col + 1, visits: s.visits ?? 0, win: s.winRate ?? 0 }));
  if (!data.some((d) => d.visits)) return null;
  return (
    <ChartFrame title={t.panel.visits} summary={data.map((d) => `column ${d.col}: ${d.visits}`).join(', ')}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -10 }} barCategoryGap={2}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey="col" {...axis} tickLine={false} />
        <YAxis tickFormatter={fmt} {...axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v, _n, item) => [`${Number(v).toLocaleString('en-US')} visits · ${Math.round((item.payload as { win: number }).win * 100)}% wins`, '']}
          labelFormatter={(v) => `Column ${v}`}
        />
        <Bar dataKey="visits" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}
