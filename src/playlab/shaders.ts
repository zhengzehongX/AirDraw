/**
 * Shared GLSL for PlayLab.
 *
 * Kept as strings rather than a shader library dependency: the pieces are small,
 * they must compile on the same WebGL2 path as the ink scene, and every toy needs
 * the same noise so their motion at least *looks* like it comes from one world.
 */

/** Hash + value noise + curl of a noise potential. Cheap enough for 90k points. */
export const NOISE_GLSL = /* glsl */ `
float labHash(float n){ return fract(sin(n) * 43758.5453123); }
vec3 labHash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.9)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}
float labNoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(labHash(i.x + i.y * 57.0 + i.z * 113.0), labHash(i.x + 1.0 + i.y * 57.0 + i.z * 113.0), u.x),
        mix(labHash(i.x + i.y * 57.0 + 1.0 + i.z * 113.0), labHash(i.x + 1.0 + i.y * 57.0 + 1.0 + i.z * 113.0), u.x), u.y),
    mix(mix(labHash(i.x + i.y * 57.0 + (i.z + 1.0) * 113.0), labHash(i.x + 1.0 + i.y * 57.0 + (i.z + 1.0) * 113.0), u.x),
        mix(labHash(i.x + i.y * 57.0 + 2.0 + (i.z + 1.0) * 113.0), labHash(i.x + 1.0 + i.y * 57.0 + 2.0 + (i.z + 1.0) * 113.0), u.x), u.y),
    u.z);
}
vec3 labCurl(vec3 p, float t){
  float e = 0.35;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 a = labHash3(p + dz * 2.0 + t) - labHash3(p - dz * 2.0 + t);
  vec3 b = labHash3(p + dx * 2.0 + t * 1.3) - labHash3(p - dx * 2.0 + t * 1.3);
  vec3 c = labHash3(p + dy * 2.0 + t * 0.7) - labHash3(p - dy * 2.0 + t * 0.7);
  return normalize(vec3(b.z - c.y, c.x - a.z, a.y - b.x) + 1e-5);
}
`;

/** A palette that stays saturated when mixed — the grey-soup failure mode of additive blending. */
export const PALETTE_GLSL = /* glsl */ `
vec3 labHsv(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

/** Soft round sprite for every point toy; no textures to load or dispose. */
export const POINT_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vColor * (0.35 + core * 1.1), core * core * vAlpha);
}
`;

/** Attractor/repulsor block shared by the point toys: up to four hands/blobs. */
export const FIELD_GLSL = /* glsl */ `
uniform vec4 uAttractors[4];
uniform float uFieldStrength;
vec3 labField(vec3 p){
  vec3 force = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uAttractors[i];
    if (a.w == 0.0) continue;
    vec3 d = a.xyz - p;
    float dist = length(d) + 0.001;
    // a.w > 0 pulls, < 0 pushes; 1/dist² is clamped so a hand on top of a
    // particle cannot launch it across the scene.
    float sign = a.w > 0.0 ? 1.0 : -1.0;
    float magnitude = min(1.0 / (dist * dist), 6.0) * abs(a.w) * uFieldStrength;
    force += (d / dist) * magnitude;
  }
  return force;
}
`;
