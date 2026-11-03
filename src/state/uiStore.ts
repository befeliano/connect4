import { create } from 'zustand';

export type Quality = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | Quality;
export type PanelTab = 'play' | 'agent' | 'arena' | 'tree' | 'learn';

export interface UiState {
  theme: 'dark' | 'light';
  qualitySetting: QualitySetting;
  autoQuality: Quality;
  flat: boolean;
  presentation: boolean;
  pattern: boolean;
  sound: boolean;
  confirmTap: boolean;
  reducedMotion: boolean;
  tab: PanelTab;
  sheetOpen: boolean;
  cursorCol: number;
  hoverCol: number | null;
  showKeys: boolean;
  devMode: boolean;
  no3D: boolean;
}

const PREFS_KEY = 'c4lab.prefs.v1';

function loadPrefs(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<UiState>) : {};
  } catch {
    return {};
  }
}

const reduced = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const prefs = loadPrefs();

export const useUi = create<UiState>(() => ({
  theme: prefs.theme ?? 'dark',
  qualitySetting: prefs.qualitySetting ?? 'auto',
  autoQuality: 'high',
  flat: prefs.flat ?? false,
  presentation: false,
  pattern: prefs.pattern ?? false,
  sound: prefs.sound ?? true,
  confirmTap: prefs.confirmTap ?? false,
  reducedMotion: reduced(),
  tab: 'play',
  sheetOpen: false,
  cursorCol: 3,
  hoverCol: null,
  showKeys: false,
  devMode: prefs.devMode ?? false,
  no3D: typeof location !== 'undefined' && new URLSearchParams(location.search).has('2d'),
}));

useUi.subscribe((s) => {
  try {
    const { theme, qualitySetting, flat, pattern, sound, confirmTap, devMode } = s;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, qualitySetting, flat, pattern, sound, confirmTap, devMode }));
  } catch {
  }
});

try {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => useUi.setState({ reducedMotion: e.matches }));
} catch {
}

export const effectiveQuality = (s: UiState): Quality => (s.qualitySetting === 'auto' ? s.autoQuality : s.qualitySetting);
