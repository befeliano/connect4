import { useEffect, useRef, useState } from 'react';
import { useUi } from '../state/uiStore';

export function useCountUp(target: number, ms = 220): number {
  const reduced = useUi((s) => s.reducedMotion);
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const v = a + (target - a) * (1 - (1 - k) * (1 - k));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return shown;
}
