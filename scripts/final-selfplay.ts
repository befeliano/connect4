import { presetConfig } from '../src/agents/presets';
import { runAgent } from '../src/agents/registry';
import { Board } from '../src/engine/board';
import { randomOpening } from '../src/arena/series';

async function main() {
  const cfg = presetConfig('final');
  cfg.common.timeLimitMs = Infinity;
  cfg.common.seed = 1;
  cfg.common.recordTree = 'off';
  const worst: Record<string, number> = {};
  for (let g = 0; g < 8; g++) {
    const moves = randomOpening(4, 100 + g);
    const b = Board.fromMoves(moves);
    while (!b.isOver()) {
      const t0 = performance.now();
      const d = await runAgent({ moves: [...moves] }, cfg, () => {}, { aborted: false });
      const ms = performance.now() - t0;
      const k = `${d.level}@${b.count}`;
      worst[k] = Math.max(worst[k] ?? 0, Math.round(ms));
      moves.push(d.col);
      b.play(d.col);
    }
    console.log('game', g, moves.map((c) => c + 1).join(''), b.lastWins ? `winner ${b.count % 2 ? 'P1' : 'P2'}` : 'draw');
  }
  console.log(JSON.stringify(worst));
}
main();
