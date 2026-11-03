import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOARD_H, LIFT, P, TOP_Y, colX, rowY } from './dims';
import { discMaterial, getDiscGeometry } from './Disc3D';
import type { Quality } from '../state/uiStore';

const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false });
const greyMat = new THREE.MeshStandardMaterial({ color: '#9a8fb0', transparent: true, opacity: 0.35, depthWrite: false });

export function GhostPreview({ col, row, player, quality }: { col: number; row: number; player: 1 | 2; quality: Quality }) {
  const mat = discMaterial(player, quality, 0.55);
  const faint = discMaterial(player, quality, 0.22);
  return (
    <group>
      <mesh position={[colX(col), LIFT + BOARD_H / 2, 0.26]} material={highlightMat}>
        <planeGeometry args={[P * 0.96, BOARD_H]} />
      </mesh>
      <mesh geometry={getDiscGeometry()} material={mat} position={[colX(col), TOP_Y + 0.55, 0]} />
      {row < 6 && <mesh geometry={getDiscGeometry()} material={faint} position={[colX(col), rowY(row), 0]} />}
    </group>
  );
}

export interface PvGhost {
  col: number;
  row: number;
  player: 1 | 2;
  n: number;
}

export function PvGhosts({ ghosts, grey, quality }: { ghosts: PvGhost[]; grey: boolean; quality: Quality }) {
  return (
    <group>
      {ghosts.map((g) => (
        <group key={`${g.n}-${g.col}-${g.row}`} position={[colX(g.col), rowY(g.row), 0]}>
          <mesh geometry={getDiscGeometry()} material={grey ? greyMat : discMaterial(g.player, quality, 0.38)} />
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <span className="pv-num" data-grey={grey ? 'true' : 'false'}>
              {g.n}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}
