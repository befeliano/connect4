import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, OrthographicCamera, PerformanceMonitor, PerspectiveCamera } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Board3D } from './Board3D';
import { Disc3D } from './Disc3D';
import { Confetti, WinLine } from './Effects';
import { GhostPreview, PvGhosts, type PvGhost } from './GhostPreview';
import { ScoreOverlay } from './ScoreOverlay';
import { BOARD_H, BOARD_W, CENTER_Y, FRONT_T, FRONT_Z, LIFT, P, TOP_Y } from './dims';
import { familyOf } from '../agents/types';
import { gameResult, seatToMove, useGame, type SeatId } from '../state/gameStore';
import { effectiveQuality, useUi, type Quality } from '../state/uiStore';
import { unlockAudio } from './sound';

interface DiscInfo {
  key: string;
  player: 1 | 2;
  col: number;
  row: number;
  index: number;
}

function discsOf(moves: number[], gameId: number, colorOf: Record<1 | 2, 1 | 2> = { 1: 1, 2: 2 }): DiscInfo[] {
  const h = [0, 0, 0, 0, 0, 0, 0];
  return moves.map((col, i) => ({ key: `${gameId}-${i}-${col}`, player: colorOf[(i % 2 === 0 ? 1 : 2) as 1 | 2], col, row: h[col]++, index: i }));
}

const DPR: Record<Quality, [number, number]> = { high: [1, 2], medium: [1, 1.75], low: [1, 1.5] };
const ORDER: Quality[] = ['low', 'medium', 'high'];

const VIEW_HALF_W = BOARD_W / 2 + 0.7;
const VIEW_TOP = TOP_Y + 2.0;
const VIEW_BOTTOM = -0.2;
const VIEW_CENTER = (VIEW_TOP + VIEW_BOTTOM) / 2;
const VIEW_HALF_H = (VIEW_TOP - VIEW_BOTTOM) / 2;

function CameraRig({ flat, reducedMotion, resetKey }: { flat: boolean; reducedMotion: boolean; resetKey: number }) {
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const persp = useRef<THREE.PerspectiveCamera>(null);
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const fov = 32;
  const aspect = size.width / Math.max(1, size.height);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const dist = Math.max(VIEW_HALF_H / tanHalf, VIEW_HALF_W / (tanHalf * aspect)) * 1.12 + 1.2;
  const az = THREE.MathUtils.degToRad(16);
  const el = THREE.MathUtils.degToRad(9);
  const target = useMemo(() => new THREE.Vector3(0, VIEW_CENTER, 0), []);
  const home = useMemo(
    () => new THREE.Vector3(Math.sin(az) * Math.cos(el) * dist, VIEW_CENTER + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist),
    [dist, az, el],
  );

  useEffect(() => {
    if (flat || !persp.current) return;
    persp.current.position.copy(home);
    persp.current.lookAt(target);
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
  }, [home, target, flat, resetKey]);

  const zoom = Math.min(size.width / (2 * VIEW_HALF_W * 1.06), size.height / (2 * VIEW_HALF_H * 1.06));
  return flat ? (
    <OrthographicCamera ref={ortho} makeDefault position={[0, VIEW_CENTER, 30]} zoom={zoom} near={0.1} far={100} />
  ) : (
    <>
      <PerspectiveCamera ref={persp} makeDefault fov={fov} near={0.1} far={200} position={home.toArray()} />
      <OrbitControls
        ref={controls}
        target={target}
        enablePan={false}
        enableDamping={!reducedMotion}
        minAzimuthAngle={THREE.MathUtils.degToRad(-35)}
        maxAzimuthAngle={THREE.MathUtils.degToRad(35)}
        minPolarAngle={THREE.MathUtils.degToRad(58)}
        maxPolarAngle={THREE.MathUtils.degToRad(98)}
        minDistance={dist * 0.65}
        maxDistance={dist * 1.35}
        rotateSpeed={0.6}
      />
    </>
  );
}

function Lights({ quality }: { quality: Quality }) {
  const shadows = quality !== 'low';
  return (
    <>
      {}
      <Environment resolution={quality === 'high' ? 256 : 128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 8]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-8, 4, 4]} rotation={[0, Math.PI / 2.5, 0]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[8, 3, 2]} rotation={[0, -Math.PI / 2.5, 0]} scale={[6, 6, 1]} />
        <Lightformer form="ring" intensity={0.8} position={[0, 10, -4]} scale={4} />
      </Environment>
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[4, 10, 7]}
        intensity={1.6}
        castShadow={shadows}
        shadow-mapSize-width={quality === 'high' ? 2048 : 1024}
        shadow-mapSize-height={quality === 'high' ? 2048 : 1024}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={10}
        shadow-camera-bottom={-2}
        shadow-radius={4}
        shadow-bias={-0.0004}
      />
    </>
  );
}

function useRelease(gameId: number, moves: number[], reducedMotion: boolean, colorOf: Record<1 | 2, 1 | 2>) {
  const sliderOpen = useRef(0);
  const [releasing, setReleasing] = useState<DiscInfo[]>([]);
  const prev = useRef<{ gameId: number; discs: DiscInfo[] }>({ gameId, discs: discsOf(moves, gameId, colorOf) });
  const phase = useRef<{ t: number; active: boolean }>({ t: 0, active: false });

  useEffect(() => {
    if (gameId !== prev.current.gameId) {
      const old = prev.current.discs;
      if (old.length && !reducedMotion) {
        setReleasing(old);
        phase.current = { t: 0, active: true };
      }
    }
    prev.current = { gameId, discs: discsOf(moves, gameId, colorOf) };
  }, [gameId, moves, reducedMotion, colorOf]);

  useFrame((_, dt) => {
    const p = phase.current;
    if (!p.active) return;
    p.t += dt;
    sliderOpen.current = p.t < 0.35 ? p.t / 0.35 : p.t < 1.3 ? 1 : Math.max(0, 1 - (p.t - 1.3) / 0.35);
    if (p.t > 1.7) {
      p.active = false;
      sliderOpen.current = 0;
      setReleasing([]);
    }
  });
  return { sliderOpen, releasing };
}

function QualityWatcher() {
  const setting = useUi((s) => s.qualitySetting);
  return setting === 'auto' ? (
    <PerformanceMonitor
      bounds={() => [45, 58]}
      flipflops={3}
      onDecline={() => {
        const q = useUi.getState().autoQuality;
        const i = ORDER.indexOf(q);
        if (i > 0) useUi.setState({ autoQuality: ORDER[i - 1] });
      }}
      onIncline={() => {
        const q = useUi.getState().autoQuality;
        const i = ORDER.indexOf(q);
        if (i < ORDER.length - 1) useUi.setState({ autoQuality: ORDER[i + 1] });
      }}
    />
  ) : null;
}

function SceneContent({ onColumn, canAct, showScores, scoreSeat }: SceneProps & { resetKey: number }) {
  const moves = useGame((s) => s.moves);
  const gameId = useGame((s) => s.gameId);
  const seats = useGame((s) => s.seats);
  const focusSeat = useGame((s) => s.focusSeat);
  const ui = useUi();
  const quality = effectiveQuality(ui);
  const result = useMemo(() => gameResult(moves), [moves]);
  const colorOf = useGame((s) => s.colorOf);
  const discs = useMemo(() => discsOf(moves, gameId, colorOf), [moves, gameId, colorOf]);
  const winSet = useMemo(() => new Set(result.line ?? []), [result.line]);
  const { sliderOpen, releasing } = useRelease(gameId, moves, ui.reducedMotion, colorOf);
  const seen = useRef<{ gameId: number; count: number }>({ gameId, count: moves.length });
  if (seen.current.gameId !== gameId) seen.current = { gameId, count: moves.length };
  useEffect(() => {
    if (moves.length < seen.current.count) seen.current.count = moves.length;
  }, [moves.length]);
  const [settledCount, setSettledCount] = useState(moves.length);
  useEffect(() => {
    if (moves.length < settledCount) setSettledCount(moves.length);
  }, [moves.length, settledCount]);
  const lastSettled = settledCount >= moves.length;

  const agentSeats = ([1, 2] as SeatId[]).filter((s) => seats[s].kind === 'agent');
  const seat: SeatId | null = scoreSeat ?? (agentSeats.includes(focusSeat) ? focusSeat : (agentSeats[0] ?? null));
  const rt = useGame((s) => (seat ? s.runtime[seat] : null));
  const scores = rt?.telemetry?.columnScores ?? null;
  const thinkingNow = rt && (rt.status === 'thinking' || rt.status === 'replanning');

  const heights = useMemo(() => {
    const h = [0, 0, 0, 0, 0, 0, 0];
    for (const c of moves) h[c]++;
    return h;
  }, [moves]);

  const { ghosts, grey } = useMemo(() => {
    if (!rt || !seat || result.over) return { ghosts: [] as PvGhost[], grey: false };
    const pv = rt.telemetry?.pv ?? [];
    if (!pv.length) return { ghosts: [], grey: false };
    const played = moves.slice(rt.basedOn);
    let k = 0;
    while (k < played.length && k < pv.length && played[k] === pv[k]) k++;
    const deviated = k < played.length;
    const ch3 = familyOf(seats[seat].config.algorithm) === 'ch3';
    if (deviated && !ch3) return { ghosts: [], grey: false };
    const h = [...heights];
    const out: PvGhost[] = [];
    for (let i = k; i < pv.length && out.length < 12; i++) {
      const c = pv[i];
      if (h[c] >= 6) break;
      out.push({ col: c, row: h[c]++, player: colorOf[((rt.basedOn + i) % 2 === 0 ? 1 : 2) as 1 | 2], n: i + 1 });
    }
    return { ghosts: out, grey: deviated || rt.decision?.deviated === true || rt.status === 'replanning' };
  }, [rt, seat, moves, heights, result.over, seats, colorOf]);

  const hover = ui.hoverCol;
  const armed = useRef<number | null>(null);
  const player = colorOf[seatToMove(moves)];

  const colFromPoint = (x: number) => Math.max(0, Math.min(6, Math.round(x / P + 3)));
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const c = colFromPoint(e.point.x);
    if (c !== useUi.getState().hoverCol) useUi.setState({ hoverCol: c, cursorCol: c });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    unlockAudio();
    if (!canAct) return;
    const c = colFromPoint(e.point.x);
    const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
    if (ui.confirmTap && touch && armed.current !== c) {
      armed.current = c;
      useUi.setState({ hoverCol: c });
      return;
    }
    armed.current = null;
    onColumn(c);
  };

  const showGhost = canAct && hover !== null && !result.over && heights[hover] < 6;
  return (
    <>
      <CameraRig flat={ui.flat} reducedMotion={ui.reducedMotion} resetKey={0} />
      <Lights quality={quality} />
      <QualityWatcher />
      <Board3D quality={quality} sliderOpen={sliderOpen} />
      {discs.map((d) => (
        <Disc3D
          key={d.key}
          player={d.player}
          col={d.col}
          row={d.row}
          quality={quality}
          animate={d.index >= seen.current.count}
          reducedMotion={ui.reducedMotion}
          sound={ui.sound}
          pattern={ui.pattern}
          winning={winSet.has(d.row * 7 + d.col) && lastSettled}
          releasing={false}
          onSettled={d.index === moves.length - 1 ? () => setSettledCount(moves.length) : undefined}
        />
      ))}
      {releasing.map((d) => (
        <Disc3D
          key={`r-${d.key}`}
          player={d.player}
          col={d.col}
          row={d.row}
          quality={quality}
          animate={false}
          reducedMotion={ui.reducedMotion}
          sound={false}
          pattern={ui.pattern}
          winning={false}
          releasing
          releaseDelay={0.3 + d.row * 0.02}
        />
      ))}
      {showGhost && <GhostPreview col={hover} row={heights[hover]} player={player} quality={quality} />}
      {ghosts.length > 0 && !showGhost && <PvGhosts ghosts={ghosts} grey={grey} quality={quality} />}
      {showScores && scores && (thinkingNow || rt?.status === 'done') && !result.over && <ScoreOverlay scores={scores} best={rt?.telemetry?.bestCol ?? null} />}
      {result.line && lastSettled && <WinLine cells={result.line} reducedMotion={ui.reducedMotion} />}
      {result.winner !== 0 && lastSettled && !ui.reducedMotion && <Confetti seed={gameId * 7 + moves.length} />}
      {}
      <mesh
        position={[0, LIFT + BOARD_H / 2 + 0.6, FRONT_Z + FRONT_T + 0.35]}
        onPointerMove={onMove}
        onPointerOut={() => useUi.setState({ hoverCol: null })}
        onClick={onClick}
        visible={false}
      >
        <planeGeometry args={[BOARD_W, BOARD_H + 1.6]} />
      </mesh>
      {quality !== 'low' && <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={16} blur={2.4} far={6} resolution={quality === 'high' ? 1024 : 512} />}
      {quality === 'high' && result.winner !== 0 && lastSettled && (
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
        </EffectComposer>
      )}
      <Floor />
    </>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
      <circleGeometry args={[9, 48]} />
      <shadowMaterial transparent opacity={0.18} />
    </mesh>
  );
}

interface SceneProps {
  onColumn: (col: number) => void;
  canAct: boolean;
  showScores?: boolean;
  scoreSeat?: SeatId | null;
}

export default function Scene3D({ onColumn, canAct, showScores = true, scoreSeat = null }: SceneProps) {
  const ui = useUi();
  const quality = effectiveQuality(ui);
  const [resetKey, setResetKey] = useState(0);
  return (
    <Canvas
      key={`${ui.flat}-${resetKey}`}
      shadows={quality !== 'low' ? 'soft' : false}
      dpr={DPR[quality]}
      gl={{ antialias: quality !== 'low', alpha: true, powerPreference: 'high-performance' }}
      onDoubleClick={() => setResetKey((k) => k + 1)}
      style={{ touchAction: 'none' }}
      aria-label="3D Connect Four board. Use the column buttons below or keys 1 to 7."
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV) (window as unknown as { __scene: THREE.Scene }).__scene = scene;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <SceneContent onColumn={onColumn} canAct={canAct} showScores={showScores} scoreSeat={scoreSeat} resetKey={resetKey} />
    </Canvas>
  );
}

export { CENTER_Y };
