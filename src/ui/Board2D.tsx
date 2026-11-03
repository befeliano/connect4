import { useMemo } from 'react';
import { COLS, ROWS, cellIndex } from '../engine/lines';
import { BOARD_BLUE, DISC_COLOR } from '../scene/colors';
import { gameResult, useGame } from '../state/gameStore';
import { useUi } from '../state/uiStore';

export function Board2D({ onColumn }: { onColumn: (col: number) => void }) {
  const moves = useGame((s) => s.moves);
  const pattern = useUi((s) => s.pattern);
  const hover = useUi((s) => s.hoverCol);
  const colorOf = useGame((s) => s.colorOf);
  const { cells, last, line } = useMemo(() => {
    const grid = new Array<number>(COLS * ROWS).fill(0);
    const h = new Array<number>(COLS).fill(0);
    let lastIdx = -1;
    moves.forEach((c, i) => {
      lastIdx = cellIndex(c, h[c]++);
      grid[lastIdx] = colorOf[i % 2 === 0 ? 1 : 2];
    });
    return { cells: grid, last: lastIdx, line: new Set(gameResult(moves).line ?? []) };
  }, [moves, colorOf]);

  const S = 100;
  return (
    <svg viewBox={`0 0 ${COLS * S + 40} ${ROWS * S + 40}`} className="h-full w-full" role="img" aria-label="Connect Four board">
      <rect x="0" y="0" width={COLS * S + 40} height={ROWS * S + 40} rx="18" fill={BOARD_BLUE} />
      {Array.from({ length: COLS }, (_, c) => (
        <rect
          key={`col${c}`}
          x={20 + c * S}
          y={0}
          width={S}
          height={ROWS * S + 40}
          fill={hover === c ? 'rgba(255,255,255,0.12)' : 'transparent'}
          onClick={() => onColumn(c)}
          onPointerEnter={() => useUi.setState({ hoverCol: c })}
          onPointerLeave={() => useUi.setState({ hoverCol: null })}
          style={{ cursor: 'pointer' }}
        />
      ))}
      {cells.map((p, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cx = 20 + col * S + S / 2;
        const cy = 20 + (ROWS - 1 - row) * S + S / 2;
        return (
          <g key={i} pointerEvents="none">
            <circle cx={cx} cy={cy} r={40} fill={p ? DISC_COLOR[p as 1 | 2] : '#0d0118'} stroke={line.has(i) ? '#fff' : 'rgba(0,0,0,0.25)'} strokeWidth={line.has(i) ? 6 : 2} />
            {p !== 0 && <circle cx={cx} cy={cy} r={28} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={3} />}
            {p !== 0 && pattern && (p === 1 ? <circle cx={cx} cy={cy} r={9} fill="rgba(0,0,0,0.55)" /> : <circle cx={cx} cy={cy} r={16} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={6} />)}
            {i === last && <circle cx={cx} cy={cy} r={6} fill="#fff" opacity={0.8} />}
          </g>
        );
      })}
    </svg>
  );
}
