import { presetConfig } from '../src/agents/presets';
import { runAgent } from '../src/agents/registry';
import { Board } from '../src/engine/board';
import { mulberry32, randInt } from '../src/engine/rng';

async function main() {
  const cfg = presetConfig('final');
  cfg.common.timeLimitMs = Infinity;
  cfg.common.seed = 1;
  cfg.common.recordTree = 'off';
  const rng = mulberry32(7);
  const byPly: Record<number, number[]> = {};
  for (let g = 0; g < 6; g++) {
    const moves: number[] = [];
    const b = new Board();
    while (!b.isOver()) {
      let col: number;
      const t0 = performance.now();
      if (b.count % 2 === g % 2) {
        const d = await runAgent({ moves: [...moves] }, cfg, () => {}, { aborted: false });
        col = d.col;
        const ms = performance.now() - t0;
        (byPly[b.count] ??= []).push(ms);
        if (g === 0) console.log(b.count, d.level, col + 1, Math.round(ms) + 'ms', d.stats.expanded);
      } else {
        const l = b.legalMoves();
        col = l[randInt(rng, l.length)];
      }
      moves.push(col);
      b.play(col);
    }
  }
  const all = Object.entries(byPly).map(([p, v]) => [Number(p), Math.max(...v)]);
  console.log('max ms by ply', JSON.stringify(all));
}
main();
