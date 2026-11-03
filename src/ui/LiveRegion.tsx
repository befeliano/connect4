import { useGame } from '../state/gameStore';

export function LiveRegion() {
  const announcement = useGame((s) => s.announcement);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
