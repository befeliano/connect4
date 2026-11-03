import { TDTrainer, strengthVsHand, DEFAULT_TD } from '../src/agents/learn/tdTrainer';
import { TD_TRAINED } from '../src/engine/learned/weights';
const T = new TDTrainer({ ...DEFAULT_TD });
console.log('zero', strengthVsHand(Array.from(T.w), 2, 40, 1234));
const t0 = performance.now();
for (let i = 1; i <= 3000; i++) { T.episode(); if (i % 1000 === 0) console.log(i, strengthVsHand(Array.from(T.w), 2, 40, 1234), ((performance.now() - t0) / i).toFixed(2) + ' ms/game'); }
console.log('trained offline', strengthVsHand(TD_TRAINED, 2, 40, 1234));
console.log(Array.from(T.w).map((x) => x.toFixed(2)).join(' '));
