import { describe, expect, it } from 'vitest';
import { wilson, summarise } from '../../src/arena/stats';
import { playGame, randomOpening, seriesConfig, DEFAULT_SETTINGS } from '../../src/arena/series';
import { decodeArena, encodeArena } from '../../src/arena/share';
import { presetConfig } from '../../src/agents/presets';
import { runAgent } from '../../src/agents/registry';
import { Board } from '../../src/engine/board';

function strongAB() {
  const c = presetConfig('medium');
  c.search.iterativeDeepening = true;
  c.search.moveOrdering = 'killerHistory';
  c.search.transpositionTable = true;
  c.search.ttSizeMB = 32;
  c.common.timeLimitMs = 1500;
  c.common.minThinkMs = 400;
  c.search.depth = 4;
  return c;
}

const never = { aborted: false };

describe('arena statistics', () => {
  it('Wilson interval', () => {
    const w = wilson(15, 20);
    expect(w.p).toBe(0.75);
    expect(w.lo).toBeCloseTo(0.531, 2);
    expect(w.hi).toBeCloseTo(0.888, 2);
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 0 });
  });
});

describe('arena series', () => {
  it('random openings are reproducible and never end the game', () => {
    for (let s = 0; s < 50; s++) {
      const o = randomOpening(6, s);
      expect(o).toEqual(randomOpening(6, s));
      expect(Board.fromMoves(o).isOver()).toBe(false);
    }
  });

  it('Chapter 3 agent beats the rule-based opponent it was designed for', async () => {
    const red = seriesConfig(presetConfig('ch3'), { ...DEFAULT_SETTINGS, speed: 'instant' }, 1);
    const rule = presetConfig('medium');
    rule.algorithm = 'rule';
    const yellow = seriesConfig(rule, { ...DEFAULT_SETTINGS, speed: 'instant' }, 2);
    const games = [];
    for (let i = 0; i < 4; i++) {
      const starter = i % 2 === 0 ? 'red' : 'yellow';
      games.push(
        await playGame(i, 0, { red, yellow }, starter, [], {
          think: (_side, pos, cfg) => runAgent(pos, cfg, () => {}, never),
        }),
      );
    }
    const sum = summarise(games);
    expect(sum.sides.red.wins).toBe(4);
    expect(sum.sides.yellow.losses).toBe(4);
    expect(sum.sides.red.avgNodes).toBeGreaterThan(0);
  });

  it('share links round-trip both configs', () => {
    const red = strongAB();
    const yellow = presetConfig('easy');
    const url = encodeArena({ red, yellow, settings: { ...DEFAULT_SETTINGS, games: 42 } }, 'https://x.test');
    const a = decodeArena(new URL(url).searchParams.get('arena')!);
    expect(a?.red).toEqual(red);
    expect(a?.yellow).toEqual(yellow);
    expect(a?.settings.games).toBe(42);
  });
});
