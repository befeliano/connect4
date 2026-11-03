typedef unsigned long long u64;
typedef unsigned int u32;
#define W 7
#define H 6
#define EXPORT __attribute__((visibility("default")))

static const int ORDER[W] = {3, 2, 4, 1, 5, 0, 6};
static u64 BOTTOM, BOARD_MASK;
static inline u64 topBit(int c) { return (1ULL << (H - 1)) << (c * (H + 1)); }
static inline u64 botBit(int c) { return 1ULL << (c * (H + 1)); }
static inline u64 colMask(int c) { return ((1ULL << H) - 1) << (c * (H + 1)); }
static inline int popc(u64 x) { return __builtin_popcountll(x); }

static u64 winningCells(u64 p, u64 mask) {
  u64 r = (p << 1) & (p << 2) & (p << 3);
  u64 q = (p << (H + 1)) & (p << 2 * (H + 1));
  r |= q & (p << 3 * (H + 1)); r |= q & (p >> (H + 1));
  q = (p >> (H + 1)) & (p >> 2 * (H + 1));
  r |= q & (p << (H + 1)); r |= q & (p >> 3 * (H + 1));
  q = (p << H) & (p << 2 * H);
  r |= q & (p << 3 * H); r |= q & (p >> H);
  q = (p >> H) & (p >> 2 * H);
  r |= q & (p << H); r |= q & (p >> 3 * H);
  q = (p << (H + 2)) & (p << 2 * (H + 2));
  r |= q & (p << 3 * (H + 2)); r |= q & (p >> (H + 2));
  q = (p >> (H + 2)) & (p >> 2 * (H + 2));
  r |= q & (p << (H + 2)); r |= q & (p >> 3 * (H + 2));
  return r & (BOARD_MASK ^ mask);
}

typedef struct { u64 cur, mask; int moves; } Pos;
static inline int canPlay(const Pos* p, int c) { return (p->mask & topBit(c)) == 0; }
static inline void play(Pos* p, int c) { p->cur ^= p->mask; p->mask |= p->mask + botBit(c); p->moves++; }
static inline void playMask(Pos* p, u64 m) { p->cur ^= p->mask; p->mask |= m; p->moves++; }
static inline u64 possible(const Pos* p) { return (p->mask + BOTTOM) & BOARD_MASK; }
static inline u64 winPos(const Pos* p) { return winningCells(p->cur, p->mask); }
static inline u64 oppWinPos(const Pos* p) { return winningCells(p->cur ^ p->mask, p->mask); }
static inline int canWinNext(const Pos* p) { return (winPos(p) & possible(p)) != 0; }
static inline int isWinMove(const Pos* p, int c) { return (winPos(p) & possible(p) & colMask(c)) != 0; }
static u64 nonLosing(const Pos* p) {
  u64 pm = possible(p), ow = oppWinPos(p);
  u64 forced = pm & ow;
  if (forced) { if (forced & (forced - 1)) return 0; pm = forced; }
  return pm & ~(ow >> 1);
}
static inline int moveScore(const Pos* p, u64 m) { return popc(winningCells(p->cur | m, p->mask)); }
static u64 mirror(u64 x) {
  u64 r = 0;
  for (int c = 0; c < W; c++) r |= ((x >> (c * (H + 1))) & ((1ULL << (H + 1)) - 1)) << ((W - 1 - c) * (H + 1));
  return r;
}
static inline u64 symKey(const Pos* p) { u64 a = p->cur + p->mask, b = mirror(p->cur) + mirror(p->mask); return a < b ? a : b; }

#define TT_BITS 21
#define TT_SIZE (1u << TT_BITS)
static u64 tt[TT_SIZE];
static u64 nodes, nodeLimit;
static int aborted;
static Pos root;

static inline int ttGet(u64 k) { u64 e = tt[k % TT_SIZE]; return ((e >> 8) == k) ? (int)(e & 255) : 0; }
static inline void ttPut(u64 k, int v) { tt[k % TT_SIZE] = (k << 8) | (u64)(v & 255); }

static int negamax(const Pos* P, int alpha, int beta) {
  if (aborted) return 0;
  if (++nodes > nodeLimit) { aborted = 1; return 0; }
  u64 next = nonLosing(P);
  if (next == 0) return -(W * H - P->moves) / 2;
  if (P->moves >= W * H - 2) return 0;
  int mn = -(W * H - 2 - P->moves) / 2;
  if (alpha < mn) { alpha = mn; if (alpha >= beta) return alpha; }
  int mx = (W * H - 1 - P->moves) / 2;
  if (beta > mx) { beta = mx; if (alpha >= beta) return beta; }
  u64 k = symKey(P);
  int v = ttGet(k);
  if (v) { mx = v - 19; if (beta > mx) { beta = mx; if (alpha >= beta) return beta; } }
  u64 mv[W]; int sc[W]; int n = 0;
  for (int i = W - 1; i >= 0; i--) {
    u64 m = next & colMask(ORDER[i]);
    if (m) { int s = moveScore(P, m); int j = n++; while (j > 0 && sc[j - 1] > s) { sc[j] = sc[j - 1]; mv[j] = mv[j - 1]; j--; } sc[j] = s; mv[j] = m; }
  }
  for (int i = n - 1; i >= 0; i--) {
    Pos Q = *P; playMask(&Q, mv[i]);
    int s = -negamax(&Q, -beta, -alpha);
    if (aborted) return 0;
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  ttPut(k, alpha + 19);
  return alpha;
}

static int solvePos(const Pos* p, int weak) {
  if (canWinNext(p)) return (W * H + 1 - p->moves) / 2;
  int mn = -(W * H - p->moves) / 2, mx = (W * H + 1 - p->moves) / 2;
  if (weak) { mn = -1; mx = 1; }
  while (mn < mx && !aborted) {
    int med = mn + (mx - mn) / 2;
    if (med <= 0 && mn / 2 < med) med = mn / 2; else if (med >= 0 && mx / 2 > med) med = mx / 2;
    int r = negamax(p, med, med + 1);
    if (aborted) break;
    if (r <= med) mx = r; else mn = r;
  }
  return mn;
}

EXPORT void c4_init(void) {
  BOTTOM = 0; for (int c = 0; c < W; c++) BOTTOM |= 1ULL << (c * (H + 1));
  BOARD_MASK = BOTTOM * ((1ULL << H) - 1);
  root.cur = root.mask = 0; root.moves = 0;
}
EXPORT void c4_clear_tt(void) { for (u32 i = 0; i < TT_SIZE; i++) tt[i] = 0; }
EXPORT void c4_reset(void) { root.cur = root.mask = 0; root.moves = 0; }

EXPORT int c4_play(int c) { if (c < 0 || c >= W || !canPlay(&root, c)) return 0; play(&root, c); return 1; }
EXPORT int c4_moves(void) { return root.moves; }

EXPORT void c4_set_budget_k(u32 k) { nodeLimit = k ? (u64)k * 1000ULL : ~0ULL; }
EXPORT double c4_nodes(void) { return (double)nodes; }
EXPORT int c4_aborted(void) { return aborted; }

EXPORT int c4_solve(int weak) { nodes = 0; aborted = 0; return solvePos(&root, weak); }

EXPORT int c4_column(int c, int weak) {
  nodes = 0; aborted = 0;
  if (!canPlay(&root, c)) return 127;
  if (isWinMove(&root, c)) return (W * H + 1 - root.moves) / 2;
  Pos q = root; play(&q, c);
  if (q.moves >= W * H) return 0;
  return -solvePos(&q, weak);
}
EXPORT int c4_win_move(int c) { return canPlay(&root, c) && isWinMove(&root, c); }
