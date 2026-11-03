#!/usr/bin/env python3

import heapq
import sys
import time

W, H = 7, 6
H1 = H + 1
BOTTOM = sum(1 << (c * H1) for c in range(W))
BOARD = BOTTOM * ((1 << H) - 1)
COLUMN = [((1 << H) - 1) << (c * H1) for c in range(W)]
TOP = [1 << (c * H1 + H - 1) for c in range(W)]
CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6]
INF = float("inf")
GOAL, DEAD = "GOAL", None

def cell(c, r):
    return 1 << (c * H1 + r)

def all_lines():
    lines = []
    for c in range(W):
        for r in range(H):
            for dc, dr in ((1, 0), (0, 1), (1, 1), (1, -1)):
                cells = [(c + i * dc, r + i * dr) for i in range(4)]
                if all(0 <= x < W and 0 <= y < H for x, y in cells):
                    lines.append(sum(cell(x, y) for x, y in cells))
    return lines

LINES = all_lines()
assert len(LINES) == 69

def has_four(p):
    m = p & (p >> H1)
    if m & (m >> (2 * H1)):
        return True
    m = p & (p >> H)
    if m & (m >> (2 * H)):
        return True
    m = p & (p >> (H + 2))
    if m & (m >> (2 * (H + 2))):
        return True
    m = p & (p >> 1)
    return bool(m & (m >> 2))

def winning_cells(p, mask):
    r = (p << 1) & (p << 2) & (p << 3)
    for s in (H1, H, H + 2):
        q = (p << s) & (p << (2 * s))
        r |= q & (p << (3 * s))
        r |= q & (p >> s)
        q = (p >> s) & (p >> (2 * s))
        r |= q & (p << s)
        r |= q & (p >> (3 * s))
    return r & (BOARD ^ mask)

def h(me, mask):
    opp = mask ^ me
    best = -1
    for line in LINES:
        if not (opp & line):
            k = (me & line).bit_count()
            if k > best:
                best = k
    return INF if best < 0 else 4 - best

def h_zero(me, mask):
    return 0

def opponent_reply(me, mask):
    opp = mask ^ me
    playable = (mask + BOTTOM) & BOARD
    for target in (winning_cells(opp, mask) & playable,
                   winning_cells(me, mask) & playable,
                   playable):
        if target:
            for c in CENTRE_FIRST:
                if target & COLUMN[c]:
                    return target & COLUMN[c]
    return 0

def result(me, mask, c):
    move = (mask + (1 << (c * H1))) & COLUMN[c]
    me |= move
    mask |= move
    if has_four(me):
        return GOAL
    if mask == BOARD:
        return DEAD
    mask |= opponent_reply(me, mask)
    if has_four(mask ^ me) or mask == BOARD:
        return DEAD
    return (me, mask)

def actions(mask):
    return [c for c in range(W) if not (mask & TOP[c])]

def build_state_space():
    layers = [[(0, 0)]]
    while layers[-1]:
        nxt = set()
        for me, mask in layers[-1]:
            for c in actions(mask):
                s = result(me, mask, c)
                if s is not GOAL and s is not DEAD:
                    nxt.add(s)
        layers.append(sorted(nxt))
    layers.pop()
    return layers

def solve_and_check(layers):
    stats = dict(states=0, transitions=0, adm=0, con=0, winnable=0,
                 exact=0, sum_h=0, sum_true=0)
    true_costs = [None] * len(layers)
    nxt = {}
    for k in range(len(layers) - 1, -1, -1):
        cur, costs = {}, []
        for me, mask in layers[k]:
            hn = h(me, mask)
            best = INF
            for c in actions(mask):
                s = result(me, mask, c)
                if s is GOAL:
                    h_next, best = 0, 1
                elif s is DEAD:
                    continue
                else:
                    h_next, cost_next = nxt[s]
                    if cost_next + 1 < best:
                        best = cost_next + 1
                stats["transitions"] += 1
                if hn > 1 + h_next:
                    stats["con"] += 1
            stats["states"] += 1
            if hn > best:
                stats["adm"] += 1
            if best is not INF:
                stats["winnable"] += 1
                stats["sum_h"] += hn
                stats["sum_true"] += best
                stats["exact"] += (hn == best)
            cur[(me, mask)] = (hn, best)
            costs.append(best)
        true_costs[k] = costs
        nxt = cur
    return true_costs, stats

def bfs(state):
    frontier, reached, expansions, depth = [state], {state}, 0, 0
    while frontier:
        depth += 1
        nxt = []
        for me, mask in frontier:
            expansions += 1
            for c in actions(mask):
                s = result(me, mask, c)
                if s is GOAL:
                    return depth, expansions, len(reached)
                if s is not DEAD and s not in reached:
                    reached.add(s)
                    nxt.append(s)
        frontier = nxt
    return None, expansions, len(reached)

def dfs(state, budget=2_000_000):
    expansions = peak = 0

    def visit(me, mask, g):
        nonlocal expansions, peak
        expansions += 1
        peak = max(peak, g + 1)
        if expansions > budget:
            raise RuntimeError("budget")
        for c in actions(mask):
            s = result(me, mask, c)
            if s is GOAL:
                return g + 1
            if s is not DEAD:
                found = visit(s[0], s[1], g + 1)
                if found:
                    return found
        return None

    try:
        return visit(state[0], state[1], 0), expansions, peak
    except RuntimeError:
        return None, expansions, peak

def best_first(state, priority):
    tie = 0
    heap = [(priority(0, h(*state)), tie, 0, state)]
    best_g = {state: 0}
    expansions = 0
    while heap:
        _, _, g, s = heapq.heappop(heap)
        if s is GOAL:
            return g, expansions, len(best_g)
        if best_g[s] < g:
            continue
        expansions += 1
        me, mask = s
        for c in actions(mask):
            t = result(me, mask, c)
            if t is DEAD:
                continue
            tie += 1
            if t is GOAL:
                heapq.heappush(heap, (priority(g + 1, 0), tie, g + 1, GOAL))
            elif g + 1 < best_g.get(t, INF):
                best_g[t] = g + 1
                heapq.heappush(heap, (priority(g + 1, h(*t)), tie, g + 1, t))
    return None, expansions, len(best_g)

def ida_star(state, heuristic):
    expansions = peak = 0

    def visit(me, mask, g, limit):
        nonlocal expansions, peak
        expansions += 1
        peak = max(peak, g + 1)
        smallest = INF
        for c in actions(mask):
            s = result(me, mask, c)
            if s is GOAL:
                if g + 1 <= limit:
                    return True, g + 1
                smallest = min(smallest, g + 1)
            elif s is not DEAD:
                f = g + 1 + heuristic(*s)
                if f > limit:
                    smallest = min(smallest, f)
                else:
                    found, value = visit(s[0], s[1], g + 1, limit)
                    if found:
                        return True, value
                    smallest = min(smallest, value)
        return False, smallest

    limit = heuristic(*state)
    while limit is not INF:
        found, value = visit(state[0], state[1], 0, limit)
        if found:
            return value, expansions, peak
        limit = value
    return None, expansions, peak

METHODS = [
    ("Breadth-first", bfs),
    ("Depth-first", dfs),
    ("Iterative deepening", lambda s: ida_star(s, h_zero)),
    ("Greedy best-first", lambda s: best_first(s, lambda g, hh: hh)),
    ("A*", lambda s: best_first(s, lambda g, hh: g + hh)),
    ("IDA*", lambda s: ida_star(s, h)),
]

def main(opening_moves=4):
    t0 = time.time()
    print("A. building the state space of the model ...", flush=True)
    layers = build_state_space()
    print("   computing the true cost of every state ...", flush=True)
    true_costs, st = solve_and_check(layers)
    print(f"   states (our turn, game not over) : {st['states']:,}")
    print(f"   longest game                     : {len(layers)} moves")
    print(f"   true cost from the empty board   : {true_costs[0][0]} moves, "
          f"h = {h(0, 0)}")
    print(f"   states with a win still possible : {st['winnable']:,} "
          f"({100 * st['winnable'] / st['states']:.1f}%)")
    print("B. heuristic, checked on the whole state space")
    print(f"   admissible  h <= h*     : {st['adm']} violations "
          f"in {st['states']:,} states")
    print(f"   consistent  h <= 1 + h' : {st['con']} violations "
          f"in {st['transitions']:,} transitions")
    print(f"   mean h = {st['sum_h'] / st['winnable']:.2f}, "
          f"mean true cost = {st['sum_true'] / st['winnable']:.2f}, "
          f"h exact on {100 * st['exact'] / st['winnable']:.1f}% "
          f"of winnable states")

    boards = [(s, cost)
              for layer, costs in zip(layers[:opening_moves + 1], true_costs)
              for s, cost in zip(layer, costs) if cost is not INF]
    n = len(boards)
    print(f"C. search methods on all {n} opening boards (at most "
          f"{opening_moves} of our moves played; true cost "
          f"{min(c for _, c in boards)} to {max(c for _, c in boards)}, "
          f"mean {sum(c for _, c in boards) / n:.2f})")
    print(f"   {'method':<20}{'solved':>8}{'fastest win':>13}"
          f"{'expansions':>12}{'memory':>9}   empty board")
    for name, method in METHODS:
        solved = optimal = expansions = memory = 0
        for s, cost in boards:
            found, e, m = method(s)
            solved += found is not None
            optimal += (found == cost)
            expansions += e
            memory += m
        found, e, m = method((0, 0))
        print(f"   {name:<20}{solved:>8}{optimal:>13}"
              f"{expansions / n:>12.1f}{memory / n:>9.1f}"
              f"   win in {found}, {e} expansions, {m} states")
    print("   expansions = nodes whose children were generated, mean per board")
    print("   memory     = most states held at once, mean per board")
    print(f"time: {time.time() - t0:.0f} s")

if __name__ == "__main__":
    sys.setrecursionlimit(10_000)
    main()
