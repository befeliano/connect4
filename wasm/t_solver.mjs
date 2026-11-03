import fs from 'fs';
const buf = fs.readFileSync('solver.wasm');
const { instance } = await WebAssembly.instantiate(buf, {});
const X = instance.exports; X.c4_init(); X.c4_clear_tt(); X.c4_set_budget_k(0);
const lines = fs.readFileSync('ref.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
let n = 0, bad = 0, t0 = performance.now();
for (const r of lines) {
  if (r.solve[0] === -999 && r.solve.every(v => v === -999)) continue;
  X.c4_reset(); for (const ch of r.moves) X.c4_play(+ch - 1);
  for (let c = 0; c < 7; c++) {
    const v = X.c4_column(c, 0); const e = r.solve[c] === -999 ? 127 : r.solve[c];
    if (v !== e) { bad++; if (bad < 5) console.log('mismatch', r.moves, c, v, e); }
  }
  n++;
}
console.log('positions', n, 'mismatches', bad, 'ms', (performance.now() - t0).toFixed(0));
