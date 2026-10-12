import { Environment, Lightformer, Edges, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import type { BloomEffect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { appMode } from '../../app/AppMode';
import type { LaunchStage } from '../../app/appState';
import { Field } from './ParticleHello';
import {WorldNavigation} from '../../model/worldNavigation';
import {modelController} from '../../model/modelController';
import {workspace} from '../../project/workspace';
import { CanvasPlane } from './CanvasPlane';
import {ProjectStage} from './ProjectStage';
import {WaterTouchSurface} from './WaterTouchSurface';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { INK_CHUNK_STROKES, type QualityTierConfig } from '../../config';
import type { DrawEngine } from '../../engine/DrawEngine';
import { themeController } from '../../theme/themeController';
import { mixTheme } from '../../theme/themes';
import type { MaterialPresetId, Point, Stroke } from '../../types/drawing';
import { inspectController, InspectController } from './inspectController';
import { screenToNdc, spatialNavTarget, type SpatialNavBaseline } from './spatialNavigation';
import type { SpatialNavIntent } from '../../engine/DrawEngine';
import { disposeStrokeMaterials, getStrokeMaterial, cachedMaterials } from './materials';
import { LiveTube } from './LiveTube';
import { brushRadius, planeToWorld, resamplePolyline, worldToPlane } from './plane';
import { registerCapture, renderToDataUrl, renderArtworkCanvas } from './capture';
import { outline, strokePath, paintAlpha, paperCss, PAPER_WIDTH, PAPER_HEIGHT } from '../canvas2d/freehand';

const APPEAR_MS = 200;
const SETTLE_MS = 340;
const DISSOLVE_MS = 220;
/**
 * A dissolve has to rebuild the stroke's tube to fade it, so on a mass clear only
 * the most recent few ink lines dissolve; the rest leave with their chunk.
 */
const MAX_DISSOLVE_STROKES = 12;

/** The model stage is scenery only; every editable model belongs to ProjectStage. */
function ModelFloor(){
  const root=useRef<THREE.Group>(null),grid=useRef<THREE.GridHelper>(null);
  useFrame(()=>{if(!root.current)return;const weight=appMode.weights().MODEL_CONTROL;root.current.visible=weight>.001;root.current.scale.setScalar(.94+.06*weight);root.current.position.z=-4*(1-weight);if(grid.current){const materials=Array.isArray(grid.current.material)?grid.current.material:[grid.current.material];for(const material of materials){material.transparent=true;material.opacity=.15*weight;material.depthWrite=false;}}});
  return <group ref={root} userData={{excludeFromArtwork:true}}><gridHelper ref={grid} args={[36,36,'#8195a8','#9caebe']} position={[0,-3.08,0]} userData={{excludeFromArtwork:true}}/><mesh position={[0,-3,0]} rotation={[-Math.PI/2,0,0]} userData={{excludeFromArtwork:true}}><circleGeometry args={[3.2,64]}/><meshStandardMaterial color="#90a1b8" transparent opacity={.12}/><Edges color="#8193ab"/></mesh></group>;
}

/** A drawing-plane grid makes depth and origin legible without introducing a
 * desktop-style toolbar or changing the stored stroke coordinates. */
function SpatialReference({home}:{home:boolean}){
  const root=useRef<THREE.Group>(null),grid=useRef<THREE.GridHelper>(null);
  useFrame(()=>{const weight=appMode.weights().SPATIAL_DRAW;if(root.current){root.current.visible=!home&&weight>.001;root.current.scale.setScalar(.9+.1*weight);}if(grid.current){const materials=Array.isArray(grid.current.material)?grid.current.material:[grid.current.material];for(const material of materials){material.transparent=true;material.opacity=.09*weight;material.depthWrite=false;}}});
  return <group ref={root} userData={{excludeFromArtwork:true}}><gridHelper ref={grid} args={[16,16,'#8da3bd','#b2c0d0']} position={[0,0,-.55]} rotation={[Math.PI/2,0,0]} userData={{excludeFromArtwork:true}}/><mesh position={[0,0,-.5]} userData={{excludeFromArtwork:true}}><boxGeometry args={[16,.012,.01]}/><meshBasicMaterial color="#c57d75" transparent opacity={.48}/></mesh><mesh position={[0,0,-.49]} userData={{excludeFromArtwork:true}}><boxGeometry args={[.012,9,.01]}/><meshBasicMaterial color="#7d9f8c" transparent opacity={.46}/></mesh><mesh position={[0,0,-.47]} userData={{excludeFromArtwork:true}}><ringGeometry args={[.1,.13,40]}/><meshBasicMaterial color="#687f9d" transparent opacity={.58} side={THREE.DoubleSide}/></mesh></group>;
}

function ModelOrientationGizmo(){
  const mode=useSyncExternalStore(appMode.subscribe,appMode.getSnapshot);
  if(mode.target!=='MODEL_CONTROL'||mode.mode==='HOME')return null;
  // GizmoHelper takes over R3F's render loop. Priority 1 renders the default
  // scene before its HUD; higher priorities draw only the portal and make the
  // workspace canvas appear empty.
  // The right rail overlays the canvas, so anchor the reference to the clear
  // drawing area instead of putting it underneath that panel.
  return <GizmoHelper alignment="top-left" margin={[88,108]} renderPriority={1}><GizmoViewport disabled hideNegativeAxes axisColors={['#bd796e','#769b85','#748bb5']} axisScale={[.68,.04,.04]} labelColor="#334155" font="600 17px system-ui, sans-serif"/></GizmoHelper>;
}

/** Subtle hue drift along a stroke: alive without rainbow noise. */
function hueAt(t: number): number {
  return (t - 0.5) * 0.045;
}

function addVertexColors(geometry: THREE.BufferGeometry, color: THREE.Color, tubularSegments: number): void {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const perRing = tubularSegments > 0 ? count / (tubularSegments + 1) : count;
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const t = perRing > 0 ? Math.min(1, Math.floor(i / perRing) / Math.max(1, tubularSegments)) : 0;
    tmp.copy(color).offsetHSL(hueAt(t), 0, 0);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** One committed segment → merged tube + rounded end caps, built once. */
function buildSegmentGeometry(
  segment: readonly Point[],
  radius: number,
  quality: QualityTierConfig,
  color: THREE.Color,
  lod: number,
): THREE.BufferGeometry | null {
  const scale = quality.tubularScale * lod;
  const resampled = resamplePolyline(segment, 0.006, Math.max(16, Math.round(240 * scale)));
  if (resampled.length === 0) return null;
  if (resampled.length === 1) {
    const sphere = new THREE.SphereGeometry(radius, quality.radialSegments, Math.max(6, quality.radialSegments >> 1));
    sphere.translate(...planeToWorld(resampled[0]));
    addVertexColors(sphere, color, 0);
    return sphere;
  }

  const curve = new THREE.CatmullRomCurve3(
    resampled.map((point) => new THREE.Vector3(...planeToWorld(point))),
    false,
    'catmullrom',
    0.5,
  );
  const tubularSegments = Math.min(Math.max(Math.round(resampled.length * 3 * lod), 8), Math.round(700 * scale));
  const tube = new THREE.TubeGeometry(curve, tubularSegments, radius, quality.radialSegments, false);
  addVertexColors(tube, color, tubularSegments);

  const capA = new THREE.SphereGeometry(radius, quality.radialSegments, Math.max(6, quality.radialSegments >> 1));
  capA.translate(...planeToWorld(resampled[0]));
  addVertexColors(capA, color, 0);
  const capB = capA.clone();
  const end = new THREE.Vector3(...planeToWorld(resampled[resampled.length - 1]));
  const start = new THREE.Vector3(...planeToWorld(resampled[0]));
  capB.translate(end.x-start.x, end.y-start.y, end.z-start.z);

  const merged = mergeGeometries([tube, capA, capB], false);
  tube.dispose();
  capA.dispose();
  capB.dispose();
  return merged;
}

function buildStrokeGeometries(stroke: Stroke, quality: QualityTierConfig): THREE.BufferGeometry[] {
  const color = new THREE.Color(stroke.color);
  const radius = brushRadius(stroke.width);
  return stroke.segments
    .map((segment) => buildSegmentGeometry(segment, radius, quality, color, stroke.lod))
    .filter((geometry): geometry is THREE.BufferGeometry => geometry !== null);
}

function StrokeMesh({
  stroke,
  quality,
}: {
  stroke: Stroke;
  quality: QualityTierConfig;
}) {
  const group = useRef<THREE.Group>(null);
  const appearStart = useRef<number | null>(null);
  const settled = useRef(false);
  const geometries = useMemo(() => buildStrokeGeometries(stroke, quality), [stroke, quality]);
  // The settling stroke owns a private material so its sheen can move without
  // dragging every other stroke of the same preset along with it.
  const material = useMemo(() => getStrokeMaterial(stroke.material, stroke.color, stroke.surface).clone(), [stroke]);

  useEffect(() => {
    return () => {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    };
  }, [geometries, material]);

  // Only the newest stroke is ever animated, so this callback runs for a moment.
  useFrame((now) => {
    const g = group.current;
    if (!g || settled.current) return;
    if (appearStart.current === null) appearStart.current = now.clock.elapsedTime * 1000;
    const elapsed = now.clock.elapsedTime * 1000 - appearStart.current;
    const u = Math.min(1, elapsed / APPEAR_MS);
    // Geometry is in world coordinates. Feedback must never move it toward the origin.
    material.envMapIntensity = mixTheme(themeController.t).materialEnvIntensity * (1 + 0.55 * u);
    if (u < 1) return;

    // Settle: the sheen sweeps back to the room's own lighting and the ink stops
    // moving, which is what makes a stroke read as a solid object rather than a
    // live preview. It borrows the theme's current value so it can never look
    // different from the ink around it.
    const s = Math.min(1, (elapsed - APPEAR_MS) / SETTLE_MS);
    material.envMapIntensity = mixTheme(themeController.t).materialEnvIntensity * (1 + 0.55 * (1 - s));
    if (s >= 1) {
      settled.current = true;
      g.scale.setScalar(1);
    }
  });

  return (
    <group ref={group}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} frustumCulled={false} />
      ))}
    </group>
  );
}

/** Dissolve animation for removed strokes; disposes its cloned material. */
function DyingStroke({ stroke, quality, onDone }: { stroke: Stroke; quality: QualityTierConfig; onDone: () => void }) {
  const startedAt = useRef<number | null>(null);
  const group = useRef<THREE.Group>(null);
  const finished = useRef(false);
  const geometries = useMemo(() => buildStrokeGeometries(stroke, quality), [stroke, quality]);
  const material = useMemo(() => getStrokeMaterial(stroke.material, stroke.color, stroke.surface).clone(), [stroke]);

  useEffect(() => {
    return () => {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    };
  }, [geometries, material]);

  useFrame((now) => {
    if (finished.current) return;
    if (startedAt.current === null) startedAt.current = now.clock.elapsedTime * 1000;
    const u = Math.min(1, (now.clock.elapsedTime * 1000 - startedAt.current) / DISSOLVE_MS);
    const g = group.current;
    if (g) {
      g.scale.setScalar(1 - 0.3 * u);
      material.opacity = 1 - u;
      material.transparent = true;
    }
    if (u >= 1) {
      finished.current = true;
      onDone();
    }
  });

  return (
    <group ref={group}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} frustumCulled={false} />
      ))}
    </group>
  );
}

/**
 * Committed ink is drawn as a handful of merged chunks instead of one mesh per
 * stroke: a 300-stroke session would otherwise cost 300 draw calls and grow the
 * frame time linearly with the canvas. Chunk membership is stable, so drawing a
 * new stroke only rebuilds the chunk it joins.
 */
type InkChunk = { signature: string; material: MaterialPresetId; color: string; surface?:Stroke['surface']; strokes: Stroke[] };
const strokeKeys=new WeakMap<Stroke,number>();let nextStrokeKey=1;
function strokeKey(stroke:Stroke){if(!strokeKeys.has(stroke))strokeKeys.set(stroke,nextStrokeKey++);return strokeKeys.get(stroke);}

function planInk(committed: readonly Stroke[], heldOutId: number | null): InkChunk[] {
  const chunks: InkChunk[] = [];
  for (const stroke of committed) {
    if (stroke.id === heldOutId) continue;
    const last = chunks[chunks.length - 1];
    if (last && last.material === stroke.material && last.color === stroke.color && last.surface === stroke.surface && last.strokes.length < INK_CHUNK_STROKES) {
      last.strokes.push(stroke);
    } else {
      chunks.push({ signature: '', material: stroke.material, color: stroke.color, surface:stroke.surface, strokes: [stroke] });
    }
  }
  for (const chunk of chunks) {
    chunk.signature = `${chunk.material}|${chunk.color}|${chunk.surface??''}|${chunk.strokes.map(strokeKey).join(',')}`;
  }
  return chunks;
}

/** Publishes an imperative frame capture for the save flow and the gallery. */
function CaptureBridge({ engine }: { engine: DrawEngine }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const ink = () => engine.workspaceMode === 'CANVAS_DRAW' ? {
      background: paperCss(engine.canvasBackground),
      paint: (ctx: CanvasRenderingContext2D) => {
        const active = engine.activeStroke;
        const strokes = engine.strokesFor('CANVAS_DRAW');
        for (const stroke of active ? [...strokes, active] : strokes) {
          ctx.globalAlpha = paintAlpha(stroke.tool); ctx.fillStyle = stroke.color;
          for (const segment of stroke.segments) {
            const polygon = outline(segment, stroke).map(([x, y]) => {
              const p = engine.docToScreen({ x: x / PAPER_WIDTH, y: y / PAPER_HEIGHT, z: 0 });
              return [p.x, p.y];
            });
            ctx.fill(new Path2D(strokePath(polygon)));
          }
        }
        ctx.globalAlpha = 1;
      },
    } : undefined;
    registerCapture((options) => renderToDataUrl(gl, scene, camera, options, ink()),
      options => renderArtworkCanvas(gl, scene, camera, options, ink()));
    return () => registerCapture(null);
  }, [gl, scene, camera, engine]);
  return null;
}

function Strokes({ engine, quality }: { engine: DrawEngine; quality: QualityTierConfig }) {
  const [committed, setCommitted] = useState<readonly Stroke[]>(()=>[...engine.strokesFor('SPATIAL_DRAW')]);
  const [dying, setDying] = useState<{ stroke: Stroke; key: number }[]>([]);
  const committedRef = useRef<readonly Stroke[]>(committed);
  const dyingKey = useRef(0);
  const ink = useRef(new Map<string, THREE.BufferGeometry>());
  const inkQuality = useRef(quality);

  useEffect(
    () =>
      engine.onHistoryChange(() => {
        const next = [...engine.strokesFor('SPATIAL_DRAW')];
        const nextIds = new Set(next.map((s) => s.id));
        const removed = committedRef.current.filter((s) => !nextIds.has(s.id));
        committedRef.current = next;
        setCommitted(next);
        if (removed.length > 0) {
          const dissolving = removed.slice(-MAX_DISSOLVE_STROKES);
          setDying((d) => [...d, ...dissolving.map((stroke) => ({ stroke, key: dyingKey.current++ }))]);
        }
      }),
    [engine],
  );

  useEffect(() => {
    const cache = ink.current;
    return () => {
      for (const geometry of cache.values()) geometry.dispose();
      cache.clear();
    };
  }, []);

  const newest = committed.length > 0 ? committed[committed.length - 1] : null;
  const chunks = planInk(committed, newest?.id ?? null);

  // A quality switch invalidates every merged chunk.
  if (inkQuality.current !== quality) {
    for (const geometry of ink.current.values()) geometry.dispose();
    ink.current.clear();
    inkQuality.current = quality;
  }

  const live = new Set<string>();
  const meshes: { signature: string; geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const chunk of chunks) {
    live.add(chunk.signature);
    let geometry = ink.current.get(chunk.signature);
    if (!geometry) {
      const parts = chunk.strokes.flatMap((stroke) => buildStrokeGeometries(stroke, quality));
      geometry = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
      for (const part of parts) part.dispose();
      ink.current.set(chunk.signature, geometry);
    }
    meshes.push({ signature: chunk.signature, geometry, material: getStrokeMaterial(chunk.material, chunk.color, chunk.surface) });
  }
  for (const [signature, geometry] of ink.current) {
    if (!live.has(signature)) {
      geometry.dispose();
      ink.current.delete(signature);
    }
  }

  return (
    <>
      {meshes.map((mesh) => (
        <mesh key={mesh.signature} geometry={mesh.geometry} material={mesh.material} frustumCulled />
      ))}
      {newest && <StrokeMesh stroke={newest} quality={quality} />}
      {dying.map((d) => (
        <DyingStroke
          key={d.key}
          stroke={d.stroke}
          quality={quality}
          onDone={() => setDying((list) => list.filter((item) => item.key !== d.key))}
        />
      ))}
    </>
  );
}

/**
 * The stroke in progress: an incrementally growing tube (ring-append, no
 * rebuilds) plus a brush-sized tip sphere that lerps toward the fingertip at
 * render rate, so the ink appears to grow out of the finger.
 */
function LiveStroke({ engine }: { engine: DrawEngine }) {
  const live = useMemo(() => new LiveTube(), []);
  const tip = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    );
    mesh.visible = false;
    return mesh;
  }, []);
  useEffect(() => {
    return () => {
      live.dispose();
      tip.geometry.dispose();
      (tip.material as THREE.Material).dispose();
    };
  }, [live, tip]);

  const track = useRef({ strokeId: -1, segment: -1, count: 0 });
  const tipTarget = useRef(new THREE.Vector3());
  const cursorPoint = useRef<Point | null>(null);

  useEffect(
    () =>
      engine.onCursor((cursor) => {
        cursorPoint.current = cursor.visible ? engine.cursorPlanePoint() : null;
      }),
    [engine],
  );

  useFrame(() => {
    const stroke = engine.activeStroke;
    if (!stroke) {
      live.mesh.visible = false;
      track.current.strokeId = -1;
    } else {
      const segmentIndex = stroke.segments.length - 1;
      if (track.current.strokeId !== stroke.id || track.current.segment !== segmentIndex) {
        track.current = { strokeId: stroke.id, segment: segmentIndex, count: 0 };
        live.reset(stroke.color);
        live.material.copy(getStrokeMaterial(stroke.material,stroke.color,stroke.surface));live.material.vertexColors=false;
      }
      const segment = stroke.segments[segmentIndex];
      if(track.current.count>segment.length){track.current.count=0;live.reset(stroke.color);}
      while (track.current.count < segment.length && live.ringCount < 719) {
        const point = segment[track.current.count];
        live.addPoint(point, stroke.width, hueAt(track.current.count / Math.max(1, segment.length)));
        track.current.count += 1;
      }
      (live.material as THREE.MeshPhysicalMaterial).color.set(stroke.color);
      tipTarget.current.set(...planeToWorld(segment[segment.length - 1]));
      tip.scale.setScalar(brushRadius(stroke.width));
      (tip.material as THREE.MeshPhysicalMaterial).color.set(stroke.color);
    }

    // Tip sphere follows the (interpolated) cursor when idle, the ink tip when drawing.
    const target = stroke ? tipTarget.current : cursorPoint.current
      ? new THREE.Vector3(...planeToWorld(cursorPoint.current))
      : null;
    if (!target) {
      tip.visible = false;
    } else {
      tip.visible = true;
      tip.position.copy(target);
      if (!stroke) tip.scale.setScalar(brushRadius(engine.currentBrushWidth()) * 0.9);
    }
  });

  return (
    <>
      <primitive object={live.mesh} />
      <primitive object={tip} userData={{ excludeFromArtwork: true }} />
    </>
  );
}

/** Lights / background / environment / bloom all follow the theme blend. */
function ThemeRig({ bloomRef, envOn, home }: { bloomRef: React.MutableRefObject<BloomEffect | null>; envOn: boolean; home: boolean }) {
  const ambient = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const grid = useRef<THREE.GridHelper>(null);
  const background = useMemo(() => new THREE.Color(), []);
  const lastT = useRef(-1);
  const gridFade = useRef(home ? 0 : 1);

  useFrame((state, delta) => {
    const t = themeController.t;
    const vars = mixTheme(t);
    background.setRGB(vars.sceneBg[0] / 255, vars.sceneBg[1] / 255, vars.sceneBg[2] / 255);
    state.scene.background = background;
    if (ambient.current) ambient.current.intensity = vars.ambientIntensity;
    if (key.current) key.current.intensity = vars.keyIntensity;
    if (rim.current) rim.current.intensity = vars.keyIntensity * 0.32;
    if (grid.current) {
      const material = grid.current.material as THREE.Material & { opacity: number; transparent: boolean };
      // GridHelper ships a non-transparent line material, so `opacity` alone did
      // nothing at all: the ruled floor was always fully on, including behind the
      // welcome field, where it read as a rendering glitch.
      material.transparent = true;
      // The welcome field is points on a soft gradient; the grid fades out with it.
      gridFade.current += ((home ? 0 : 1) - gridFade.current) * Math.min(1, delta * 3.5);
      material.opacity = vars.gridAlpha * appMode.weights().SPATIAL_DRAW * gridFade.current;
      material.depthWrite = false;
    }
    if (envOn) state.scene.environmentIntensity = vars.envIntensity;
    if (bloomRef.current) bloomRef.current.intensity = vars.bloomIntensity;
    if (Math.abs(t - lastT.current) > 0.01) {
      lastT.current = t;
      // Materials pick up the new environment strength as the day/night blends.
      for (const material of cachedMaterials()) material.envMapIntensity = vars.materialEnvIntensity;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.55} />
      <directionalLight ref={key} position={[6, 9, 10]} intensity={1.7} />
      <directionalLight ref={rim} position={[-8, 3, -6]} intensity={0.55} color="#a3bad4" />
      <gridHelper ref={grid} userData={{ excludeFromArtwork: true }} args={[60, 24, '#8fa3c8', '#8fa3c8']} position={[0, -7.2, 0]} />
    </>
  );
}

/**
 * Palm navigation for the 3D ink. The engine decides *when* a hand owns navigation;
 * this component owns the camera math, because only here are the camera matrices
 * available. Baselines are frozen at `begin` and every later frame recomputes the
 * rig target from them, so the camera is never its own input.
 */
function SpatialNav({ engine }: { engine: DrawEngine }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const base = useRef<SpatialNavBaseline | null>(null);
  const pending = useRef<SpatialNavIntent | null>(null);

  useEffect(() => engine.onSpatialNav((intent) => { pending.current = intent; }), [engine]);

  useFrame(() => {
    const intent = pending.current;
    if (!intent) return;
    pending.current = null;
    const surface = { x: size.width, y: size.height };
    if (intent.kind === 'end') {
      base.current = null;
      inspectController.navEnd();
      return;
    }
    if (intent.kind === 'begin') {
      inspectController.direct = true;
      const palmNdc = screenToNdc(intent.palmScreen, surface);
      base.current = {
        camPos: camera.position.clone(),
        camQuat: camera.quaternion.clone(),
        halfTan: Math.tan((camera.fov * Math.PI) / 360),
        aspect: size.width / size.height,
        planeZ: 0,
        centreX: inspectController.centerX,
        centreY: inspectController.centerY,
        distance: inspectController.distance,
        palmNdc,
        midNdc: intent.midScreen ? screenToNdc(intent.midScreen, surface) : palmNdc,
        distancePx: intent.distancePx || 1,
      };
      return;
    }
    const b = base.current;
    if (!b) return;
    const target = spatialNavTarget(
      b,
      intent.palmScreen ? screenToNdc(intent.palmScreen, surface) : null,
      intent.midScreen ? screenToNdc(intent.midScreen, surface) : null,
      intent.distancePx,
      { min: InspectController.DIST_MIN, max: InspectController.DIST_MAX, centre: InspectController.CENTRE_LIMIT },
    );
    // A degenerate frame (hands crossed, ray parallel) holds the view instead of
    // dividing by noise; the session simply skips it.
    if (target) inspectController.navSet(target.centerX, target.centerY, target.distance);
  });
  return null;
}

/**
 * Damped inspect camera; springs home when inspect mode ends.
 *
 * It is also the only place that knows where the eye is, so it answers the engine's
 * question — "which point of the drawing plane does this screen pixel look at?" — with
 * the same matrices that rendered the frame. That is what lets a stroke start under the
 * cursor instead of at a fixed pixel scale the camera has never agreed to.
 */
function CameraRig({ inspect, home, engine }: { inspect: boolean; home: boolean; engine: DrawEngine }) {
  const world=useRef(new WorldNavigation());
  const {gl}=useThree();const railWidth=useRef(0),projectionOffset=useRef(0);
  useEffect(()=>{
    const host=gl.domElement.closest('[data-rail]');if(!host)return;
    const sync=()=>{railWidth.current=parseFloat(getComputedStyle(host).getPropertyValue('--rail-w'))||0;};
    const observer=new MutationObserver(sync);observer.observe(host,{attributes:true,attributeFilter:['data-rail']});window.addEventListener('resize',sync);sync();
    return()=>{observer.disconnect();window.removeEventListener('resize',sync);};
  },[gl]);
  useEffect(()=>()=>world.current.end(),[]);
  const live = useRef<{ camera: THREE.PerspectiveCamera; width: number; height: number } | null>(null);
  useEffect(() => {
    engine.setWorldRaycaster((screen) => {
      const state = live.current;
      if (!state) return null;
      const { camera, width, height } = state;
      const direction = new THREE.Vector3((screen.x / width) * 2 - 1, -((screen.y / height) * 2 - 1), 0.5)
        .unproject(camera)
        .sub(camera.position);
      if (Math.abs(direction.z) < 1e-6) return null; // looking along the plane, not at it
      direction.normalize();
      const depth = (screen.z ?? 0) * 0.35;
      const t = (depth - camera.position.z) / direction.z;
      if (!(t > 0)) return null;
      return worldToPlane({
        x: camera.position.x + direction.x * t,
        y: camera.position.y + direction.y * t,
        z: depth,
      });
    });
    return () => engine.setWorldRaycaster(null);
  }, [engine]);
  useFrame((state, delta) => {
    live.current = { camera: state.camera as THREE.PerspectiveCamera, width: state.size.width, height: state.size.height };
    const modelMode=appMode.getSnapshot().target==='MODEL_CONTROL'&&!home;
    const cameraProjection=state.camera as THREE.PerspectiveCamera;
    projectionOffset.current=THREE.MathUtils.lerp(projectionOffset.current,modelMode?railWidth.current/2:0,1-Math.exp(-16*delta));
    if(projectionOffset.current>.01)cameraProjection.setViewOffset(state.size.width,state.size.height,projectionOffset.current,0,state.size.width,state.size.height);else cameraProjection.clearViewOffset();
    const navigation=world.current.update(engine,state.camera as THREE.PerspectiveCamera,delta,modelMode&&appMode.getSnapshot().mode!=='TRANSITION');
    if(modelMode){
      if((modelController.targetId||modelController.grabbed)&&!engine.tracking.secondaryContact)return;
      if(modelController.frameTarget&&performance.now()-modelController.frameRequestedAt>2500)modelController.frameTarget=null;
      if(modelController.frameTarget){
        const box=new THREE.Box3();state.scene.updateMatrixWorld(true);
        state.scene.traverse(object=>{const id=object.userData.sceneObjectId as string|undefined;if(id&&object.visible&&(modelController.frameTarget==='all'||workspace.selection.includes(id)))box.expandByObject(object,true);});
        if(!box.isEmpty()){const radius=box.getSize(new THREE.Vector3()).length()/2;world.current.focus(box.getCenter(new THREE.Vector3()),radius/Math.sin(THREE.MathUtils.degToRad(21)) * 1.15);modelController.frameTarget=null;}
      }
      const camera=state.camera as THREE.PerspectiveCamera;camera.fov=42;camera.updateProjectionMatrix();
      const fitAspect=Math.max(.15,Math.min(1,(state.size.width-railWidth.current)/state.size.height));
      const cp=Math.cos(navigation.pitch),target=new THREE.Vector3(Math.sin(navigation.yaw)*cp,Math.sin(navigation.pitch),Math.cos(navigation.yaw)*cp).multiplyScalar(navigation.distance/fitAspect).add(navigation.center);
      camera.position.lerp(target,1-Math.exp(-18*delta));camera.lookAt(navigation.center);return;
    }
    // A stroke is projected with the current camera. Continuing a return-to-home
    // spring after its first sample would move existing ink away from a still pointer.
    if(engine.debugInternals.penDown && !inspect && !home) return;
    const { yaw, pitch, distance, centerX, centerY } = inspectController.update(delta, inspect);
    const canvasWeight=appMode.weights().CANVAS_DRAW;
    const camera=state.camera as THREE.PerspectiveCamera;
    const targetFov=42*(1-canvasWeight)+5*canvasWeight;
    camera.fov=targetFov;camera.updateProjectionMatrix();
    const targetDistance=home?17:distance*(1-canvasWeight)+(4.5/Math.tan(5*Math.PI/360))*canvasWeight;
    const cp = Math.cos(pitch);
    const blend=1-canvasWeight;
    state.camera.position.lerp(new THREE.Vector3(
      Math.sin(yaw*blend) * cp * targetDistance + centerX*blend,
      Math.sin(pitch*blend) * targetDistance + centerY*blend,
      Math.cos(yaw*blend) * (canvasWeight+cp*blend) * targetDistance,
    ),1-Math.exp(-18*delta));
    state.camera.lookAt(centerX*blend, centerY*blend, 0);
  });
  return null;
}

function StatsReporter({ engine }: { engine: DrawEngine }) {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((state, delta) => {
    acc.current.frames += 1;
    acc.current.time += delta;
    if (acc.current.time >= 0.5) {
      engine.setRenderStats({
        drawCalls: state.gl.info.render.calls,
        geometries: state.gl.info.memory.geometries,
        sceneFps: acc.current.frames / acc.current.time,
      });
      acc.current = { frames: 0, time: 0 };
    }
  });
  return null;
}

export type Scene3DProps = {
  engine: DrawEngine;
  quality: QualityTierConfig;
  inspect: boolean;
  home:boolean;
  launchStage:LaunchStage;
  /** The hub is a door, not a workspace: nothing on the canvas belongs there. */
  hub?: boolean;
  /** Only the welcome sequence itself draws the particle field. */
  welcome?: boolean;
  ready:boolean;
  reduced:boolean;
  onSoftwareRenderer?:()=>void;
};

function SpatialLayer({engine,quality,home}:{engine:DrawEngine;quality:QualityTierConfig;home:boolean}){
  const group=useRef<THREE.Group>(null);
  useFrame(()=>{if(!group.current)return;const weight=appMode.weights().SPATIAL_DRAW;group.current.visible=!home&&weight>.001;group.current.position.z=-8*(1-weight);group.current.scale.setScalar(.65+.35*weight);});
  return <group ref={group}><Strokes engine={engine} quality={quality}/><LiveStroke engine={engine}/></group>;
}

export function Scene3D({ engine, quality, inspect,home,launchStage,hub,welcome = home,ready,reduced,onSoftwareRenderer }: Scene3DProps) {
  const bloomRef = useRef<BloomEffect | null>(null);

  useEffect(() => {
    return () => disposeStrokeMaterials();
  }, []);

  return (
    <Canvas
      dpr={[1, quality.dprMax]}
      camera={{ position: [0, 0, 13.5], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        const context=state.gl.getContext();
        const info=context.getExtension('WEBGL_debug_renderer_info');
        const renderer=String(context.getParameter(info?info.UNMASKED_RENDERER_WEBGL:context.RENDERER));
        if(/swiftshader|llvmpipe|software/i.test(renderer))onSoftwareRenderer?.();
        state.gl.domElement.dataset.airdrawCanvas='true';
        state.gl.toneMappingExposure = 1.05;
        if (import.meta.env.DEV) {
          (window as Window & { __airdrawThree?: typeof state }).__airdrawThree = state;
        }
      }}
      style={{
        // The scene is drawn, not clicked: every 3D interaction (pen, grab, inspect drag)
        // is a raycast the engine performs against the hand cursor, while the surfaces
        // that need pointers — the dock and property rail — are DOM.
        // Left hit-testable, this full-window canvas sat on top of them and swallowed
        // real mouse clicks as well as pinches.
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <ThemeRig bloomRef={bloomRef} envOn={quality.envResolution > 0} home={home} />
      <CaptureBridge engine={engine} />

      {quality.envResolution > 0 && (
        <Environment resolution={quality.envResolution} frames={1}>
          <Lightformer form="rect" intensity={2.2} position={[0, 6, 6]} scale={[12, 7, 1]} target={[0, 0, 0]} color="#cfe9ff" />
          <Lightformer form="rect" intensity={1.1} position={[-7, 1, -5]} scale={[7, 5, 1]} target={[0, 0, 0]} color="#d8e0ea" />
          <Lightformer form="circle" intensity={1.6} position={[7, 2, -3]} scale={5} target={[0, 0, 0]} color="#bff7ff" />
        </Environment>
      )}

      <group visible={!home&&!hub}>
        <SpatialReference home={home}/>
        <SpatialLayer engine={engine} quality={quality} home={home}/>
        <CanvasPlane engine={engine}/>
        <ProjectStage engine={engine}/>
        <ModelFloor/>
        <WaterTouchSurface engine={engine}/>
      </group>
      {welcome && <Field engine={engine} stage={launchStage} count={reduced ? 900 : quality.bloom ? 4200 : 2400} word="Hello" reduced={reduced}/>}
      {ready && <Field stage="hello" count={1400} word="Ready!" reduced={reduced}/>}
      <SpatialNav engine={engine} />
      <CameraRig inspect={inspect} home={home} engine={engine} />
      <ModelOrientationGizmo/>

      {quality.bloom && (
        <EffectComposer multisampling={0}>
          <Bloom ref={bloomRef} intensity={0.55} luminanceThreshold={0.82} mipmapBlur radius={0.72} />
        </EffectComposer>
      )}

      <StatsReporter engine={engine} />
    </Canvas>
  );
}
