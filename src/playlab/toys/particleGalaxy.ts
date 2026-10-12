import * as THREE from 'three';
import { NOISE_GLSL, PALETTE_GLSL } from '../shaders';
import { QUALITY_PROFILES } from '../quality';
import type { Toy, ToyContext, ToyFrame, LabEvent } from '../types';

/**
 * Particle Galaxy — a cloud of up to 90 000 points that never touches JavaScript
 * per frame.
 *
 * Every particle's position is derived in the vertex shader from a base position
 * plus a curl-noise flow plus the hand attractors, so the CPU only ever writes a
 * handful of uniforms. Shape changes are a `mix()` between two base buffers,
 * which is what lets the cloud *become* a heart instead of being rebuilt as one.
 */
type Shape = 'cloud' | 'galaxy' | 'sphere' | 'heart' | 'hello' | 'spiral';
const SHAPES: readonly Shape[] = ['cloud', 'galaxy', 'sphere', 'heart', 'hello', 'spiral'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sample a word into plane points from a throwaway canvas — no font file ships. */
function textPoints(text: string, count: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const out = new Float32Array(count * 3);
  if (!ctx) return out;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 92px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 12), 256, 68, 480);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const hits: number[] = [];
  for (let y = 0; y < canvas.height; y += 2)
    for (let x = 0; x < canvas.width; x += 2) if (data[(y * canvas.width + x) * 4 + 3] > 128) hits.push(x, y);
  for (let i = 0; i < count; i += 1) {
    if (!hits.length) break;
    const pick = (Math.floor(Math.random() * (hits.length / 2)) * 2) | 0;
    out[i * 3] = (hits[pick] / canvas.width - 0.5) * 9;
    out[i * 3 + 1] = (0.5 - hits[pick + 1] / canvas.height) * 2.4;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
  }
  return out;
}

function shapePoints(shape: Shape, count: number): Float32Array {
  const out = new Float32Array(count * 3);
  if (shape === 'hello') return textPoints('Hello!', count);
  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    let x = 0;
    let y = 0;
    let z = 0;
    switch (shape) {
      case 'sphere': {
        const v = Math.acos(2 * u - 1);
        const t = Math.random() * Math.PI * 2;
        const r = 3.2 * Math.cbrt(Math.random());
        x = r * Math.sin(v) * Math.cos(t);
        y = r * Math.cos(v) * 0.8;
        z = r * Math.sin(v) * Math.sin(t);
        break;
      }
      case 'heart': {
        const t = u * Math.PI * 2;
        const s = Math.cbrt(Math.random());
        x = 16 * Math.pow(Math.sin(t), 3) / 4.2 * s;
        y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 4.2 * s;
        z = (Math.random() - 0.5) * 0.5;
        break;
      }
      case 'spiral': {
        const t = u * Math.PI * 7;
        const r = 0.35 + u * 3.6;
        x = Math.cos(t) * r;
        y = Math.sin(t) * r * 0.55;
        z = Math.sin(t * 2.1) * 0.6;
        break;
      }
      case 'galaxy': {
        const arm = Math.floor(Math.random() * 3);
        const r = Math.pow(Math.random(), 0.6) * 4.2;
        const t = r * 0.9 + (arm * Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.5;
        x = Math.cos(t) * r;
        y = (Math.random() - 0.5) * (0.55 - r * 0.08);
        z = Math.sin(t) * r;
        break;
      }
      default: {
        const v = Math.acos(2 * Math.random() - 1);
        const t = Math.random() * Math.PI * 2;
        const r = 3.6 * Math.cbrt(Math.random());
        x = r * Math.sin(v) * Math.cos(t);
        y = r * Math.cos(v);
        z = r * Math.sin(v) * Math.sin(t);
      }
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

class GalaxyToy implements Toy {
  id = 'galaxy' as const;
  title = 'Particle Galaxy';
  titleZh = '粒子星云';
  description = '手掌是引力，握拳是斥力，食指拖出光轨；双手拉开整片星云。';
  thumbnail = { accent: '#a78bfa', preview: 'points' as const };
  capabilities = ['attract', 'repel', 'trails', 'vortex', 'shapes', 'two-hand-stretch', 'two-hand-rotate'] as const;
  supportsTwoHands = true;
  qualityLevels = ['ultra', 'high', 'balanced', 'performance'] as const;
  lesson = { prompt: '张开手掌吸引粒子', done: 'HAND_OPEN' as const, seconds: 14 };

  private root = new THREE.Group();
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private trail: THREE.Line | null = null;
  private trailGeometry: THREE.BufferGeometry | null = null;
  private trailPositions = new Float32Array(180 * 3);
  private trailCount = 0;
  private clock = 0;
  private swirl = 0;
  private morph = 1;
  private shapeIndex = 1;
  private from: Float32Array | null = null;
  private to: Float32Array | null = null;
  private count = 0;

  get group(): THREE.Group {
    return this.root;
  }

  enter(ctx: ToyContext): void {
    if (!this.points) this.build(ctx);
    this.root.visible = true;
  }

  private build(ctx: ToyContext): void {
    const profile = QUALITY_PROFILES[ctx.quality];
    this.count = Math.max(2000, Math.min(profile.particles, 90_000));
    this.from = shapePoints(SHAPES[this.shapeIndex], this.count);
    this.to = this.from.slice(0);
    const seeds = new Float32Array(this.count);
    const sizes = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      seeds[i] = Math.random();
      sizes[i] = 0.4 + Math.random() * 1.5;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.from, 3));
    this.geometry.setAttribute('aTarget', new THREE.BufferAttribute(this.to, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 1 },
        uSwirl: { value: 0 },
        uStretch: { value: new THREE.Vector3(1, 1, 1) },
        uNight: { value: 0 },
        uHue: { value: 0.72 },
        uSize: { value: ctx.quality === 'performance' ? 4 : 6 },
        uAttractors: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uFieldStrength: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        ${NOISE_GLSL}
        ${PALETTE_GLSL}
        attribute vec3 aTarget;
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime, uMorph, uSwirl, uHue, uSize;
        uniform vec3 uStretch;
        uniform vec4 uAttractors[4];
        uniform float uFieldStrength;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float m = smoothstep(0.0, 1.0, uMorph);
          vec3 p = mix(position, aTarget, m);
          // Curl flow: the cloud keeps breathing even with no hands in frame.
          p += labCurl(p * 0.42 + vec3(0.0, uTime * 0.05, aSeed * 3.0), uTime * 0.12) * (0.35 + aSeed * 0.5);
          // A swipe leaves a decaying vortex that drags the cloud around Y.
          float a = uSwirl * (1.2 - min(length(p.xz) * 0.12, 1.0));
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          p *= uStretch;
          for (int i = 0; i < 4; i++) {
            vec4 hand = uAttractors[i];
            if (hand.w == 0.0) continue;
            vec3 d = hand.xyz - p;
            float dist = length(d) + 0.05;
            float pull = min(1.0 / (dist * dist), 7.0) * hand.w * uFieldStrength;
            p += normalize(d) * pull * (0.6 + aSeed);
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * aSize * (4.0 / max(-mv.z, 0.1));
          vColor = labHsv(vec3(uHue + aSeed * 0.12 + length(p) * 0.012, 0.62, 1.0));
          vAlpha = 0.28 + 0.5 * aSeed;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(vColor * 0.65, core * core * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.root.add(this.points);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeometry, new THREE.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, blending: THREE.NormalBlending, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.root.add(this.trail);
  }

  onGesture(event: LabEvent, frame: ToyFrame): void {
    if (event === 'PALM_PUSH') this.swirl += frame.primary && frame.primary.palmVelocity.x < 0 ? -0.5 : 0.5;
    if (event === 'TWO_HAND_ROTATE') this.swirl += 0.35;
  }

  update(frame: ToyFrame, ctx: ToyContext): void {
    if (!this.material || !this.geometry) return;
    this.clock += frame.dt;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = this.clock;
    uniforms.uNight.value = frame.night;
    this.swirl *= 1 - Math.min(1, frame.dt * 0.8);
    uniforms.uSwirl.value = this.swirl;

    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + frame.dt * 0.8);
      uniforms.uMorph.value = this.morph;
    }

    const attractors = uniforms.uAttractors.value as THREE.Vector4[];
    attractors.forEach((slot) => slot.set(0, 0, 0, 0));
    let slot = 0;
    const hands = [frame.primary, frame.secondary];
    for (const hand of hands) {
      if (!hand || !hand.isStable || !frame.interactive || slot >= attractors.length) continue;
      const world = ctx.toWorld(hand.palmCenter);
      // Open palm pulls, a closed fist pushes: the sign is the whole difference.
      const strength = hand.openness >= 0.55 ? hand.openness : -(1 - hand.openness);
      attractors[slot++].set(world.x, world.y, world.z, strength);
    }

    const stretch = uniforms.uStretch.value as THREE.Vector3;
    if (frame.two?.active) {
      const scale = Math.min(2.4, Math.max(0.45, frame.two.scale));
      const angle = Math.atan2(frame.two.direction.y, frame.two.direction.x);
      stretch.set(lerp(stretch.x, scale, frame.dt * 4), lerp(stretch.y, 1 / Math.sqrt(scale), frame.dt * 4), stretch.z);
      this.root.rotation.z = lerp(this.root.rotation.z, -angle * 0.6, frame.dt * 3);
    } else {
      stretch.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, frame.dt * 2.5));
      this.root.rotation.z = lerp(this.root.rotation.z, 0, Math.min(1, frame.dt * 1.5));
    }

    this.updateTrail(frame, ctx);
  }

  /** The index fingertip draws a short light trail: a ring buffer of world points. */
  private updateTrail(frame: ToyFrame, ctx: ToyContext): void {
    if (!this.trail || !this.trailGeometry) return;
    const hand = frame.primary;
    const drawing = !!hand && hand.pinchState !== 'OPEN' && frame.interactive;
    if (drawing && hand) {
      const world = ctx.toWorld(hand.pinchPoint);
      if (this.trailCount < this.trailPositions.length / 3) {
        this.trailPositions.set([world.x, world.y, world.z], this.trailCount * 3);
        this.trailCount += 1;
      } else {
        this.trailPositions.copyWithin(0, 3);
        const last = (this.trailPositions.length / 3 - 1) * 3;
        this.trailPositions.set([world.x, world.y, world.z], last);
      }
    } else if (this.trailCount > 0) {
      this.trailPositions.copyWithin(0, 3);
      this.trailCount -= 1;
    }
    this.trailGeometry.setDrawRange(0, this.trailCount);
    (this.trailGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.trail!.material as THREE.LineBasicMaterial).opacity = this.trailCount > 0 ? 0.5 : 0;
  }

  /** Shape cycling is also reachable from the hub rail; toys may expose more than one gesture path. */
  nextShape(): void {
    if (!this.geometry) return;
    this.shapeIndex = (this.shapeIndex + 1) % SHAPES.length;
    this.from = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.to = shapePoints(SHAPES[this.shapeIndex], this.count);
    (this.geometry.getAttribute('aTarget') as THREE.BufferAttribute).copyArray(this.to);
    (this.geometry.getAttribute('aTarget') as THREE.BufferAttribute).needsUpdate = true;
    this.morph = 0;
    if (this.material) this.material.uniforms.uMorph.value = 0;
  }

  pause(): void {
    this.root.visible = false;
  }

  resume(): void {
    this.root.visible = true;
  }

  exit(): void {
    this.root.visible = false;
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.trailGeometry?.dispose();
    this.trail?.material && (this.trail.material as THREE.Material).dispose();
    this.root.clear();
    this.points = null;
    this.trail = null;
    this.geometry = null;
    this.material = null;
    this.trailGeometry = null;
  }
}

export default new GalaxyToy();
