import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colX, rowY, TOP_Y } from './dims';
import { colOf, rowOf } from '../engine/lines';
import { mulberry32 } from '../engine/rng';

export function WinLine({ cells, reducedMotion }: { cells: number[]; reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const { mid, len, quat } = useMemo(() => {
    const a = new THREE.Vector3(colX(colOf(cells[0])), rowY(rowOf(cells[0])), 0.2);
    const b = new THREE.Vector3(colX(colOf(cells[3])), rowY(rowOf(cells[3])), 0.2);
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { mid: a.clone().add(b).multiplyScalar(0.5), len: dir.length() + 0.5, quat: q };
  }, [cells]);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt * (reducedMotion ? 100 : 2.2));
    if (ref.current) ref.current.scale.y = t.current;
  });
  return (
    <mesh ref={ref} position={mid} quaternion={quat} scale={[1, reducedMotion ? 1 : 0.001, 1]}>
      <cylinderGeometry args={[0.05, 0.05, len, 12]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} />
    </mesh>
  );
}

const CONFETTI_COLORS = ['#C4A6FF', '#F4EEFB', '#5B1FA8', '#39FF89', '#FFFFFF'];

export function Confetti({ seed }: { seed: number }) {
  const count = 90;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => {
    const rng = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      p: new THREE.Vector3((rng() - 0.5) * 7, TOP_Y + 1 + rng() * 2, (rng() - 0.2) * 2.5),
      v: new THREE.Vector3((rng() - 0.5) * 1.5, -1 - rng() * 1.5, (rng() - 0.5) * 0.6),
      r: new THREE.Euler(rng() * 6, rng() * 6, rng() * 6),
      w: (rng() - 0.5) * 8,
      c: new THREE.Color(CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)]),
    }));
  }, [seed]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const life = useRef(0);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    life.current += dt;
    parts.forEach((q, i) => {
      q.p.addScaledVector(q.v, dt);
      q.r.x += q.w * dt;
      q.r.y += q.w * 0.7 * dt;
      tmp.position.copy(q.p);
      tmp.rotation.copy(q.r);
      tmp.scale.setScalar(life.current > 4 ? Math.max(0, 1 - (life.current - 4)) : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      if (life.current < dt * 2) m.setColorAt(i, q.c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.12, 0.07]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
