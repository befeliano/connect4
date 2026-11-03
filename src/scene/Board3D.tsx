import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOARD_BLUE } from './colors';
import {
  BACK_T,
  BACK_Z,
  BOARD_H,
  BOARD_W,
  FRONT_T,
  FRONT_Z,
  HOLE_R,
  LIFT,
  SLOT,
  DISC_R,
  Y0,
  colX,
  rowY,
} from './dims';
import type { Quality } from '../state/uiStore';

function panelGeometry(depth: number, bevel: number): THREE.ExtrudeGeometry {
  const w = BOARD_W;
  const h = BOARD_H;
  const r = 0.22;
  const x0 = -w / 2;
  const y0 = LIFT;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  for (let c = 0; c < 7; c++) {
    for (let row = 0; row < 6; row++) {
      const hole = new THREE.Path();
      hole.absarc(colX(c), rowY(row), HOLE_R, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 28,
  });
  g.computeVertexNormals();
  return g;
}

export function boardMaterial(quality: Quality): THREE.Material {
  return quality === 'low'
    ? new THREE.MeshStandardMaterial({ color: BOARD_BLUE, roughness: 0.35, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({
        color: BOARD_BLUE,
        roughness: 0.28,
        metalness: 0,
        clearcoat: quality === 'high' ? 0.7 : 0.4,
        clearcoatRoughness: 0.18,
      });
}

export function Board3D({ quality, sliderOpen }: { quality: Quality; sliderOpen: React.MutableRefObject<number> }) {
  const front = useMemo(() => panelGeometry(FRONT_T, 0.025), []);
  const back = useMemo(() => panelGeometry(BACK_T, 0.012), []);
  const mat = useMemo(() => boardMaterial(quality), [quality]);
  const darker = useMemo(() => {
    const m = (mat as THREE.MeshStandardMaterial).clone();
    m.color = new THREE.Color(BOARD_BLUE).multiplyScalar(0.82);
    return m;
  }, [mat]);
  const slider = useRef<THREE.Mesh>(null);
  const shadows = quality !== 'low';

  useFrame(() => {
    if (slider.current) slider.current.position.x = sliderOpen.current * (BOARD_W * 0.9);
  });

  const railW = 0.2;
  const totalZ = SLOT + FRONT_T + BACK_T;
  const legH = BOARD_H + LIFT + 0.15;
  return (
    <group>
      {}
      <mesh geometry={front} material={mat} position={[0, 0, FRONT_Z]} castShadow={shadows} receiveShadow={shadows} />
      {}
      <mesh geometry={back} material={mat} position={[0, 0, BACK_Z - BACK_T]} castShadow={shadows} receiveShadow={shadows} />
      {}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (BOARD_W / 2 - railW / 2 + 0.02), LIFT + BOARD_H / 2, 0]} material={darker} castShadow={shadows}>
          <boxGeometry args={[railW, BOARD_H, SLOT + 0.002]} />
        </mesh>
      ))}
      {}
      {[-1, 1].map((side) => (
        <group key={`leg${side}`} position={[side * (BOARD_W / 2 + 0.16), 0, 0]}>
          <mesh position={[0, legH / 2, 0]} material={mat} castShadow={shadows} receiveShadow={shadows}>
            <boxGeometry args={[0.24, legH, totalZ + 0.08]} />
          </mesh>
          <mesh position={[0, 0.09, 0]} material={mat} castShadow={shadows} receiveShadow={shadows}>
            <boxGeometry args={[0.36, 0.18, 2.6]} />
          </mesh>
          <mesh position={[0, legH + 0.02, 0]} material={mat} castShadow={shadows}>
            <cylinderGeometry args={[0.16, 0.16, 0.08, 24]} />
          </mesh>
        </group>
      ))}
      {}
      <mesh ref={slider} position={[0, Y0 - DISC_R - 0.08, 0]} material={darker} castShadow={shadows}>
        <boxGeometry args={[BOARD_W - 0.1, 0.16, SLOT - 0.01]} />
      </mesh>
      <mesh position={[BOARD_W / 2 + 0.36, Y0 - DISC_R - 0.08, 0]} material={darker} castShadow={shadows}>
        <boxGeometry args={[0.32, 0.12, 0.12]} />
      </mesh>
    </group>
  );
}
