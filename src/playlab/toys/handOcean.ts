import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders';
import { QUALITY_PROFILES } from '../quality';
import type { Toy, ToyContext, ToyFrame, LabEvent } from '../types';

/**
 * Hand Ocean — a vertex-displaced sea with analytic normals.
 *
 * Four travelling swells plus a ring buffer of hand-made ripples give the surface
 * its shape, and because the height function is closed-form the normals come from
 * its derivative instead of a normal map or an expensive texture read. Foam is
 * where the surface is steep, which is what foam actually is.
 *
 * Amplitude, ripple count and grid density all come from the quality profile, and
 * the wave sum is clamped: a hand can make the sea angry, never tear itself apart.
 */
const RIPPLES = 10;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

class OceanToy implements Toy {
  id = 'ocean' as const;
  title = 'Hand Ocean';
  titleZh = '手势海洋';
  description = '手掌下压掀起浪，划过留下尾迹，捏起一颗水珠再松手落回海面。';
  thumbnail = { accent: '#60a5fa', preview: 'water' as const };
  capabilities = ['push', 'vortex', 'pinch-grab', 'two-hand-stretch', 'two-hand-rotate'] as const;
  supportsTwoHands = true;
  qualityLevels = ['ultra', 'high', 'balanced', 'performance'] as const;
  lesson = { prompt: '手掌向下压海面', done: 'PALM_PUSH' as const, seconds: 14 };

  private root = new THREE.Group();
  private sea: THREE.Mesh | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private droplet: THREE.Mesh | null = null;
  private dropletGeometry: THREE.SphereGeometry | null = null;
  private dropletMaterial: THREE.MeshPhysicalMaterial | null = null;
  private dropletState: { held: boolean; y: number; velocity: number; at: number } = { held: false, y: 0, velocity: 0, at: 0 };
  private rippleCursor = 0;
  private clock = 0;
  private amplitude = 1;
  private whirl = 0;
  private wind = new THREE.Vector2(0, 0);
  private lastPalm = new THREE.Vector2(999, 999);

  get group(): THREE.Group {
    return this.root;
  }

  enter(ctx: ToyContext): void {
    if (!this.sea) this.build(ctx);
    this.root.visible = true;
  }

  private build(ctx: ToyContext): void {
    const profile = QUALITY_PROFILES[ctx.quality];
    const segments = Math.max(48, Math.min(profile.waterSegments, 220));
    this.geometry = new THREE.PlaneGeometry(ctx.volume.width * 1.6, ctx.volume.depth * 3.2, segments, segments);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uAmplitude: { value: 1 },
        uWhirl: { value: 0 },
        uWind: { value: new THREE.Vector2() },
        uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -999, 0)) },
        uLight: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
      },
      vertexShader: /* glsl */ `
        ${NOISE_GLSL}
        uniform float uTime, uAmplitude, uWhirl;
        uniform vec2 uWind;
        uniform vec4 uRipples[${RIPPLES}];
        varying float vHeight;
        varying vec3 vNormalW;
        varying vec3 vPos;
        varying vec2 vGround;

        float swell(vec2 p, vec2 dir, float steep, float speed, float t){
          return sin(steep * dot(p, dir) + t * speed);
        }

        float surface(vec2 p, float t){
          float h = 0.0;
          h += swell(p, normalize(vec2(1.0, 0.25) + uWind), 0.85, 0.9, t) * 0.55;
          h += swell(p, normalize(vec2(-0.4, 1.0) - uWind), 1.35, 1.4, t) * 0.3;
          h += swell(p, normalize(vec2(0.7, -0.8)), 2.1, 2.0, t) * 0.16;
          h += labNoise(vec3(p * 0.6, t * 0.25)) * 0.22 - 0.11;
          for (int i = 0; i < ${RIPPLES}; i++) {
            vec4 r = uRipples[i];
            if (r.w <= 0.0) continue;
            float age = t - r.z;
            if (age < 0.0 || age > 3.0) continue;
            float d = length(p - r.xy);
            float front = age * 3.4;
            // A ring that spreads and dies, rather than a bump that never leaves.
            h += r.w * sin((d - front) * 5.0) * exp(-abs(d - front) * 3.2) * exp(-age * 1.15);
          }
          if (uWhirl != 0.0) {
            float a = uWhirl * 1.4 * exp(-length(p) * 0.12);
            float s = sin(a), c = cos(a);
            p = mat2(c, -s, s, c) * p;
            h += sin(length(p) * 2.2 - t * 2.0) * abs(uWhirl) * 0.35;
          }
          return h * uAmplitude;
        }

        void main(){
          vec2 ground = position.xy;
          float t = uTime;
          float h = surface(ground, t);
          // Analytic normal from two nearby samples: cheap, and it never flickers
          // the way a derived-from-geometry normal does on a moving grid.
          float e = 0.35;
          float hx = surface(ground + vec2(e, 0.0), t) - h;
          float hy = surface(ground + vec2(0.0, e), t) - h;
          vec3 n = normalize(vec3(-hx / e, -hy / e, 1.0));
          vHeight = h;
          vNormalW = normalize(normalMatrix * n);
          vGround = ground;
          vec3 displaced = vec3(position.x, position.y, h);
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uNight;
        uniform vec3 uLight;
        varying float vHeight;
        varying vec3 vNormalW;
        varying vec3 vPos;
        varying vec2 vGround;
        void main(){
          vec3 view = normalize(-vPos);
          float fresnel = pow(1.0 - max(dot(normalize(vNormalW), view), 0.0), 3.0);
          vec3 deep = mix(vec3(0.04, 0.16, 0.28), vec3(0.01, 0.04, 0.10), uNight);
          vec3 shallow = mix(vec3(0.30, 0.62, 0.72), vec3(0.10, 0.26, 0.42), uNight);
          vec3 sky = mix(vec3(0.74, 0.86, 0.96), vec3(0.10, 0.14, 0.26), uNight);
          vec3 body = mix(deep, shallow, clamp(vHeight * 0.5 + 0.5, 0.0, 1.0));
          vec3 color = mix(body, sky, fresnel * 0.8);
          vec3 halfDir = normalize(normalize(uLight) + view);
          float spec = pow(max(dot(normalize(vNormalW), halfDir), 0.0), 90.0);
          // Moonlight stays cold and restrained; daylight is a soft sky sheen.
          color += mix(vec3(1.0, 0.95, 0.82), vec3(0.62, 0.76, 1.0), uNight) * spec * (0.55 - uNight * 0.15);
          float steep = 1.0 - max(normalize(vNormalW).z, 0.0);
          float foam = smoothstep(0.16, 0.42, steep) + smoothstep(0.55, 1.0, vHeight);
          color = mix(color, mix(vec3(0.94, 0.97, 1.0), vec3(0.78, 0.86, 0.98), uNight), clamp(foam, 0.0, 0.6));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.sea = new THREE.Mesh(this.geometry, this.material);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -2.2;
    this.root.add(this.sea);

    this.dropletGeometry = new THREE.SphereGeometry(0.34, 24, 18);
    this.dropletMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transmission: 0.9, thickness: 0.5, roughness: 0.08, transparent: true, opacity: 0.9 });
    this.droplet = new THREE.Mesh(this.dropletGeometry, this.dropletMaterial);
    this.droplet.visible = false;
    this.root.add(this.droplet);
  }

  private ripple(x: number, z: number, strength: number): void {
    const slot = this.rippleCursor % RIPPLES;
    this.rippleCursor += 1;
    const vector = (this.material!.uniforms.uRipples.value as THREE.Vector4[])[slot];
    vector.set(x, z, this.clock, strength);
  }

  onGesture(event: LabEvent, frame: ToyFrame): void {
    const ctx = this.ctx();
    if (!ctx || !frame.primary) return;
    const palm = ctx.toWorld(frame.primary.palmCenter);
    if (event === 'PALM_PUSH') {
      this.ripple(palm.x, -palm.z, 1.5);
      this.amplitude = Math.min(2.4, this.amplitude + 0.35);
    }
    if (event === 'PALM_PULL' && this.dropletState.held) this.releaseDroplet(palm);
  }

  private ctx(): ToyContext | null {
    return this.context;
  }

  private context: ToyContext | null = null;

  update(frame: ToyFrame, ctx: ToyContext): void {
    this.context = ctx;
    if (!this.material || !this.sea) return;
    this.clock += frame.dt;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = this.clock;
    uniforms.uNight.value = frame.night;

    const hand = frame.primary;
    if (hand?.isStable && frame.interactive) {
      const world = ctx.toWorld(hand.palmCenter);
      // Wind follows the palm's travel, and the wake drops ripples along the path.
      this.wind.lerp(new THREE.Vector2(hand.palmVelocity.x * 0.6, -hand.palmVelocity.y * 0.6), Math.min(1, frame.dt * 2));
      const step = Math.hypot(world.x - this.lastPalm.x, -world.z - this.lastPalm.y);
      const speed = Math.hypot(hand.palmVelocity.x, hand.palmVelocity.y);
      if (step > 0.9 && speed > 0.35) this.ripple(world.x, -world.z, Math.min(0.9, speed * 0.5));
      if (step > 0.9) this.lastPalm.set(world.x, -world.z);

      if (hand.pinchState === 'HOLD') this.grabDroplet(ctx, world);
      else if (this.dropletState.held) this.releaseDroplet(world);
    } else if (this.dropletState.held) {
      this.releaseDroplet(ctx.toWorld({ x: 0.5, y: 0.5, z: 0 }));
    }

    if (frame.two?.active) {
      const spread = Math.min(2.5, Math.max(0.4, frame.two.scale));
      // Two hands apart carve a channel; together they gather the water.
      this.amplitude = lerp(this.amplitude, spread > 1.15 ? 1.6 : 0.75, Math.min(1, frame.dt * 1.6));
      this.whirl = lerp(this.whirl, frame.two.twist * 0.8, Math.min(1, frame.dt * 2.2));
      if (spread > 1.6 && Math.abs(frame.two.separationVelocity) > 1.2) {
        const mid = ctx.toWorld(frame.two.midpoint);
        this.ripple(mid.x - spread, -mid.z, 0.8);
        this.ripple(mid.x + spread, -mid.z, 0.8);
      }
    } else {
      this.amplitude = lerp(this.amplitude, 1, Math.min(1, frame.dt * 0.5));
      this.whirl = lerp(this.whirl, 0, Math.min(1, frame.dt * 1.2));
    }

    uniforms.uAmplitude.value = this.amplitude;
    uniforms.uWhirl.value = this.whirl;
    uniforms.uWind.value.copy(this.wind);
    this.stepDroplet(frame.dt);
  }

  private grabDroplet(ctx: ToyContext, world: { x: number; y: number; z: number }): void {
    if (!this.droplet) return;
    if (!this.dropletState.held) {
      this.dropletState = { held: true, y: world.y, velocity: 0, at: this.clock };
      this.ripple(world.x, -world.z, 0.6);
    }
    this.droplet.visible = true;
    this.dropletState.y = lerp(this.dropletState.y, Math.max(0.4, world.y), 0.25);
    this.droplet.position.set(world.x, this.dropletState.y, -world.z);
    this.droplet.scale.setScalar(1 + Math.sin(this.clock * 3) * 0.06);
    void ctx;
  }

  private releaseDroplet(world: { x: number; y: number; z: number }): void {
    if (!this.dropletState.held) return;
    this.dropletState.held = false;
    this.dropletState.velocity = -1.5;
    void world;
  }

  /** Falling droplet → a real splash when it reaches the surface, then it hides. */
  private stepDroplet(dt: number): void {
    if (!this.droplet || this.dropletState.held) return;
    if (!this.droplet.visible) return;
    this.dropletState.velocity -= 9 * dt;
    this.dropletState.y += this.dropletState.velocity * dt;
    this.droplet.position.y = this.dropletState.y;
    if (this.dropletState.y <= -2.2) {
      this.ripple(this.droplet.position.x, this.droplet.position.z, 1.1);
      this.droplet.visible = false;
      this.dropletState.y = -2.2;
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
    this.dropletGeometry?.dispose();
    this.dropletMaterial?.dispose();
    this.root.clear();
    this.sea = null;
    this.droplet = null;
    this.context = null;
  }
}

export default new OceanToy();
