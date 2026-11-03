import { runBenchmark } from '../src/agents/benchmark';

const rows = await runBenchmark();
console.log(`${'agent'.padEnd(12)}${'position'.padEnd(12)}${'depth'.padStart(6)}${'nodes'.padStart(12)}${'ms'.padStart(8)}${'nodes/s'.padStart(12)}`);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(12)}${r.position.padEnd(12)}${String(r.depth).padStart(6)}${r.nodes.toLocaleString('en-US').padStart(12)}` +
      `${String(r.ms).padStart(8)}${r.nodesPerSec.toLocaleString('en-US').padStart(12)}`,
  );
}
for (const name of ['Minimax', 'Alpha-beta']) {
  const sel = rows.filter((r) => r.name === name);
  const nodes = sel.reduce((s, r) => s + r.nodes, 0);
  const ms = sel.reduce((s, r) => s + r.ms, 0);
  console.log(`${name}: ${Math.round((nodes * 1000) / Math.max(1, ms)).toLocaleString('en-US')} nodes/s overall`);
}
