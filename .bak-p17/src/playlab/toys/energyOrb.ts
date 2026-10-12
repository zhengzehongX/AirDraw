import * as THREE from 'three';
import { NOISE_GLSL, PALETTE_GLSL } from '../shaders';
import { QUALITY_PROFILES, type QualityLevel } from '../quality';
import type { Toy, ToyContext, ToyFrame, LabEvent } from '../types';

/**
 * Energy Orb — one glowing body that behaves like something with mass.
 *
 * The whole toy is a handful of springs on the CPU (a few bodies, not thousands)
 * plus one shader-drawn shell and one shader-animated core. Nothing per-particle
 * touches JavaScript, so the frame budget goes to the tracking it shares with the
 * rest of the app.
 *
 * Two rules that make a hand toy feel honest:
 *  • grabbing never teleports the body — the offset between palm and orb at grab
 *    time is kept for the whole hold;
 *  • every change is a spring with a maximum speed, so a fast hand cannot make the
 *    orb jump through itself or grow without limit.
 */
type Body = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Units of the shell radius. */
  size: number;
  charge: number;
  stretch: number;
  stretchAxis: THREE.Vector3;
  spin: THREE.Vector3;
  grabbed: 'none' | 'primary' | 'secondary';
  grabOffset: THREE.Vector3;
  wave: number;
};

const MAX_BODIES = 3;
const RADIUS = 1.15;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

class OrbToy implements Toy {
  id = 'orb' as const;
  title = 'Energy Orb';
  titleZh = '光球';
  description = '张开手掌吸引它，捏住抓住它，双手把它拉开或分成两颗。';
  thumbnail = { accent: '#22d3ee', preview: 'orb' as const };
  capabilities = ['attract', 'push', 'pinch-grab', 'pinch-throw', 'two-hand-link', 'two-hand-stretch', 'two-hand-split'] as const;
  supportsTwoHands = true;
  qualityLevels = ['ultra', 'high', 'balanced', 'performance'] as const;
  lesson = { prompt: '张开手掌靠近光球', done: 'HAND_OPEN' as const, seconds: 14 };

  private ctx: ToyContext | null = null;
  private root = new THREE.Group();
  private bodies: Body[] = [];
  private shells: THREE.Mesh[] = [];
  private cores: THREE.Points[] = [];
  private arcs: THREE.LineSegments[] = [];
  private material: THREE.ShaderMaterial | null = null;
  private coreMaterial: THREE.ShaderMaterial | null = null;
  private arcMaterial: THREE.LineBasicMaterial | null = null;
  private geometry: THREE.IcosahedronGeometry | null = null;
  private arcGeometry: THREE.BufferGeometry | null = null;
  private clock = 0;
  private arcAt = 0;
  private mergeTimer = 0;
  private quality: QualityLevel = 'high';

  enter(ctx: ToyContext): void {
    this.ctx = ctx;
    this.quality = ctx.quality;
    if (!this.material) this.build();
    if (!this.bodies.length) this.reset();
    this.root.visible = true;
  }

  private reset(): void {
    this.bodies = [
      {
        position: new THREE.Vector3(0, 0.2, 0),
        velocity: new THREE.Vector3(0.4, 0.15, 0),
        size: 1,
        charge: 0,
        stretch: 1,
        stretchAxis: new THREE.Vector3(1, 0, 0),
        spin: new THREE.Vector3(0, 0.6, 0),
        grabbed: 'none',
        grabOffset: new THREE.Vector3(),
        wave: 1,
      },
    ];
    this.syncBodies();
  }

  private build(): void {
    const profile = QUALITY_PROFILES[this.quality];
    this.geometry = new THREE.IcosahedronGeometry(RADIUS, this.quality === 'performance' ? 3 : 5);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCharge: { value: 0 },
        uWave: { value: 1 },
        uNight: { value: 0 },
        uPress: { value: new THREE.Vector3(0, 0, 1) },
        uPressAmount: { value: 0 },
      },
      vertexShader: /* glsl */ `
        ${NOISE_GLSL}
        uniform float uTime, uCharge, uWave;
        uniform vec3 uPress;
        uniform float uPressAmount;
        varying vec3 vNormalW;
        varying vec3 vPos;
        varying float vRipple;
        void main(){
          vec3 n = normalize(position);
          float breathe = labNoise(n * 2.2 + vec3(0.0, 0.0, uTime * 0.35)) - 0.5;
          float press = max(dot(n, -uPress), 0.0);
          // A hand pressing in dents the surface; the ripple ring spreads out from it.
          float ripple = sin((press * 3.0 - uWave * 5.0) * 3.14159) * exp(-uWave * 2.2) * press;
          float offset = breathe * (0.06 + uCharge * 0.11) - uPressAmount * press * 0.34 + ripple * 0.12;
          vec3 displaced = position + n * offset;
          vRipple = ripple + uCharge;
          vNormalW = normalize(normalMatrix * n);
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${PALETTE_GLSL}
        precision highp float;
        uniform float uTime, uCharge, uNight;
        varying vec3 vNormalW;
        varying vec3 vPos;
        varying float vRipple;
        void main(){
          vec3 view = normalize(-vPos);
          float fresnel = pow(1.0 - max(dot(normalize(vNormalW), view), 0.0), 2.4);
          float bands = 0.5 + 0.5 * sin(vPos.y * 9.0 + uTime * 1.6 + vRipple * 5.0);
          vec3 cool = labHsv(vec3(0.52 + 0.05 * bands, 0.72, 0.85));
          vec3 hot  = labHsv(vec3(0.58 - 0.12 * uCharge, 0.55, 1.0));
          vec3 color = mix(cool, hot, clamp(uCharge * 1.2 + fresnel * 0.5, 0.0, 1.0));
          // Never let the rim blow out to pure white: bloom does the glowing.
          float alpha = clamp(fresnel * 0.85 + 0.12 + bands * 0.05 + vRipple * 0.25, 0.0, 0.92);
          gl_FragColor = vec4(color * (0.55 + 0.75 * fresnel) * (1.0 - uNight * 0.15), alpha);
        }
      `,
    });

    const coreCount = Math.max(600, Math.floor(profile.particles / 12));
    const positions = new Float32Array(coreCount * 3);
    const seeds = new Float32Array(coreCount * 3);
    for (let i = 0; i < coreCount; i += 1) {
      const r = Math.cbrt(Math.random()) * RADIUS * 0.82;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    coreGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    this.coreMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCharge: { value: 0 }, uSize: { value: 6 }, uHue: { value: 0.52 } },
      vertexShader: /* glsl */ `
        ${NOISE_GLSL}
        attribute vec3 seed;
        uniform float uTime, uCharge, uSize;
        varying float vFade;
        void main(){
          vec3 p = position;
          vec3 flow = labCurl(p * 1.6 + seed * 2.0, uTime * (0.25 + uCharge * 0.6));
          // Particles orbit the centre and only spill outward as the charge grows.
          float swirl = 0.18 + uCharge * 0.5;
          p += flow * swirl * (0.4 + seed.x * 0.9);
          float angle = uTime * (0.4 + seed.y * 0.8) + seed.z * 6.2831;
          p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.5 + seed.z) * (1.0 + uCharge) * (3.0 / max(-mv.z, 0.1));
          vFade = 0.35 + 0.65 * uCharge + seed.x * 0.3;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${PALETTE_GLSL}
        precision highp float;
        uniform float uCharge, uHue;
        varying float vFade;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          vec3 color = labHsv(vec3(uHue + uCharge * 0.06, 0.55, 1.0));
          gl_FragColor = vec4(color, core * core * vFade * 0.85);
        }
      `,
    });

    this.arcMaterial = new THREE.LineBasicMaterial({ color: 0x9be9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.arcGeometry = new THREE.BufferGeometry();
    this.arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(profile.arcs * 2 * 6 * 3), 3));

    this.syncBodies();
  }

  /** One shell + one core + one arc set per body, created lazily up to MAX_BODIES. */
  private syncBodies(): void {
    if (!this.ctx) return;
    while (this.shells.length < this.bodies.length) {
      const group = new THREE.Group();
      const shell = new THREE.Mesh(this.geometry!, this.material!.clone());
      const core = new THREE.Points(
        (() => {
          const source = this.cores[0]?.geometry;
          if (source) return source.clone();
          const count = 900;
          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(count * 3);
          const seeds = new Float32Array(count * 3);
          for (let i = 0; i < count; i += 1) {
            const r = Math.cbrt(Math.random()) * RADIUS * 0.82;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3);
            seeds.set([Math.random(), Math.random(), Math.random()], i * 3);
          }
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
          return geometry;
        })(),
        this.coreMaterial!.clone(),
      );
      const arcs = new THREE.LineSegments(this.arcGeometry!.clone(), this.arcMaterial!.clone());
      arcs.frustumCulled = false;
      group.add(shell, core, arcs);
      this.root.add(group);
      this.shells.push(shell);
      this.cores.push(core);
      this.arcs.push(arcs);
    }
    for (let i = this.shells.length - 1; i >= this.bodies.length; i -= 1) {
      const group = this.shells[i].parent;
      if (group) {
        this.root.remove(group);
        if (group instanceof THREE.Group) group.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            const material = child.material as THREE.Material | THREE.Material[];
            if (Array.isArray(material)) material.forEach((m) => m.dispose());
            else material.dispose();
          }
        });
      }
      this.shells.splice(i, 1);
      this.cores.splice(i, 1);
      this.arcs.splice(i, 1);
    }
  }

  onGesture(event: LabEvent, frame: ToyFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (event === 'PINCH_START' || event === 'PINCH_END') {
      this.touch(frame, 'primary', event);
      if (frame.secondary) this.touch(frame, 'secondary', event);
      return;
    }
    const body = this.bodies[0];
    if (!body || !frame.primary) return;
    if (event === 'PALM_PUSH') {
      const away = body.position.clone().sub(this.palmWorld(frame.primary.palmCenter)).normalize();
      body.velocity.addScaledVector(away, 3.4);
      body.wave = 0.001;
    }
    if (event === 'TWO_HAND_ENERGY_LINK') body.stretch = 1.25;
  }

  /** A pinch that begins on a body grabs it — keeping the offset, never snapping the orb to the fingertip. */
  private touch(frame: ToyFrame, role: 'primary' | 'secondary', event: LabEvent): void {
    const hand = role === 'primary' ? frame.primary : frame.secondary;
    if (!hand) return;
    if (event === 'PINCH_START') {
      const point = this.palmWorld(hand.pinchPoint);
      for (const body of this.bodies) {
        if (body.grabbed !== 'none') continue;
        if (point.distanceTo(body.position) > RADIUS * body.size * 1.7) continue;
        body.grabbed = role;
        body.grabOffset.copy(body.position).sub(point);
        break;
      }
      return;
    }
    for (const body of this.bodies) {
      if (body.grabbed !== role) continue;
      body.grabbed = 'none';
      // The throw carries the hand's own velocity, capped so a flick cannot send
      // the orb bouncing forever against the walls.
      body.velocity.set(hand.palmVelocity.x * 9, hand.palmVelocity.y * 9, 0).clampLength(0, 12);
      body.wave = 0.001;
    }
  }

  private palmWorld(palm: { x: number; y: number; z: number }, depth = 0): THREE.Vector3 {
    const world = this.ctx!.toWorld({ x: palm.x, y: palm.y, z: palm.z }, depth);
    return new THREE.Vector3(world.x, world.y, world.z);
  }

  update(frame: ToyFrame, ctx: ToyContext): void {
    this.clock += frame.dt;
    const volume = ctx.volume;
    const hands = [frame.primary, frame.secondary];
    const grabbedBy = new Set<string>();

    for (const body of this.bodies) {
      const grabber = body.grabbed === 'primary' ? frame.primary : body.grabbed === 'secondary' ? frame.secondary : null;
      if (grabber) grabbedBy.add(body.grabbed);

      // ── forces
      if (grabber) {
        const before = body.position.clone();
        const target = this.palmWorld(grabber.pinchPoint).add(body.grabOffset);
        body.position.lerp(target, Math.min(1, frame.dt * 16));
        // The real displacement is the velocity, so letting go mid-drag throws the
        // orb the way the hand was actually moving.
        body.velocity.copy(body.position).sub(before).multiplyScalar(1 / Math.max(frame.dt, 1e-3)).clampLength(0, 12);
        body.charge = Math.min(1, body.charge + frame.dt * 0.55);
      } else {
        body.charge = Math.max(0, body.charge - frame.dt * 0.7);
        // An open palm nearby is a gentle gravity well; nothing here needs a grab.
        for (const hand of hands) {
          if (!hand || !hand.isStable || hand.openness < 0.55) continue;
          const pull = this.palmWorld(hand.palmCenter).sub(body.position);
          const distance = pull.length();
          if (distance > 5.5 || distance < 1e-3) continue;
          body.velocity.addScaledVector(pull.normalize(), frame.dt * 2.6 * hand.openness * (1 - distance / 5.5));
        }
        body.velocity.multiplyScalar(1 - Math.min(1, frame.dt * 0.85));
        body.position.addScaledVector(body.velocity, frame.dt);
      }

      // ── soft walls: the toy stays in frame without a dead stop
      const limit = (axis: 'x' | 'y' | 'z', half: number) => {
        if (body.position[axis] > half) {
          body.position[axis] = half;
          body.velocity[axis] *= -0.55;
        }
        if (body.position[axis] < -half) {
          body.position[axis] = -half;
          body.velocity[axis] *= -0.55;
        }
      };
      limit('x', volume.width / 2 - RADIUS);
      limit('y', volume.height / 2 - RADIUS);
      limit('z', volume.depth / 2 - RADIUS);

      // ── two-hand stretch / squeeze
      if (frame.two?.active && frame.primary && frame.secondary) {
        const axis = new THREE.Vector3(frame.two.direction.x, frame.two.direction.y, 0).normalize();
        body.stretchAxis.lerp(axis, Math.min(1, frame.dt * 6));
        const wanted = clamp(frame.two.scale, 0.55, 2.2);
        body.stretch = lerp(body.stretch, wanted, Math.min(1, frame.dt * 4));
        body.spin.y = 0.6 + Math.abs(frame.two.twist) * 2.2;
      } else {
        body.stretch = lerp(body.stretch, 1, Math.min(1, frame.dt * 3));
      }

      body.wave = Math.min(1.6, body.wave + frame.dt * 1.4);
      body.spin.multiplyScalar(1 - Math.min(1, frame.dt * 0.4));
    }

    // ── split when the hands pull apart hard, merge when two bodies settle together
    if (frame.two?.active && frame.two.separationVelocity > 2.6 && this.bodies.length < MAX_BODIES) this.split();
    else if (frame.two?.active && frame.two.separationVelocity < -2.2 && this.bodies.length > 1) this.merge();

    if (this.bodies.length > 1) {
      this.mergeTimer += frame.dt;
      if (this.mergeTimer > 0.4) {
        this.mergeTimer = 0;
        for (let i = 0; i < this.bodies.length; i += 1)
          for (let j = i + 1; j < this.bodies.length; j += 1)
            if (this.bodies[i].position.distanceTo(this.bodies[j].position) < (this.bodies[i].size + this.bodies[j].size) * RADIUS * 0.85) this.merge(i, j);
      }
    }

    this.draw(frame);
  }

  private split(): void {
    const parent = this.bodies[0];
    if (!parent || this.bodies.length >= MAX_BODIES) return;
    const half = Math.max(0.62, parent.size * 0.72);
    parent.size = half;
    this.bodies.push({
      ...parent,
      position: parent.position.clone().add(new THREE.Vector3(RADIUS * 1.6, 0, 0)),
      velocity: parent.velocity.clone().add(new THREE.Vector3(-1.6, 0.4, 0)),
      size: half,
      charge: parent.charge * 0.6,
      stretchAxis: parent.stretchAxis.clone(),
      grabOffset: new THREE.Vector3(),
      grabbed: 'none',
    });
    this.syncBodies();
  }

  private merge(preferredA = 0, preferredB = preferredA + 1): void {
    if (this.bodies.length < 2) return;
    const a = this.bodies[preferredA];
    const b = this.bodies[preferredB];
    if (!a || !b) return;
    const total = a.size ** 3 + b.size ** 3;
    a.position.lerp(b.position, 0.5);
    a.velocity.lerp(b.velocity, 0.5);
    a.size = clamp(Math.cbrt(total), 0.6, 1.35);
    a.charge = Math.max(a.charge, b.charge);
    this.bodies.splice(preferredB, 1);
    this.syncBodies();
  }

  private draw(frame: ToyFrame): void {
    this.bodies.forEach((body, index) => {
      const shell = this.shells[index];
      const core = this.cores[index];
      const arcs = this.arcs[index];
      if (!shell || !core || !arcs) return;
      shell.position.copy(body.position);
      core.position.copy(body.position);
      arcs.position.copy(body.position);
      const squish = 1 / Math.sqrt(body.stretch);
      shell.scale.set(body.size * body.stretch, body.size * squish, body.size * squish);
      shell.rotation.y += body.spin.y * frame.dt;
      core.scale.setScalar(body.size * Math.min(1.15, body.stretch));
      const uniforms = shell.material as THREE.ShaderMaterial;
      uniforms.uniforms.uTime.value = this.clock;
      uniforms.uniforms.uCharge.value = body.charge;
      uniforms.uniforms.uWave.value = body.wave;
      uniforms.uniforms.uNight.value = frame.night;
      const press = (core.material as THREE.ShaderMaterial).uniforms;
      press.uTime.value = this.clock;
      press.uCharge.value = body.charge;
      press.uHue.value = 0.52 + index * 0.09;
      // Arcs only exist once the orb is charged: idle it must look calm, not busy.
      const arcMaterial = arcs.material as THREE.LineBasicMaterial;
      arcMaterial.opacity = body.charge > 0.25 ? 0.25 + body.charge * 0.5 : 0;
      if (arcMaterial.opacity > 0 && this.clock - this.arcAt > 0.04) {
        this.arcAt = this.clock;
        this.rebuildArcs(arcs, body);
      }
    });
  }

  private rebuildArcs(arcs: THREE.LineSegments, body: Body): void {
    const attribute = arcs.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const pairs = Math.floor(array.length / 6);
    let cursor = 0;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const mid = new THREE.Vector3();
    for (let i = 0; i < pairs; i += 1) {
      from.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(RADIUS * body.size * 0.9);
      to.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(RADIUS * body.size * 0.9);
      for (let s = 0; s < 2; s += 1) {
        mid.copy(from).lerp(to, 0.35 + s * 0.3).addScaledVector(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
        array[cursor++] = s === 0 ? from.x : mid.x;
        array[cursor++] = s === 0 ? from.y : mid.y;
        array[cursor++] = s === 0 ? from.z : mid.z;
        array[cursor++] = s === 0 ? mid.x : to.x;
        array[cursor++] = s === 0 ? mid.y : to.y;
        array[cursor++] = s === 0 ? mid.z : to.z;
      }
    }
    attribute.needsUpdate = true;
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
    this.shells.forEach((mesh) => mesh.material && (mesh.material as THREE.Material).dispose());
    this.cores.forEach((points) => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    });
    this.arcs.forEach((lines) => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    });
    this.geometry?.dispose();
    this.arcGeometry?.dispose();
    this.material?.dispose();
    this.coreMaterial?.dispose();
    this.arcMaterial?.dispose();
    this.root.clear();
    this.shells = [];
    this.cores = [];
    this.arcs = [];
    this.bodies = [];
    this.ctx = null;
  }

  get group(): THREE.Group {
    return this.root;
  }
}

export default new OrbToy();
