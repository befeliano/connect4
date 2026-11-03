import { ALGORITHM_NAMES } from '../agents/registry';
import { familyOf, type AgentConfig, type MoveDecision } from '../agents/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const colName = (c: number) => `column ${c + 1}`;

export function explainMove(d: MoveDecision, config: AgentConfig): string {
  const name = ALGORITHM_NAMES[config.algorithm];
  const s = d.stats;
  const fam = familyOf(config.algorithm);
  const parts: string[] = [];
  const chosen = d.columnScores[d.col];

  if (fam === 'final') {
    const lvl = d.level === 'solve' ? 'the exact solver (level 3)' : d.level === 'plan' ? 'the opening plan (level 1)' : 'alpha-beta with the learned evaluation (level 2)';
    parts.push(`The final agent handed this move to ${lvl}.`);
    if (d.levelNote) parts.push(d.levelNote);
    parts.push(d.reason);
    if (d.level === 'search') {
      const ratio = s.pruned + s.generated > 0 ? (100 * s.pruned) / (s.pruned + s.generated) : 0;
      parts.push(`It expanded ${fmt(s.expanded)} nodes in ${secs(s.elapsedMs)} and pruned ${Math.round(ratio)}% of branches.`);
    }
  } else if (fam === 'ch6' && config.algorithm !== 'mcts') {
    const depth = s.depthCompleted || config.search.depth;
    let first = `${name} searched ${depth} plies in ${secs(s.elapsedMs)}, expanded ${fmt(s.expanded)} nodes`;
    if (config.algorithm === 'alphabeta') {
      const ratio = s.pruned + s.generated > 0 ? (100 * s.pruned) / (s.pruned + s.generated) : 0;
      first += ` and pruned ${Math.round(ratio)}% of branches`;
      if (s.ttHits) first += ` (${fmt(s.ttHits)} transposition-table hits)`;
    }
    parts.push(first + '.');
    const notes: string[] = [];
    if (chosen) notes.push(`${capital(colName(d.col))} ${scorePhrase(chosen.label, chosen.proven)}`);
    const losers = d.columnScores.filter((c) => c.col !== d.col && c.proven === 'loss');
    for (const l of losers.slice(0, 2)) notes.push(`${colName(l.col)} ${scorePhrase(l.label, l.proven)}`);
    if (!losers.length) {
      const others = d.columnScores.filter((c) => c.col !== d.col && c.score !== null).sort((a, b) => (b.score as number) - (a.score as number));
      if (others[0]) notes.push(`the next best, ${colName(others[0].col)}, ${scorePhrase(others[0].label, others[0].proven)}`);
    }
    if (notes.length) parts.push(notes.join('; ') + '.');
    if (s.stopReason === 'time') parts.push('The time limit stopped the next depth, so the last completed depth decided.');
  } else if (config.algorithm === 'mcts') {
    parts.push(`MCTS ran ${fmt(s.iterations)} playouts in ${secs(s.elapsedMs)} and grew a tree of ${fmt(s.treeSize)} nodes.`);
    const ranked = d.columnScores.filter((c) => c.visits).sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0));
    if (chosen?.visits !== undefined) {
      parts.push(`${capital(colName(d.col))} got ${fmt(chosen.visits)} visits with a ${Math.round((chosen.winRate ?? 0) * 100)}% win rate in the playouts.`);
    }
    const runner = ranked.find((c) => c.col !== d.col);
    if (runner) parts.push(`Runner-up: ${colName(runner.col)} (${fmt(runner.visits ?? 0)} visits, ${Math.round((runner.winRate ?? 0) * 100)}%).`);
  } else if (fam === 'ch3') {
    const limit = s.fLimit !== null ? ` under a final f-limit of ${s.fLimit}` : '';
    if (d.planFound) {
      const ours = d.pv.filter((_, i) => i % 2 === 0).map((c) => c + 1);
      parts.push(`${name} expanded ${fmt(s.expanded)} nodes${limit} and found a plan to win in ${ours.length} of our moves (${ours.join(' → ')}) inside the Chapter 3 model.`);
      parts.push('The plan assumes the opponent always replies win → block → centre; it is optimal only inside that model, not in the real two-player game.');
    } else {
      parts.push(`${name} expanded ${fmt(s.expanded)} nodes${limit} without finding a win in the model, so it used its fallback.`);
    }
    if (d.deviated) parts.push('The real opponent left the model, so the agent threw the old plan away and re-planned from the new board.');
  } else {
    parts.push(d.reason);
  }
  if (d.randomised && config.algorithm !== 'random') {
    if (config.common.epsilon > 0 || config.common.temperature > 0) parts.push(`Randomisation changed the move: ${d.reason.split('. ').pop()}`);
  }
  return parts.join(' ');
}

function scorePhrase(label: string, proven: string | null): string {
  if (proven === 'win') return label.toLowerCase().startsWith('win') ? `wins (${label.toLowerCase()})` : label.toLowerCase();
  if (proven === 'loss') return label.toLowerCase();
  return `scores ${label}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
