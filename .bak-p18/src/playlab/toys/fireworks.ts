import * as THREE from 'three';
import { PALETTE_GLSL } from '../shaders';
import { QUALITY_PROFILES } from '../quality';
import type { Toy, ToyContext, ToyFrame, LabEvent } from '../types';

/**
 * Fireworks — one Points object for every spark in the sky.
 *
 * A burst writes a slice of a pre-allocated ring buffer on the CPU (a few hundred
 * vectors, once), and the vertex shader integrates the flight analytically:
 * drag-decayed initial velocity plus gravity, with size and alpha falling off over
 * the particle's life. So a hundred shells in the air cost one draw call and zero
 * per-particle JavaScript.
 *
 * Charging needs a real held pinch and launching needs a release, which is what
 * keeps an idle open hand from setting off the sky.
 */
type Pattern = 'sphere' | 'ring' | 'spiral' | 'heart' | 'palm';

const DRAG = 1.15;
const GRAVITY = 3.6;

class FireworksToy implements Toy {
  id = 'fireworks' as const;
  title = 'Fireworks';
  titleZh = '烟花';
  description = '捏住蓄力、抬手瞄准、松开发射；双手各蓄一色，合拢变成双色烟花。';
  thumbnail = { accent: '#fbbf24', preview: 'sparks' as const };
  capabilities = ['pinch-grab', 'pinch-throw', 'two-hand-mix', 'two-hand-split'] as const;
  supportsTwoHands = true;
  qualityLevels = ['ultra', 'high', 'balanced', 'performance'] as const;
  lesson = { prompt: '捏住蓄力后松开', done: 'PINCH_END' as const, seconds: 16 };

  private root = new THREE.Group();
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private cursor = 0;
  private capacity = 0;
  private clock = 0;
  private charge: { role: 'primary' | 'secondary'; at: number; point: THREE.Vector3; velocity: THREE.Vector3; hue: number }[] = [];
  private lastLaunch = 0;

  get group(): THREE.Group {
    return this.root;
  }

  enter(ctx: ToyContext): void {
    if (!this.points) this.build(ctx);
    this.root.visible = true;
  }

  private build(ctx: ToyContext): void {
    const profile = QUALITY_PROFILES[ctx.quality];
    this.capacity = Math.max(1500, Math.floor(profile.particles / 3));
    const position = new Float32Array(this.capacity * 3);
    const spawn = new Float32Array(this.capacity);
    const velocity = new Float32Array(this.capacity * 3);
    const life = new Float32Array(this.capacity);
    const hue = new Float32Array(this.capacity);
    for (let i = 0; i < this.capacity; i += 1) {
      spawn[i] = -999;
      life[i] = 1;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.geometry.setAttribute('aSpawn', new THREE.BufferAttribute(spawn, 1));
    this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocity, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    this.geometry.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: ctx.quality === 'performance' ? 5 : 8 }, uNight: { value: 0 } },
      vertexShader: /* glsl */ `
        ${PALETTE_GLSL}
        attribute float aSpawn;
        attribute vec3 aVelocity;
        attribute float aLife;
        attribute float aHue;
        uniform float uTime, uSize;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float age = max(uTime - aSpawn, 0.0);
          float k = ${DRAG.toFixed(2)};
          // Drag-decayed initial velocity plus gravity, in closed form: no integration step.
          vec3 travel = aVelocity * (1.0 - exp(-k * age)) / k;
          travel.y -= 0.5 * ${GRAVITY.toFixed(2)} * age * age;
          vec3 p = position + travel;
          float t = clamp(age / aLife, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (1.0 - t * 0.65) * (5.0 / max(-mv.z, 0.1));
          vColor = labHsv(vec3(aHue, 0.72, 1.0));
          // A short bright kick, then a long soft fade — the tail is what reads as a firework.
          vAlpha = age > aLife ? 0.0 : pow(1.0 - t, 1.7);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          if (vAlpha <= 0.001) discard;
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(vColor * (0.5 + core), core * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.root.add(this.points);
  }

  onGesture(event: LabEvent, frame: ToyFrame): void {
    if (!this.geometry || !this.ctx) return;
    const ctx = this.ctx;
    const role = frame.gesture?.role;
    const source = role ? frame[role] : null;
    if (event === 'PINCH_START' && role && source?.pinchState === 'HOLD' && frame.interactive) {
      const world = ctx.toWorld(source.pinchPoint, 0.4);
      this.charge = this.charge.filter(c => c.role !== role);
      this.charge.push({ role, at: this.clock, point: new THREE.Vector3(world.x, world.y, world.z), velocity: new THREE.Vector3(), hue: role === 'primary' ? 0.12 : 0.55 });
    }
    if (event === 'PINCH_END' && role) {
      if (frame.gesture?.cancelled) this.charge = this.charge.filter(c => c.role !== role);
      else this.launch(frame, role);
    }
    if (event === 'HAND_OPEN' && this.clock - this.lastLaunch > 0.55 && frame.primary) {
      // A quick open hand near a charge point bursts at close range, but only if a
      // launch has not just happened — otherwise waving sets off the sky.
      const world = ctx.toWorld(frame.primary.palmCenter, 0.4);
      this.burst(new THREE.Vector3(world.x, world.y, world.z), 'palm', 0.32, 1);
      this.lastLaunch = this.clock;
    }
  }

  private ctx: ToyContext | null = null;

  private launch(frame: ToyFrame, role: 'primary' | 'secondary'): void {
    if (!this.ctx || !this.charge.length) return;
    const charges = this.charge.filter((c) => c.role === role);
    const twin = this.charge.find((c) => c.role !== role);
    const hand = frame[role];
    const pattern: Pattern = frame.two?.active ? 'ring' : hand && Math.abs(hand.palmVelocity.y) > 1.4 ? 'spiral' : 'sphere';
    for (const charge of charges) {
      const aim = hand ? new THREE.Vector3(hand.palmVelocity.x, hand.palmVelocity.y, 0).multiplyScalar(3.2) : new THREE.Vector3(0, 2.4, 0);
      if (aim.length() < 0.6) aim.set(0, 2.6, 0);
      const apex = charge.point.clone().add(aim.clone().multiplyScalar(1.15)).setY(Math.max(1.4, charge.point.y + aim.y * 1.1));
      this.burst(apex, pattern, charge.hue, twin ? 1.35 : 1);
    }
    this.charge = this.charge.filter(c => c.role !== role);
    void this.lastLaunch;
    this.lastLaunch = this.clock;
  }

  /** Write one shell's worth of sparks into the ring buffer. */
  private burst(origin: THREE.Vector3, pattern: Pattern, hue: number, energy: number): void {
    if (!this.geometry) return;
    const count = Math.floor(pattern === 'palm' ? 220 : 420 * energy);
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const spawn = this.geometry.getAttribute('aSpawn') as THREE.BufferAttribute;
    const velocity = this.geometry.getAttribute('aVelocity') as THREE.BufferAttribute;
    const life = this.geometry.getAttribute('aLife') as THREE.BufferAttribute;
    const colors = this.geometry.getAttribute('aHue') as THREE.BufferAttribute;
    for (let i = 0; i < count; i += 1) {
      const slot = this.cursor % this.capacity;
      this.cursor += 1;
      const direction = patternVector(pattern, i / count);
      const speed = (1.6 + Math.random() * 2.6) * energy;
      position.setXYZ(slot, origin.x, origin.y, origin.z);
      velocity.setXYZ(slot, direction.x * speed, direction.y * speed + 0.6, direction.z * speed);
      spawn.setX(slot, this.clock);
      life.setX(slot, 1.1 + Math.random() * 1.5);
      colors.setX(slot, (hue + Math.random() * 0.08) % 1);
    }
    position.needsUpdate = true;
    spawn.needsUpdate = true;
    velocity.needsUpdate = true;
    life.needsUpdate = true;
    colors.needsUpdate = true;
  }

  update(frame: ToyFrame, ctx: ToyContext): void {
    this.ctx = ctx;
    if (!this.material) return;
    this.clock += frame.dt;
    this.material.uniforms.uTime.value = this.clock;
    this.material.uniforms.uNight.value = frame.night;
    // Charging is a slow brightening at the pinch point; launching happens on release.
    for (const charge of this.charge) {
      charge.point.lerp(ctx.toWorld((charge.role === 'primary' ? frame.primary : frame.secondary)?.pinchPoint ?? { x: 0.5, y: 0.5, z: 0 }, 0.4), 0.2);
      if (this.clock - charge.at > 3.2) this.charge = this.charge.filter((c) => c !== charge);
    }
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
    this.root.clear();
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.ctx = null;
  }
}

function patternVector(pattern: Pattern, t: number): THREE.Vector3 {
  switch (pattern) {
    case 'ring': {
      const angle = t * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.35, Math.sin(angle));
    }
    case 'spiral': {
      const angle = t * Math.PI * 9;
      const r = 0.25 + t * 0.9;
      return new THREE.Vector3(Math.cos(angle) * r, t * 1.6 - 0.3, Math.sin(angle) * r);
    }
    case 'heart': {
      const a = t * Math.PI * 2;
      return new THREE.Vector3((16 * Math.pow(Math.sin(a), 3)) / 16, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16, 0);
    }
    case 'palm': {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.4 - 0.2, Math.random() * 2 - 1);
      return v.normalize().multiplyScalar(0.6 + Math.random() * 0.6);
    }
    default: {
      const v = Math.acos(2 * Math.random() - 1);
      const u = Math.random() * Math.PI * 2;
      return new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    }
  }
}

export default new FireworksToy();
