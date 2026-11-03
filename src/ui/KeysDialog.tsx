import { useEffect, useRef } from 'react';
import { useUi } from '../state/uiStore';
import { t } from '../i18n/en';

export function KeysDialog() {
  const open = useUi((s) => s.showKeys);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  const close = () => useUi.setState({ showKeys: false });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="panel w-full max-w-[380px] p-4" role="dialog" aria-modal="true" aria-label={t.keys.title} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title speed">{t.keys.title}</h2>
        <ul className="mono m-0 list-none space-y-1 p-0 text-[14px]">
          {[t.keys.drop, t.keys.move, t.keys.undo, t.keys.newGame, t.keys.devMode, t.keys.pause].map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <button ref={ref} className="btn sm mt-3" onClick={close}>
          {t.common.close}
        </button>
      </div>
    </div>
  );
}
