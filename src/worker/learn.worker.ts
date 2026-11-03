/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { TDTrainer, strengthVsHand, type TDParams, type TDProgress } from '../agents/learn/tdTrainer';
import { TD_TRAINED } from '../engine/learned/weights';

let runId = 0;

const api = {
  async train(p: TDParams, onProgress: (x: TDProgress) => void): Promise<TDProgress> {
    const id = ++runId;
    const T = new TDTrainer(p, p.init === 'trained' ? TD_TRAINED : undefined);
    const curve: TDProgress['curve'] = [];
    let best: TDProgress['best'] = null;
    const check = (ep: number) => {
      const w = Array.from(T.w);
      const r = strengthVsHand(w, p.evalDepth, p.evalGames, 1234);
      curve.push({ episode: ep, score: r.score, w: r.w, d: r.d, l: r.l });
      if (ep > 0 && (!best || r.score > best.score)) best = { episode: ep, score: r.score, weights: w };
    };
    check(0);
    let t0 = performance.now();
    let last = 0;
    let ms = 0;
    for (let ep = 1; ep <= p.episodes; ep++) {
      T.episode();
      if (ep % p.evalEvery === 0 || ep === p.episodes) check(ep);
      if (ep % 50 === 0 || ep === p.episodes) {
        const t = performance.now();
        ms = (t - t0) / Math.max(1, ep - last);
        t0 = t;
        last = ep;
        onProgress({ episode: ep, weights: Array.from(T.w), curve: [...curve], done: false, msPerGame: ms, best });
        await new Promise((r) => setTimeout(r, 0));
        if (id !== runId) break;
      }
    }
    const out: TDProgress = { episode: Math.min(p.episodes, last), weights: Array.from(T.w), curve, done: true, msPerGame: ms, best };
    onProgress(out);
    return out;
  },
  stop(): void {
    runId++;
  },
};

export type LearnWorkerApi = typeof api;
Comlink.expose(api);
