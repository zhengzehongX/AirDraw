import * as THREE from 'three';
import { QUALITY_PROFILES } from '../quality';
import type { Toy, ToyContext, ToyFrame, LabEvent } from '../types';

/**
 * Fluid Ink — a grid-based fluid running on the GPU.
 *
 * Velocity and dye live in float render targets that ping-pong. Each frame:
 * splat (from the hands) → curl → vorticity → advect → divergence → pressure
 * (Jacobi) → gradient subtract → display. Hands only ever *inject*; nothing here
 * reads back to the CPU, so the frame cost is a fixed number of fullscreen passes
 * chosen by the quality level.
 *
 * The interaction model follows the publicly documented Stam "stable fluids"
 * pipeline as popularised by Pavel Dobryakov's WebGL-Fluid-Simulation (MIT,
 * (c) 2017 Pavel Dobryakov) — see docs/phase7-log.md. These shaders are written
 * for AirDraw's renderer and toy contract rather than copied from that source.
 *
 * The display pass maps *density* through a palette instead of showing raw RGB,
 * because additive red + additive cyan is grey soup; through the palette it is a
 * clean seam between two colours.
 */
export type InkPalette = 'aurora' | 'ink' | 'fire' | 'ocean' | 'candy';

export const PALETTES: Record<InkPalette, [number, number]> = {
  aurora: [0.42, 0.78],
  ink: [0.58, 0.06],
  fire: [0.02, 0.14],
  ocean: [0.52, 0.62],
  candy: [0.9, 0.45],
};

const HSV = /* glsl */ `
vec3 labHsv(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

const VERT = /* glsl */ `
precision highp float;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const ADVECT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uTexel;
void main(){
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uTexel;
  gl_FragColor = uDissipation * texture2D(uSource, coord);
  gl_FragColor.a = 1.0;
}
`;

const DIVERGENCE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

const CURL = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}
`;

const VORTICITY = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uCurlStrength;
uniform float uDt;
void main(){
  float L = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 vel = clamp(texture2D(uVelocity, vUv).xy + force * uDt, -1200.0, 1200.0);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

const PRESSURE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main(){
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float divergence = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}
`;

const SPLAT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;
void main(){
  vec2 d = (vUv - uPoint) * vec2(uAspect, 1.0);
  float falloff = exp(-dot(d, d) / max(uRadius * uRadius, 1e-5));
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + uValue * falloff, 1.0);
}
`;

const DISPLAY = /* glsl */ `
${HSV}
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform float uNight;
uniform vec2 uHues;
void main(){
  vec3 dye = texture2D(uDye, vUv).rgb;
  float density = max(max(dye.r, dye.g), dye.b);
  // Which hand dominated this pixel decides the hue; the mix is a seam, not a mud.
  float red = dye.r / (density + 1e-4);
  float hue = mix(uHues.y, uHues.x, clamp(red, 0.0, 1.0));
  vec3 color = labHsv(vec3(hue, 0.7, 1.0 - exp(-density * 2.4)));
  color += pow(density, 3.0) * 0.25;
  gl_FragColor = vec4(color * (1.0 - uNight * 0.3), 1.0);
}
`;

const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
};

class FluidToy implements Toy {
  id = 'fluid' as const;
  title = 'Fluid Ink';
  titleZh = '流体墨水';
  description = '食指注入颜色，张掌推出涡流，两只手各拿一种颜色在中间混合。';
  thumbnail = { accent: '#f472b6', preview: 'fluid' as const };
  capabilities = ['attract', 'push', 'pinch-grab', 'vortex', 'two-hand-mix'] as const;
  supportsTwoHands = true;
  qualityLevels = ['ultra', 'high', 'balanced', 'performance'] as const;
  lesson = { prompt: '移动食指注入墨水', done: 'PINCH_MOVE' as const, seconds: 14 };

  palette: InkPalette = 'aurora';

  private root = new THREE.Group();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private display: THREE.Mesh | null = null;
  private buffers = new Map<string, [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]>();
  private materials = new Map<string, THREE.ShaderMaterial>();
  private resolution = 128;
  private iterations = 12;
  private built = false;
  private held = false;

  get group(): THREE.Group {
    return this.root;
  }

  private buffer(name: string): [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] {
    let pair = this.buffers.get(name);
    if (!pair) {
      const make = () =>
        new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
          type: THREE.HalfFloatType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
      pair = [make(), make()];
      this.buffers.set(name, pair);
    }
    return pair;
  }

  /** Read/write halves of a ping-pong pair, swapped after a pass writes into `next`. */
  private read(name: string): THREE.WebGLRenderTarget {
    return this.buffer(name)[0];
  }

  private swap(name: string): void {
    const pair = this.buffer(name);
    this.buffers.set(name, [pair[1], pair[0]]);
  }

  private material(name: string, fragment: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
    let material = this.materials.get(name);
    if (!material) {
      material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
      this.materials.set(name, material);
    }
    return material;
  }

  enter(ctx: ToyContext): void {
    const profile = QUALITY_PROFILES[ctx.quality];
    this.resolution = profile.fluidResolution;
    this.iterations = profile.fluidPressurePasses;
    if (!this.built) this.build(ctx);
    this.root.visible = true;
  }

  private build(ctx: ToyContext): void {
    const texel = new THREE.Vector2(1 / this.resolution, 1 / this.resolution);
    this.buffer('velocity');
    this.buffer('dye');
    this.buffer('curl');
    this.buffer('divergence');
    this.buffer('pressure');
    this.material('splat', SPLAT, { uTarget: { value: null }, uPoint: { value: new THREE.Vector2() }, uValue: { value: new THREE.Vector3() }, uRadius: { value: 0.01 }, uAspect: { value: ctx.volume.width / ctx.volume.height } });
    this.material('advect', ADVECT, { uVelocity: { value: null }, uSource: { value: null }, uDt: { value: 1 }, uDissipation: { value: 0.985 }, uTexel: { value: texel.clone() } });
    this.material('curl', CURL, { uVelocity: { value: null }, uTexel: { value: texel.clone() } });
    this.material('vorticity', VORTICITY, { uVelocity: { value: null }, uCurl: { value: null }, uTexel: { value: texel.clone() }, uCurlStrength: { value: 20 }, uDt: { value: 0.016 } });
    this.material('divergence', DIVERGENCE, { uVelocity: { value: null }, uTexel: { value: texel.clone() } });
    this.material('pressure', PRESSURE, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: texel.clone() } });
    this.material('gradient', GRADIENT, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: texel.clone() } });
    this.material('display', DISPLAY, { uDye: { value: null }, uNight: { value: 0 }, uHues: { value: new THREE.Vector2(...PALETTES[this.palette]) } });
    this.scene.add(this.quad);

    this.display = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material('display', DISPLAY, {}));
    this.display.scale.set(ctx.volume.width, ctx.volume.height, 1);
    this.display.position.set(0, 0, -ctx.volume.depth / 2 + 0.02);
    this.display.renderOrder = -1;
    this.root.add(this.display);
    this.built = true;
  }

  onGesture(event: LabEvent): void {
    if (event === 'PINCH_START') this.held = true;
    if (event === 'PINCH_END') this.held = false;
  }

  private blit(ctx: ToyContext, material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    const previous = ctx.renderer.getRenderTarget();
    ctx.renderer.setRenderTarget(to);
    ctx.renderer.render(this.scene, this.camera);
    ctx.renderer.setRenderTarget(previous);
  }

  private splat(ctx: ToyContext, x: number, y: number, vx: number, vy: number, dye: THREE.Vector3, radius: number): void {
    const splat = this.material('splat', SPLAT, {});
    splat.uniforms.uPoint.value.set(x, y);
    splat.uniforms.uRadius.value = radius * radius;
    splat.uniforms.uTarget.value = this.read('velocity').texture;
    splat.uniforms.uValue.value.set(vx, vy, 0);
    this.blit(ctx, splat, this.buffer('velocity')[1]);
    this.swap('velocity');
    splat.uniforms.uTarget.value = this.read('dye').texture;
    splat.uniforms.uValue.value.copy(dye);
    this.blit(ctx, splat, this.buffer('dye')[1]);
    this.swap('dye');
  }

  update(frame: ToyFrame, ctx: ToyContext): void {
    const display = this.material('display', DISPLAY, {});
    display.uniforms.uNight.value = frame.night;
    display.uniforms.uDye.value = this.read('dye').texture;
    if (!frame.interactive) return;

    const hands = [frame.primary, frame.secondary];
    hands.forEach((hand, index) => {
      if (!hand || !hand.isStable) return;
      const wide = hand.openness >= 0.55;
      const [hueA, hueB] = PALETTES[this.palette];
      const rgb = hsvToRgb(index === 0 ? hueA : hueB, 0.75, wide ? 0.28 : 1.05);
      // A pinch carries a colour it can keep pouring; an open palm mostly shoves fluid.
      const amount = this.held || !wide ? 1 : 0.12;
      this.splat(
        ctx,
        hand.palmCenter.x,
        1 - hand.palmCenter.y,
        hand.palmVelocity.x * 900,
        -hand.palmVelocity.y * 900,
        new THREE.Vector3(rgb[0] * amount, rgb[1] * amount, rgb[2] * amount),
        wide ? 0.17 : 0.05,
      );
    });

    this.material('curl', CURL, {}).uniforms.uVelocity.value = this.read('velocity').texture;
    this.blit(ctx, this.material('curl', CURL, {}), this.read('curl'));

    const vorticity = this.material('vorticity', VORTICITY, {});
    vorticity.uniforms.uVelocity.value = this.read('velocity').texture;
    vorticity.uniforms.uCurl.value = this.read('curl').texture;
    vorticity.uniforms.uDt.value = Math.min(frame.dt, 0.033);
    this.blit(ctx, vorticity, this.buffer('velocity')[1]);
    this.swap('velocity');

    const advect = this.material('advect', ADVECT, {});
    advect.uniforms.uVelocity.value = this.read('velocity').texture;
    advect.uniforms.uSource.value = this.read('velocity').texture;
    advect.uniforms.uDt.value = 1;
    advect.uniforms.uDissipation.value = 0.985;
    this.blit(ctx, advect, this.buffer('velocity')[1]);
    this.swap('velocity');

    this.material('divergence', DIVERGENCE, {}).uniforms.uVelocity.value = this.read('velocity').texture;
    this.blit(ctx, this.material('divergence', DIVERGENCE, {}), this.read('divergence'));

    const pressure = this.material('pressure', PRESSURE, {});
    pressure.uniforms.uDivergence.value = this.read('divergence').texture;
    for (let i = 0; i < this.iterations; i += 1) {
      pressure.uniforms.uPressure.value = this.read('pressure').texture;
      this.blit(ctx, pressure, this.buffer('pressure')[1]);
      this.swap('pressure');
    }

    const gradient = this.material('gradient', GRADIENT, {});
    gradient.uniforms.uPressure.value = this.read('pressure').texture;
    gradient.uniforms.uVelocity.value = this.read('velocity').texture;
    this.blit(ctx, gradient, this.buffer('velocity')[1]);
    this.swap('velocity');

    advect.uniforms.uVelocity.value = this.read('velocity').texture;
    advect.uniforms.uSource.value = this.read('dye').texture;
    advect.uniforms.uDissipation.value = 0.992;
    this.blit(ctx, advect, this.buffer('dye')[1]);
    this.swap('dye');
  }

  setPalette(palette: InkPalette): void {
    this.palette = palette;
    if (this.built) this.material('display', DISPLAY, {}).uniforms.uHues.value.set(...PALETTES[palette]);
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
    this.buffers.forEach(([a, b]) => {
      a.dispose();
      b.dispose();
    });
    this.buffers.clear();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.quad.geometry.dispose();
    this.display?.geometry.dispose();
    this.scene.clear();
    this.root.clear();
    this.display = null;
    this.built = false;
  }
}

export default new FluidToy();
