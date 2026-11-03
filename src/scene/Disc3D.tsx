import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DISC_COLOR } from './colors';
import { DISC_R, DISC_T, TOP_Y, colX, rowY } from './dims';
import { clack } from './sound';
import type { Quality } from '../state/uiStore';

function discGeometry(): THREE.LatheGeometry {
  const h = DISC_T / 2;
  const R = DISC_R;
  const top: [number, number][] = [[0, h]];
  for (const r of [0.1, 0.18, 0.26]) {
    top.push([r - 0.012, h], [r - 0.006, h - 0.012], [r + 0.006, h - 0.012], [r + 0.012, h]);
  }
  top.push([R - 0.045, h], [R - 0.012, h - 0.012], [R, h - 0.04]);
  const bottom = top.map(([x, y]) => [x, -y] as [number, number]);
  const profile = [...top, ...bottom.slice().reverse()];
  const g = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  );
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

let sharedGeometry: THREE.LatheGeometry | null = null;
export const getDiscGeometry = (): THREE.LatheGeometry => (sharedGeometry ??= discGeometry());

const materialCache = new Map<string, THREE.Material>();
export function discMaterial(player: 1 | 2, quality: Quality, opacity = 1): THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial {
  const key = `${player}:${quality}:${opacity}`;
  let m = materialCache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) {
    m =
      quality === 'low'
        ? (new THREE.MeshStandardMaterial({ color: DISC_COLOR[player], roughness: 0.35 }) as unknown as THREE.MeshPhysicalMaterial)
        : new THREE.MeshPhysicalMaterial({
            color: DISC_COLOR[player],
            roughness: 0.32,
            metalness: 0,
            clearcoat: quality === 'high' ? 0.55 : 0.3,
            clearcoatRoughness: 0.25,
          });
    if (opacity < 1) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    materialCache.set(key, m);
  }
  return m;
}

const markMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5 });
const dotGeo = new THREE.CircleGeometry(0.09, 24);
const ringGeo = new THREE.RingGeometry(0.12, 0.19, 32);

export interface DiscProps {
  player: 1 | 2;
  col: number;
  row: number;
  quality: Quality;
  animate: boolean;
  reducedMotion: boolean;
  sound: boolean;
  pattern: boolean;
  winning: boolean;
  releasing: boolean;
  releaseDelay?: number;
  onSettled?: () => void;
}

const G = 32;
const RESTITUTION = 0.28;

export function Disc3D(p: DiscProps) {
  const target = rowY(p.row);
  const start = p.reducedMotion ? target + 0.6 : TOP_Y + 0.9;
  const state = useRef({ y: p.animate ? start : target, vy: 0, bounces: 0, settled: !p.animate, t: 0, landed: false });
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const base = discMaterial(p.player, p.quality);
  const winMat = useMemo(() => {
    if (!p.winning) return null;
    const m = (base as THREE.MeshPhysicalMaterial).clone();
    m.emissive = new THREE.Color(DISC_COLOR[p.player]);
    m.toneMapped = false;
    return m;
  }, [p.winning, base, p.player]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    const s = state.current;
    s.t += dt;
    if (p.releasing) {
      if (s.t > (p.releaseDelay ?? 0)) {
        s.vy -= G * dt;
        s.y += s.vy * dt;
      }
    } else if (!s.settled) {
      const g = p.reducedMotion ? G * 3 : G;
      s.vy -= g * dt;
      s.y += s.vy * dt;
      if (s.y <= target) {
        s.y = target;
        if (!s.landed) {
          s.landed = true;
          if (p.sound) clack(Math.min(1, Math.abs(s.vy) / 14));
        }
        if (s.bounces < 2 && !p.reducedMotion && Math.abs(s.vy) > 2) {
          s.vy = -s.vy * RESTITUTION;
          s.bounces++;
        } else {
          s.vy = 0;
          s.settled = true;
          p.onSettled?.();
        }
      }
    }
    if (group.current) group.current.position.y = s.y;
    if (winMat && s.settled) {
      winMat.emissiveIntensity = p.reducedMotion ? 1.6 : 1.2 + Math.sin(s.t * 5) * 1.0;
    }
  });

  const shadows = p.quality !== 'low';
  const face = DISC_T / 2 + 0.004;
  return (
    <group ref={group} position={[colX(p.col), state.current.y, 0]}>
      <mesh ref={mesh} geometry={getDiscGeometry()} material={winMat ?? base} castShadow={shadows} receiveShadow={shadows} />
      {p.pattern &&
        [face, -face].map((z) => (
          <mesh key={z} geometry={p.player === 1 ? dotGeo : ringGeo} material={markMat} position={[0, 0, z]} rotation={[0, z < 0 ? Math.PI : 0, 0]} />
        ))}
    </group>
  );
}
