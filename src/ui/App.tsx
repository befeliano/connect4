import { lazy, Suspense, useCallback, useEffect, type ReactNode } from 'react';
import { Header, Brand, HeaderCompact } from './Header';
import { ControlsPanel } from './ControlsPanel';
import { AgentPanel } from './AgentPanel';
import { Stage } from './Stage';
import { LiveRegion } from './LiveRegion';
import { KeysDialog } from './KeysDialog';
import { useKeyboard } from './useKeyboard';
import { useBreakpoint } from './useBreakpoint';
import { useUi, type PanelTab } from '../state/uiStore';
import { humanMove } from '../state/controller';
import { useGame } from '../state/gameStore';
import { t } from '../i18n/en';

const ArenaPanel = lazy(() => import('../arena/ArenaPanel'));
const LearnPanel = lazy(() => import('./LearnPanel'));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="section label">Loading…</div>}>{children}</Suspense>;
}

function TabPanel({ tab }: { tab: PanelTab }) {
  switch (tab) {
    case 'play':
      return <ControlsPanel />;
    case 'agent':
      return <AgentPanel />;
    case 'arena':
      return (
        <Lazy>
          <ArenaPanel />
        </Lazy>
      );
    case 'learn':
      return (
        <Lazy>
          <LearnPanel />
        </Lazy>
      );
    default:
      return <AgentPanel />;
  }
}

function Tabs({ tabs, value, onChange }: { tabs: PanelTab[]; value: PanelTab; onChange: (t: PanelTab) => void }) {
  const label: Record<PanelTab, string> = { play: t.tabs.controls, agent: t.tabs.agent, arena: t.tabs.arena, tree: t.tabs.tree, learn: t.tabs.learn };
  return (
    <div className="tabs" role="tablist">
      {tabs.map((x) => (
        <button key={x} role="tab" className="tab" aria-selected={value === x} onClick={() => onChange(x)}>
          {label[x]}
        </button>
      ))}
    </div>
  );
}

function SidePanel({ tabs }: { tabs: PanelTab[] }) {
  const tab = useUi((s) => s.tab);
  const current = tabs.includes(tab) ? tab : tabs[0];
  return (
    <aside className="right-col col-scroll scrollbar-thin" style={{ borderLeft: '1px solid var(--line)', background: 'var(--panel)' }}>
      <Tabs tabs={tabs} value={current} onChange={(x) => useUi.setState({ tab: x })} />
      <TabPanel tab={current} />
    </aside>
  );
}

function PhoneTabBar() {
  const tab = useUi((s) => s.tab);
  const open = useUi((s) => s.sheetOpen);
  const label: Record<string, string> = { play: t.tabs.play, agent: t.tabs.agent, arena: t.tabs.arena, learn: t.tabs.learn };
  return (
    <nav className="tabbar" aria-label="Panels">
      {(['play', 'agent', 'learn', 'arena'] as PanelTab[]).map((x) => (
        <button
          key={x}
          className="tab"
          aria-selected={open && tab === x}
          aria-expanded={open && tab === x}
          onClick={() => useUi.setState({ tab: x, sheetOpen: !(open && tab === x) })}
        >
          {label[x]}
        </button>
      ))}
    </nav>
  );
}

function PhoneSheet() {
  const tab = useUi((s) => s.tab);
  const open = useUi((s) => s.sheetOpen);
  if (!open) return null;
  return (
    <div className="sheet" role="dialog" aria-label={tab}>
      <div className="flex items-center justify-between px-3 py-1" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="label">{t.tabs[tab === 'play' ? 'controls' : tab]}</span>
        <button className="btn sm ghost" onClick={() => useUi.setState({ sheetOpen: false })}>
          {t.common.close}
        </button>
      </div>
      <div className="col-scroll scrollbar-thin">
        <TabPanel tab={tab} />
      </div>
    </div>
  );
}

export function App() {
  const bp = useBreakpoint();
  const theme = useUi((s) => s.theme);
  const drop = useCallback((c: number) => {
    humanMove(c);
  }, []);
  useKeyboard(drop);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('arena');
    if (!p) return;
    void import('../arena/share').then(async ({ decodeArena }) => {
      const a = decodeArena(p);
      if (!a) return;
      const { useArena } = await import('../arena/arenaStore');
      useArena.setState({ red: a.red, yellow: a.yellow, settings: a.settings, sweep: null, results: [] });
      useUi.setState({ tab: 'arena', sheetOpen: true });
      useGame.setState({ announcement: t.arena.loadedLink });
    });
  }, []);

  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.mode === 'ava' && s.moves.length !== prev.moves.length) {
          const next = (s.moves.length % 2 === 0 ? 1 : 2) as 1 | 2;
          if (s.seats[next].kind === 'agent') useGame.setState({ focusSeat: next });
        }
      }),
    [],
  );

  const tabletTabs: PanelTab[] = ['play', 'agent', 'learn', 'arena'];
  const desktopTabs: PanelTab[] = ['agent', 'learn', 'arena'];

  return (
    <div className="app">
      <LiveRegion />
      {bp === 'phone' || bp === 'landscapePhone' ? (
        <header className="app-header">
          <Brand compact={bp === 'landscapePhone'} />
          <HeaderCompact />
        </header>
      ) : (
        <Header />
      )}
      <main className="layout">
        {bp === 'desktop' && (
          <aside className="left-col col-scroll scrollbar-thin" style={{ borderRight: '1px solid var(--line)', background: 'var(--panel)' }}>
            <ControlsPanel />
          </aside>
        )}
        <Stage />
        {bp === 'desktop' && <SidePanel tabs={desktopTabs} />}
        {bp === 'tablet' && <SidePanel tabs={tabletTabs} />}
        {bp === 'landscapePhone' && <SidePanel tabs={tabletTabs} />}
      </main>
      {bp === 'phone' && (
        <>
          <PhoneSheet />
          <PhoneTabBar />
        </>
      )}
      <KeysDialog />
    </div>
  );
}
