import { useRef } from 'react';
import { boardOf, seatToMove, useGame } from '../state/gameStore';
import { useUi } from '../state/uiStore';
import { t } from '../i18n/en';

export function ColumnBar({ onColumn, canAct }: { onColumn: (col: number) => void; canAct: boolean }) {
  const moves = useGame((s) => s.moves);
  const cursor = useUi((s) => s.cursorCol);
  const confirmTap = useUi((s) => s.confirmTap);
  const armed = useRef<number | null>(null);
  const b = boardOf(moves);
  const over = b.isOver();
  const player = t.players[seatToMove(moves)];

  return (
    <div className="colbar" role="group" aria-label={`${player} to move: choose a column`}>
      {Array.from({ length: 7 }, (_, c) => {
        const full = !b.canPlay(c);
        return (
          <button
            key={c}
            className={`colbtn ${cursor === c ? 'cursor' : ''}`}
            disabled={over || full || !canAct}
            aria-label={full ? t.game.columnFull(c + 1) : t.game.dropIn(c + 1)}
            onClick={(e) => {
              useUi.setState({ cursorCol: c });
              const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
              if (confirmTap && touch && armed.current !== c) {
                armed.current = c;
                useUi.setState({ hoverCol: c });
                return;
              }
              armed.current = null;
              onColumn(c);
            }}
          >
            {c + 1}
          </button>
        );
      })}
    </div>
  );
}
