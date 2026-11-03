# Connect 4 Lab · Team Cluster

Introduction to AI (152117107), Eskişehir Osmangazi University.
Burak Efe Şahin and Vahit Furkan Bozdemir.

A Connect 4 game in the browser with agents whose every parameter can be changed and whose reasoning is shown while they think.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit and integration tests
npm run build      # production build in dist/
```

## Playing

- **Human vs agent**, **hot-seat** (two people on one screen) and **agent vs agent**.
- **Difficulty:** Easy, Medium, Hard. Hard is our final agent.
- **User mode / Developer mode** (top bar or key `D`). User mode shows the move and which level of the agent decided it. Developer mode shows every parameter, the live search numbers and a diagnosis of the position.
- **Learn tab:** TD(λ) self-play training in the browser; the learned weights can be given to the agent.
- **Arena:** series between any two agents under the same conditions (alternating colours, the same random openings), with ready-made comparisons.

Keys: `1`–`7` drop a disc, `←` `→` `Enter` choose and drop, `U` undo, `N` new game, `D` user / developer mode, `Space` pause or step in agent vs agent.

## Agents

| Preset | What it is |
|---|---|
| Ch 3–4 agent | IDA* plan against a fixed-rule opponent model (Assignment 3). |
| Ch 6 agent | Alpha-beta, depth 6, hand-made evaluation. |
| Ch 19–22 agent | The same search with learned evaluations at the leaves. |
| Final agent | Three levels: opening plan (centre), alpha-beta with the learned committee evaluation, exact solver from 16 discs on. |

Learned evaluations: logistic regression on 13 board features, TD(λ) self-play weights, a 97-128-64-3 neural network, and a committee that averages them. The exact solver (negamax with alpha-beta, transposition table, bitboards) is compiled to WebAssembly from `wasm/solver.c`.

## Layout

```
src/engine     board, lines, evaluation, learned models, solver
src/agents     search agents (Ch 3, Ch 6), final agent, TD trainer
src/ui         panels and controls
src/scene      3D board
src/arena      series between agents
src/worker     agents run in web workers
tests          unit and integration tests
reference      Assignment 3 reference script and its output
wasm           solver source and reference positions
```
