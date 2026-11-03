import { useState } from 'react';
import { newGame, undo } from '../state/controller';
import { useGame } from '../state/gameStore';
import { effectiveQuality, useUi, type QualitySetting } from '../state/uiStore';
import { t } from '../i18n/en';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="brand-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="label" style={{ color: 'var(--text)' }}>
        {t.brand.team}
      </span>
      {!compact && (
        <span className="display truncate text-[18px] leading-none" style={{ color: 'var(--accent)' }}>
          {t.brand.app}
        </span>
      )}
    </div>
  );
}

export function ModeToggle() {
  const dev = useUi((s) => s.devMode);
  return (
    <div className="seg mr-2" role="radiogroup" aria-label={t.header.modeHint} title={t.header.modeHint}>
      <button className="btn sm" role="radio" aria-checked={!dev} aria-pressed={!dev} onClick={() => useUi.setState({ devMode: false })}>
        {t.header.userMode}
      </button>
      <button className="btn sm" role="radio" aria-checked={dev} aria-pressed={dev} onClick={() => useUi.setState({ devMode: true })} title="D">
        {t.header.devMode}
      </button>
    </div>
  );
}

export function Header() {
  const ui = useUi();
  const mode = useGame((s) => s.mode);
  const hasGuest = useGame((s) => s.seats[1].kind === 'guest' || s.seats[2].kind === 'guest');
  const canUndo = useGame((s) => s.moves.length > 0) && mode !== 'ava' && !hasGuest;
  const [open, setOpen] = useState(false);

  return (
    <header className="app-header">
      <Brand />
      <div className="ml-auto flex items-center gap-1">
        <ModeToggle />
        <button className="btn sm" onClick={() => newGame()} title="N">
          {t.header.newGame}
        </button>
        <button className="btn sm max-[767px]:hidden" onClick={() => undo()} disabled={!canUndo} title="U">
          {t.header.undo}
        </button>
        <button className="btn sm max-[767px]:hidden" aria-pressed={ui.flat} onClick={() => useUi.setState({ flat: !ui.flat })}>
          {ui.flat ? t.header.flat : t.header.view3d}
        </button>
        <div className="relative">
          <button className="btn sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
            {t.header.settings}
          </button>
          {open && (
            <div className="panel absolute right-0 z-50 mt-1 w-[260px] p-3" role="dialog" aria-label={t.header.settings}>
              <label className="field">
                <span>{t.header.theme}</span>
                <select className="select" value={ui.theme} onChange={(e) => useUi.setState({ theme: e.target.value as 'dark' | 'light' })}>
                  <option value="dark">{t.header.dark}</option>
                  <option value="light">{t.header.light}</option>
                </select>
              </label>
              <label className="field">
                <span>{t.header.quality}</span>
                <select className="select" value={ui.qualitySetting} onChange={(e) => useUi.setState({ qualitySetting: e.target.value as QualitySetting })}>
                  <option value="auto">Auto ({effectiveQuality(ui)})</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="field">
                <span>{t.header.flat}</span>
                <input type="checkbox" checked={ui.flat} onChange={(e) => useUi.setState({ flat: e.target.checked })} />
              </label>
              <label className="field">
                <span>{t.header.pattern}</span>
                <input type="checkbox" checked={ui.pattern} onChange={(e) => useUi.setState({ pattern: e.target.checked })} />
              </label>
              <label className="field">
                <span>{t.header.sound}</span>
                <input type="checkbox" checked={ui.sound} onChange={(e) => useUi.setState({ sound: e.target.checked })} />
              </label>
              <label className="field">
                <span>{t.game.confirmTap}</span>
                <input type="checkbox" checked={ui.confirmTap} onChange={(e) => useUi.setState({ confirmTap: e.target.checked })} />
              </label>
              <button className="btn sm mt-2 w-full" onClick={() => useUi.setState({ showKeys: true })}>
                {t.header.help}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function HeaderCompact() {
  const ui = useUi();
  const mode = useGame((s) => s.mode);
  const hasGuest = useGame((s) => s.seats[1].kind === 'guest' || s.seats[2].kind === 'guest');
  const canUndo = useGame((s) => s.moves.length > 0) && mode !== 'ava' && !hasGuest;
  return (
    <div className="ml-auto flex items-center gap-1">
      <button className="btn sm" onClick={() => newGame()} aria-label={t.header.newGame}>
        New
      </button>
      <button className="btn sm" onClick={() => undo()} disabled={!canUndo} aria-label={t.header.undo}>
        ↶
      </button>
      <button className="btn sm" aria-pressed={ui.flat} onClick={() => useUi.setState({ flat: !ui.flat })} aria-label={t.header.flat}>
        2D
      </button>
      <button className="btn sm" onClick={() => useUi.setState({ theme: ui.theme === 'dark' ? 'light' : 'dark' })} aria-label={t.header.theme}>
        {ui.theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}
