import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { LaunchStage } from '../../app/appState';
import { themeController } from '../../theme/themeController';
import type { DrawEngine } from '../../engine/DrawEngine';

/**
 * The opening moment: a field of points that drifts in a slow flow, gathers into a
 * readable "Hello" when the user confirms, holds, then bursts outward as the next
 * screen rises behind it.
 *
 * One `THREE.Points` with a shader does all of it — thousands of DOM nodes or
 * per-particle meshes would cost the very smoothness that makes the moment land.
 * Nothing is re-randomised per frame: each point keeps a stable seed, a stable
 * layer and a stable drift origin, and every stage is a value the material eases
 * toward, so the sequence can be interrupted at any point without a cut.
 */

const VERTEX = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aSeed;
  attribute float aPhase;
  /** 0 = far, 1 = middle, 2 = near: the three depth layers of the welcome field. */
  attribute float aLayer;
  uniform float uTime;
  uniform float uForm;
  uniform float uBurst;
  uniform float uSettle;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  uniform float uPixelRatio;
  uniform float uSize;
  varying float vAlpha;
  varying float vDepth;
  varying float vEdge;

  void main() {
    float layer = aLayer / 2.0;
    // Stagger the gather so the word assembles instead of blinking into place.
    float window = 0.55;
    float start = fract(sin(aSeed * 12.9898) * 43758.5453) * (1.0 - window);
    float form = clamp((uForm - start) / window, 0.0, 1.0);
    form = form * form * (3.0 - 2.0 * form);
    // A 1.8 % overshoot at the end of the assembly: the word lands, it does not stop.
    float pop = 1.0 + uSettle * 0.018 * sin(uSettle * 3.14159265);

    vec3 base = mix(position, aTarget * pop, form);

    // Ambient motion: a slow layered rotation plus a per-point flow, damped away as
    // the word locks together. Far layers turn slower than near ones.
    float idle = 1.0 - form;
    float spin = uTime * (0.012 + 0.020 * layer) * idle;
    float cs = cos(spin), sn = sin(spin);
    base.xy = mat2(cs, -sn, sn, cs) * base.xy;
    base.x += sin(uTime * 0.29 + aPhase * 6.2831) * (0.30 + 0.26 * layer) * idle;
    base.y += cos(uTime * 0.23 + aPhase * 4.13) * (0.24 + 0.22 * layer) * idle;
    base.z += sin(uTime * 0.19 + aPhase * 2.71) * (0.34 + 0.30 * layer) * idle;

    // Keep the settled word alive; local displacement never changes its target buffer.
    // The settled word should still read as particles, not a static bitmap. Keep
    // the drift large enough to catch peripheral vision while preserving glyphs.
    base.x += sin(uTime * 1.1 + aPhase * 6.2831) * 0.095 * form;
    base.y += cos(uTime * 0.9 + aPhase * 6.2831) * 0.10 * form;
    base.z += sin(uTime * 0.8 + aSeed * 8.0) * 0.17 * form;
    vec3 toPointer = base - uPointer;
    float near = 1.0 - smoothstep(0.0, 2.2, length(toPointer.xy));
    float shove = uPointerOn * near;
    base += normalize(vec3(toPointer.xy, 0.0) + vec3(1e-4)) * shove * mix(1.35, 0.95, form);
    base.z += shove * 0.42 * (layer - 0.5);

    // Burst: outward from the word's centre, with a tangential component so points
    // describe short curved paths instead of radiating in straight lines.
    vec3 outward = normalize(base + vec3(1e-4, 1e-4, 0.0));
    vec3 tangent = normalize(cross(outward, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    base += (outward * (3.2 + aSeed * 4.6) + tangent * (1.4 + aSeed * 2.2)) * uBurst;

    vec4 mv = modelViewMatrix * vec4(base, 1.0);
    gl_Position = projectionMatrix * mv;
    // Far points are smaller and dimmer; near points are larger and softer.
    gl_PointSize = uSize * (0.62 + 0.52 * layer) * (0.78 + 0.42 * form) * uPixelRatio * (17.0 / max(1.0, -mv.z));
    vAlpha = mix(0.98, 0.76, layer) * (0.38 + 0.62 * form) * (1.0 - uBurst) * (1.0 - 0.35 * shove);
    vDepth = clamp(0.5 + base.z * 0.06 + layer * 0.12, 0.0, 1.0);
    vEdge = mix(0.08, 0.34, layer);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  varying float vAlpha;
  varying float vDepth;
  varying float vEdge;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    // The wide edge on near layers reads as gentle defocus rather than a hard dot.
    float mask = 1.0 - smoothstep(vEdge, 0.5, d);
    vec3 tint = mix(uColor, uAccent, vDepth * 0.55);
    gl_FragColor = vec4(tint, mask * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
  }
`;

/** A deterministic spread, so a re-mount cannot reshuffle the field mid-session. */
function seeded(index: number): number {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rasterises the word once and keeps the pixels it actually painted, so the
 * particles form letters rather than an abstract blob. Outline-ish coverage with a
 * sparse grain inside keeps the glyphs crisp while still reading as particles.
 */
function sampleWordPoints(text: string, count: number, width: number, height: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const targets = new Float32Array(count * 3);
  if (!ctx) return targets;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 108px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  // A modern rounded stroke on top of the fill gives the word moderate thickness
  // with a clean contour, instead of a hairline that shatters into dots.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 13;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const edge: number[][] = [];
  const body: number[][] = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] <= 140) continue;
      const openNeighbour =
        x < 2 || y < 2 || x > canvas.width - 4 || y > canvas.height - 4 ||
        data[((y - 2) * canvas.width + x) * 4 + 3] <= 140 ||
        data[((y + 2) * canvas.width + x) * 4 + 3] <= 140 ||
        data[(y * canvas.width + x - 2) * 4 + 3] <= 140 ||
        data[(y * canvas.width + x + 2) * 4 + 3] <= 140;
      (openNeighbour ? edge : body).push([x, y]);
    }
  }
  const pool = edge.length > count * 0.4 ? edge : [...edge, ...body];
  if (pool.length === 0) return targets;
  // Fit the painted glyph bounds, not the unused margins of the raster surface.
  const painted = [...edge, ...body];
  let minX=canvas.width,maxX=0,minY=canvas.height,maxY=0;
  for(const [x,y] of painted){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
  const fit=Math.min(width/spanX,height/spanY);

  for (let i = 0; i < count; i += 1) {
    // Two thirds of the points trace the contour, the rest keep the interior grainy.
    const source = i % 3 === 0 && body.length ? body : pool;
    const [px, py] = source[Math.floor(seeded(i + text.length) * source.length) % source.length];
    targets[i * 3] = (px-(minX+maxX)/2)*fit;
    targets[i * 3 + 1] = -(py-(minY+maxY)/2)*fit;
    // A thin depth slice gives the word parallax without becoming unreadable.
    targets[i * 3 + 2] = (seeded(i + 77) - 0.5) * 0.18;
  }
  return targets;
}

export function Field({ stage, count, word, reduced, engine }: { stage: LaunchStage; count: number; word: string; reduced: boolean; engine?: DrawEngine }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const points = useRef<THREE.Points>(null);
  const eased = useRef({ form: 0, burst: 0, settle: 0, pointer: 0 });
  const mouse = useRef({x:0,y:0,active:false,at:0});
  const pointerVector = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const move=(event:PointerEvent)=>{mouse.current={x:event.clientX,y:event.clientY,active:true,at:performance.now()};};
    const leave=()=>{mouse.current.active=false;};
    window.addEventListener('pointermove',move);window.addEventListener('blur',leave);document.documentElement.addEventListener('pointerleave',leave);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('blur',leave);document.documentElement.removeEventListener('pointerleave',leave);};
  },[]);

  const { geometry, uniforms } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const targets = sampleWordPoints(word, count, word.length > 6 ? 15 : 12.4, 4.4);
    const seeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const layers = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      // Three shells with a clear hole in the middle: the centre stays breathable.
      const layer = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
      const radius = layer === 2 ? 7.5 + seeded(i + 3) * 5 : layer === 1 ? 12 + seeded(i + 11) * 7 : 18 + seeded(i + 23) * 11;
      const angle = seeded(i + 41) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (seeded(i + 57) - 0.5) * (layer === 2 ? 7 : layer === 1 ? 10 : 13);
      positions[i * 3 + 2] = Math.sin(angle) * radius * 0.45 - (layer === 2 ? 1.5 : layer === 1 ? 5 : 10);
      seeds[i] = seeded(i + 91);
      phases[i] = seeded(i + 137);
      layers[i] = layer;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    geo.computeBoundingSphere();

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uForm: { value: 0 },
        uBurst: { value: 0 },
        uSettle: { value: 0 },
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uPointerOn: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        // Slightly larger, cooler particles stay legible on the daylight welcome
        // field instead of reading as a few accidental pixels.
        uSize: { value: 5.6 },
        uColor: { value: new THREE.Color(0.45, 0.49, 0.66) },
        uAccent: { value: new THREE.Color(0.13, 0.82, 0.93) },
      },
    };
  }, [count, word]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const mat = material.current;
    if (!mat) return;
    // Keep a readable word inside narrow windows without rebuilding the point buffer.
    const scale=Math.min(1,state.viewport.width/14);
    points.current?.scale.setScalar(scale);
    const targetForm = stage === 'gathering' || stage === 'hello' ? 1 : 0;
    const targetBurst = stage === 'dispersing' || stage === 'home-ready' ? 1 : 0;
    // Critically-damped approach: interruptible, no easing curves to re-time. The rates
    // are what put the assembly inside ~1.2 s and the burst inside ~0.9 s.
    const k = reduced ? 1 : Math.min(1, delta * (targetBurst > 0 ? 2.4 : 3.6));
    eased.current.form += (targetForm - eased.current.form) * k;
    eased.current.burst += (targetBurst - eased.current.burst) * Math.min(1, delta * 2.6);
    const settling = stage === 'hello' && eased.current.form > 0.985 ? 1 : 0;
    eased.current.settle += (settling - eased.current.settle) * Math.min(1, delta * 7);
    // The pointer nudge is off while the word is being read, and fades in/out rather
    // than switching, so the field never twitches at a stage boundary.
    const camera = state.camera as THREE.PerspectiveCamera;
    const hand=engine?.tracking.primary&&performance.now()-engine.frame.at<220&&engine.cursorPlanePoint();
    const preferMouse=mouse.current.active&&performance.now()-mouse.current.at<900;
    const screen=hand&&engine&&!preferMouse?engine.toScreenPoint(hand):mouse.current;
    const pointerTarget = !reduced && !document.hidden && (hand||preferMouse) && stage!=='dispersing' && stage!=='home-ready' ? 1 : 0;
    pointerVector.set(screen.x/state.size.width*2-1,1-screen.y/state.size.height*2,.5).unproject(camera).sub(camera.position).normalize();
    const distance=-camera.position.z/pointerVector.z;
    pointerVector.multiplyScalar(distance).add(camera.position);
    points.current?.worldToLocal(pointerVector);
    eased.current.pointer += (pointerTarget - eased.current.pointer) * Math.min(1, delta * 4);
    mat.uniforms.uForm.value = eased.current.form;
    mat.uniforms.uBurst.value = eased.current.burst;
    mat.uniforms.uSettle.value = eased.current.settle;
    mat.uniforms.uPointerOn.value = eased.current.pointer;
    (mat.uniforms.uPointer.value as THREE.Vector3).copy(pointerVector);
    mat.uniforms.uTime.value = reduced ? 0 : state.clock.elapsedTime;

    // Ink and accent both follow the theme: pale points read on the night field,
    // and the same points must not disappear into the day background.
    const theme = themeController.t;
    (mat.uniforms.uColor.value as THREE.Color).setRGB(
      0.10 + (1 - theme) * 0.35,
      0.12 + (1 - theme) * 0.37,
      0.20 + (1 - theme) * 0.46,
    );
    (mat.uniforms.uAccent.value as THREE.Color).setRGB(
      0.03 + (1 - theme) * 0.1,
      0.55 + (1 - theme) * 0.27,
      0.68 + (1 - theme) * 0.25,
    );
  });

  return (
    // Lifted a touch so the word sits at optical centre and never collides with
    // the entry below it.
    <points ref={points} geometry={geometry} position={[0, 1.1, 0]} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

/**
 * Standalone host for the same field. The app renders `Field` inside its own shared
 * Canvas — never a second WebGL context; this wrapper exists so the offline Remotion
 * preview can show the identical particle stage without importing the runtime.
 */
export function ParticleHello({
  stage,
  count = 4200,
  word = 'Hello',
  reduced = false,
}: { stage: LaunchStage; count?: number; word?: string; reduced?: boolean }) {
  return (
    <Canvas
      className="ad-particle-canvas"
      camera={{ position: [0, 0, 17], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Field stage={stage} count={reduced ? Math.min(count, 1200) : count} word={word} reduced={reduced} />
    </Canvas>
  );
}
