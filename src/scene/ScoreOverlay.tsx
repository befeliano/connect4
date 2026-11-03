import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ColumnScore } from '../agents/types';
import { TOP_Y, colX } from './dims';

const LABEL_Y = TOP_Y + 1.35;

export function ScoreOverlay({ scores, best }: { scores: ColumnScore[]; best: number | null }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const a = new THREE.Vector3(colX(2), LABEL_Y, 0).project(camera);
  const b = new THREE.Vector3(colX(3), LABEL_Y, 0).project(camera);
  const chipW = Math.max(30, Math.min(110, (Math.abs(b.x - a.x) / 2) * size.width * 0.94));
  const vals = scores.map((s) => (s.score === null ? 0 : Math.max(-1000, Math.min(1000, s.score))));
  const max = Math.max(1, ...vals.map(Math.abs));
  return (
    <group>
      {scores.map((s, i) => {
        if (s.score === null) return null;
        const v = vals[i];
        const pct = Math.max(6, (Math.abs(v) / max) * 100);
        const tone = s.proven === 'win' ? 'win' : s.proven === 'loss' ? 'loss' : v >= 0 ? 'pos' : 'neg';
        return (
          <Html key={s.col} position={[colX(s.col), LABEL_Y, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className="score-chip"
              data-tone={tone}
              data-best={best === s.col ? 'true' : 'false'}
              style={{ ['--chip-w' as string]: `${chipW}px`, fontSize: `${Math.max(9, Math.min(14, chipW / 5.2))}px` }}
            >
              <div className="score-bar">
                <i style={{ height: `${pct}%` }} />
              </div>
              <span>{s.label}</span>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
