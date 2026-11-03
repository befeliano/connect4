import { configFromJSON, configToJSON } from '../agents/presets';
import type { AgentConfig } from '../agents/types';
import { DEFAULT_SETTINGS, type SeriesSettings } from './series';

export interface ArenaShare {
  red: AgentConfig;
  yellow: AgentConfig;
  settings: SeriesSettings;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeArena(a: ArenaShare, origin = location.origin): string {
  const payload = JSON.stringify({ v: 1, r: configToJSON(a.red), y: configToJSON(a.yellow), s: a.settings });
  return `${origin}/?arena=${b64url(payload)}`;
}

export function decodeArena(param: string): ArenaShare | null {
  try {
    const o = JSON.parse(unb64url(param)) as { v: number; r: unknown; y: unknown; s: Partial<SeriesSettings> };
    if (o.v !== 1) return null;
    return { red: configFromJSON(o.r), yellow: configFromJSON(o.y), settings: { ...DEFAULT_SETTINGS, ...o.s } };
  } catch {
    return null;
  }
}
