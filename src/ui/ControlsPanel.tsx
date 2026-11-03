import { useGame, type SeatId } from '../state/gameStore';
import { setMode, setSeatConfig } from '../state/controller';
import { AgentConfigEditor, PresetButtons } from './AgentConfigEditor';
import { t } from '../i18n/en';
import { stopArena } from '../arena/arenaStore';
import { useUi } from '../state/uiStore';

export function ControlsPanel() {
  const mode = useGame((s) => s.mode);
  const humanSeat = useGame((s) => s.humanSeat);
  const seats = useGame((s) => s.seats);
  const agentSeats = ([1, 2] as SeatId[]).filter((id) => seats[id].kind === 'agent');
  const hasGuest = seats[1].kind === 'guest' || seats[2].kind === 'guest';
  const dev = useUi((s) => s.devMode);

  return (
    <div>
      {mode === 'arena' && (
        <section className="section" role="note">
          <p className="m-0 mb-2 text-[14px]">{t.arena.onBoard}</p>
          <button className="btn sm primary" onClick={() => {
              stopArena();
              setMode('hva');
            }}>
            {t.arena.backToPlay}
          </button>
        </section>
      )}
      <section className="section">
        <h2 className="section-title speed">{t.modes.title}</h2>
        <div className="seg" role="radiogroup" aria-label={t.modes.title}>
          {(['hva', 'hvh', 'ava'] as const).map((m) => (
            <button key={m} className="btn sm" role="radio" aria-checked={mode === m && !hasGuest} aria-pressed={mode === m && !hasGuest} onClick={() => setMode(m)}>
              {t.modes[m]}
            </button>
          ))}
        </div>
        {mode === 'hva' && !hasGuest && (
          <div className="mt-2 flex items-center gap-2">
            <span className="label">{t.modes.youPlay}</span>
            <div className="seg">
              {([1, 2] as SeatId[]).map((s) => (
                <button key={s} className="btn sm" aria-pressed={humanSeat === s} onClick={() => setMode('hva', { humanSeat: s })}>
                  {t.players[s]} · {s === 1 ? t.modes.first : t.modes.second}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {agentSeats.map((seat) => (
        <section className="section" key={seat}>
          <h2 className="section-title speed">
            {agentSeats.length > 1 ? `${t.players[seat]} · ` : ''}
            {t.presets.title}
          </h2>
          <PresetButtons config={seats[seat].config} onChange={(c) => setSeatConfig(seat, c)} idPrefix={`seat${seat}`} chapters={dev} />
          <p className="mt-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
            {dev ? t.presets.hint : t.presets.userHint}
          </p>
          {dev && (
            <div className="mt-3">
              <AgentConfigEditor config={seats[seat].config} onChange={(c) => setSeatConfig(seat, c)} idPrefix={`seat${seat}`} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
