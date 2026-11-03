import { gameResult, seatToMove, useGame } from '../state/gameStore';
import { DISC_COLOR } from '../scene/colors';
import { t } from '../i18n/en';

export function TurnBar() {
  const moves = useGame((s) => s.moves);
  const seats = useGame((s) => s.seats);
  const runtime = useGame((s) => s.runtime);
  const colorOf = useGame((s) => s.colorOf);
  const name = (s: 1 | 2) => t.players[colorOf[s]];
  const r = gameResult(moves);
  const seat = seatToMove(moves);
  let text: string;
  let swatch: 1 | 2 | null = colorOf[seat];
  if (r.winner) {
    text = `${t.game.wins(name(r.winner))} (${seats[r.winner].name})`;
    swatch = colorOf[r.winner];
  } else if (r.over) {
    text = t.game.draw;
    swatch = null;
  } else if (seats[seat].kind === 'agent') {
    text = runtime[seat].status === 'thinking' || runtime[seat].status === 'replanning' ? `${seats[seat].name}: ${t.game.agentThinking}` : `${t.game.toMove(name(seat))} · ${seats[seat].name}`;
  } else if (seats[seat].kind === 'guest') {
    text = `${t.game.toMove(name(seat))} · ${seats[seat].name}`;
  } else {
    text = seats[1].kind === 'human' && seats[2].kind === 'human' ? t.game.toMove(name(seat)) : `${t.game.yourTurn} (${name(seat)})`;
  }
  return (
    <div className="flex min-h-[40px] items-center justify-center gap-2 px-2 text-center">
      {swatch && <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-full" style={{ background: DISC_COLOR[swatch], boxShadow: '0 0 0 2px rgba(255,255,255,0.35)' }} />}
      <span className="display text-[17px] leading-tight sm:text-[20px]">{text}</span>
    </div>
  );
}
