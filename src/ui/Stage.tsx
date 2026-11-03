import { lazy, Suspense, useCallback } from 'react';
import { useGame, seatToMove } from '../state/gameStore';
import { humanMove } from '../state/controller';
import { useUi } from '../state/uiStore';
import { Board2D } from './Board2D';
import { ColumnBar } from './ColumnBar';
import { TurnBar } from './TurnBar';
import { webglAvailable } from './webgl';

const Scene3D = lazy(() => import('../scene/Scene3D'));

export function Stage({ onColumn, canAct, compact = false }: { onColumn?: (c: number) => void; canAct?: boolean; compact?: boolean }) {
  const moves = useGame((s) => s.moves);
  const seats = useGame((s) => s.seats);
  const humanTurn = seats[seatToMove(moves)].kind === 'human';
  const drop = useCallback((c: number) => (onColumn ? onColumn(c) : humanMove(c)), [onColumn]);
  const act = canAct ?? humanTurn;
  const no3D = useUi((s) => s.no3D);
  const use3D = webglAvailable() && !no3D;

  return (
    <div className="stage h-full">
      {!compact && <TurnBar />}
      <div className="relative min-h-0 flex-1">
        {use3D ? (
          <Suspense fallback={<div className="grid h-full place-items-center label">Loading 3D board…</div>}>
            <Scene3D onColumn={drop} canAct={act} />
          </Suspense>
        ) : (
          <div className="mx-auto h-full max-w-[900px] p-3">
            <Board2D onColumn={(c) => act && drop(c)} />
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-[720px] px-3 pb-2">
        <ColumnBar onColumn={drop} canAct={act} />
      </div>
    </div>
  );
}
