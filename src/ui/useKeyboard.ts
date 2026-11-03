import { useEffect } from 'react';
import { useUi } from '../state/uiStore';
import { useGame } from '../state/gameStore';
import { newGame, setPaused, step, undo } from '../state/controller';
import { stepArena, useArena } from '../arena/arenaStore';

export function useKeyboard(drop: (col: number) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUi.getState();
      if (e.key >= '1' && e.key <= '7') {
        drop(Number(e.key) - 1);
        useUi.setState({ cursorCol: Number(e.key) - 1 });
      } else if (e.key === 'ArrowLeft') {
        useUi.setState({ cursorCol: Math.max(0, ui.cursorCol - 1), hoverCol: Math.max(0, ui.cursorCol - 1) });
      } else if (e.key === 'ArrowRight') {
        useUi.setState({ cursorCol: Math.min(6, ui.cursorCol + 1), hoverCol: Math.min(6, ui.cursorCol + 1) });
      } else if (e.key === 'Enter' && el?.tagName !== 'BUTTON') {
        drop(ui.cursorCol);
      } else if (e.key === 'u' || e.key === 'U') {
        undo();
      } else if (e.key === 'n' || e.key === 'N') {
        newGame();
      } else if (e.key === 'd' || e.key === 'D') {
        useUi.setState({ devMode: !ui.devMode });
      } else if (e.key === ' ' && el?.tagName !== 'BUTTON') {
        const arena = useArena.getState();
        if (arena.running) {
          e.preventDefault();
          if (arena.paused) stepArena();
          else arena.togglePause();
        } else if (useGame.getState().mode === 'ava') {
          e.preventDefault();
          const g = useGame.getState();
          if (g.paused) step();
          else setPaused(true);
        }
      } else if (e.key === '?') {
        useUi.setState({ showKeys: !ui.showKeys });
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drop]);
}
