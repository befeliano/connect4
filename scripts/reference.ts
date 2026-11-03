import { Board, parseMoves } from '../src/engine/board';
import { hCost } from '../src/engine/heuristics';
import {
  EXPECTED,
  INF_COST,
  buildStateSpace,
  compareMethods,
  openingBoards,
  solveAndCheck,
} from '../src/reference/reproduce';
import { boardFromKey } from '../src/engine/model';
import { SearchContext } from '../src/agents/context';
import { astar } from '../src/agents/ch3/astar';

let failures = 0;
const check = (label: string, got: number | string, want: number | string) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (expected ${want})`}`);
};
const fmt = (n: number) => n.toLocaleString('en-US');
const t0 = Date.now();

console.log('A. building the state space of the model ...');
const layers = buildStateSpace();
console.log('   computing the true cost of every state ...');
const { trueCosts, stats: st } = solveAndCheck(layers);
const states = layers.reduce((s, l) => s + l.length, 0);
console.log(`   states (our turn, game not over) : ${fmt(st.states)}`);
console.log(`   longest game                     : ${layers.length} moves`);
console.log(`   true cost from the empty board   : ${trueCosts[0][0]} moves, h = ${hCost(new Board(), 1)}`);
console.log(`   states with a win still possible : ${fmt(st.winnable)} (${((100 * st.winnable) / st.states).toFixed(1)}%)`);
check('reachable states', states, EXPECTED.states);
check('longest game', layers.length, EXPECTED.longestGame);
check('true cost from empty board', trueCosts[0][0], EXPECTED.trueCostEmpty);
check('h(empty)', hCost(new Board(), 1), EXPECTED.hEmpty);

console.log('B. heuristic, checked on the whole state space');
console.log(`   admissible  h <= h*     : ${st.admissibleViolations} violations in ${fmt(st.states)} states`);
console.log(`   consistent  h <= 1 + h' : ${st.consistentViolations} violations in ${fmt(st.transitions)} transitions`);
console.log(
  `   mean h = ${(st.sumH / st.winnable).toFixed(2)}, mean true cost = ${(st.sumTrue / st.winnable).toFixed(2)}, ` +
    `h exact on ${((100 * st.exact) / st.winnable).toFixed(1)}% of winnable states`,
);
check('admissibility violations', st.admissibleViolations, 0);
check('consistency violations', st.consistentViolations, 0);
check('transitions checked', st.transitions, EXPECTED.transitions);

const boards = openingBoards(layers, trueCosts, 4);
const costs = boards.map((b) => b.cost);
console.log(
  `C. search methods on all ${boards.length} opening boards (at most 4 of our moves played; true cost ` +
    `${Math.min(...costs)} to ${Math.max(...costs)}, mean ${(costs.reduce((a, b) => a + b, 0) / boards.length).toFixed(2)})`,
);
check('opening boards', boards.length, EXPECTED.boards);
const rows = compareMethods(boards);
console.log(`   ${'method'.padEnd(20)}${'solved'.padStart(8)}${'fastest win'.padStart(13)}${'expansions'.padStart(12)}${'memory'.padStart(9)}   empty board`);
for (const r of rows) {
  console.log(
    `   ${r.name.padEnd(20)}${String(r.solved).padStart(8)}${String(r.optimal).padStart(13)}` +
      `${r.meanExpansions.toFixed(1).padStart(12)}${r.meanMemory.toFixed(1).padStart(9)}` +
      `   win in ${r.empty.cost}, ${r.empty.expansions} expansions, ${r.empty.memory} states`,
  );
}
for (const r of rows) {
  const e = EXPECTED.table[r.name];
  check(`${r.name} optimal`, r.optimal, e.optimal);
  check(`${r.name} expansions`, r.meanExpansions.toFixed(1), e.expansions.toFixed(1));
  check(`${r.name} memory`, r.meanMemory.toFixed(1), e.memory.toFixed(1));
}

console.log('D. example board from the Assignment 3 report');
const ex = Board.fromMoves(parseMoves('354344'));
const exH = hCost(ex, ex.turn);
const exCost = astar(boardFromKey(ex.exactKey()), {
  heuristic: (b) => hCost(b, ex.turn),
  depthCap: Infinity,
  useReachedSet: true,
  ctx: new SearchContext(),
}).cost;
console.log(ex.toString().replace(/^/gm, '   '));
check('example h', exH, 2);
check('example true cost', exCost ?? INF_COST, 4);

console.log(`time: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(failures === 0 ? 'ALL REFERENCE NUMBERS MATCH' : `${failures} MISMATCH(ES)`);
process.exit(failures === 0 ? 0 : 1);
