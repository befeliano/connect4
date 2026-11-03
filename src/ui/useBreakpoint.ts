import { useEffect, useState } from 'react';

export type Breakpoint = 'phone' | 'landscapePhone' | 'tablet' | 'desktop';

function compute(): Breakpoint {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 950 && h <= 500 && w > h) return 'landscapePhone';
  if (w < 768) return 'phone';
  if (w < 1280) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(compute);
  useEffect(() => {
    const on = () => setBp(compute());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return bp;
}
