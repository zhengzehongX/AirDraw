import * as THREE from 'three';
import type { Point } from '../../types/drawing';
import { brushRadius, planeToWorld } from './plane';

export const LIVE_MAX_RINGS = 720;
const RADIAL = 10;

/**
 * A GPU-friendly growing tube for the stroke in progress.
 *
 * Vertices and indices are pre-allocated once; each new resampled point appends
 * one ring and one quad strip of indices, then only `drawRange` grows. Nothing
 * is rebuilt per point (the phase-2 bottleneck), and the finished high-quality
 * TubeGeometry is generated once, on lift-off, in the commit path.
 */
export class LiveTube {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshPhysicalMaterial;
  readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly normals: Float32Array;
  private readonly uvs:Float32Array;
  private readonly index: Uint32Array;
  private rings = 0;
  private lastCenter: THREE.Vector3 | null = null;
  private lastNormal: THREE.Vector3 | null = null;
  private baseColor = new THREE.Color('#22d3ee');

  constructor() {
    const vertexCount = LIVE_MAX_RINGS * (RADIAL + 1);
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.uvs=new Float32Array(vertexCount*2);
    this.index = new Uint32Array((LIVE_MAX_RINGS - 1) * RADIAL * 6);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('uv',new THREE.BufferAttribute(this.uvs,2));
    this.geometry.setIndex(new THREE.BufferAttribute(this.index, 1));
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

    this.material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.15,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  reset(color: string): void {
    this.rings = 0;
    this.lastCenter = null;
    this.lastNormal = null;
    this.baseColor.set(color);
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  get ringCount(): number {
    return this.rings;
  }

  /** Append one ring at the given plane point. O(radial) per call. */
  addPoint(point: Point, widthPx: number, hueDrift: number): void {
    if (this.rings >= LIVE_MAX_RINGS) return;
    const center = new THREE.Vector3(...planeToWorld(point));
    const radius = brushRadius(widthPx);

    let tangent: THREE.Vector3;
    if (this.lastCenter) {
      tangent = center.clone().sub(this.lastCenter);
      if (tangent.lengthSq() < 1e-10) tangent = new THREE.Vector3(0, 0, 1);
      tangent.normalize();
    } else {
      tangent = new THREE.Vector3(0, 0, 1);
    }

    // Parallel-transport-ish frame: keep the previous normal when possible so
    // the tube does not twist between rings.
    let up = Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    let normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    if (this.lastNormal && normal.dot(this.lastNormal) < 0) normal.multiplyScalar(-1);
    if (this.lastNormal && normal.lengthSq() > 0) {
      normal = this.lastNormal
        .clone()
        .sub(tangent.clone().multiplyScalar(this.lastNormal.dot(tangent)))
        .normalize();
      if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    }
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    this.lastNormal = normal.clone();

    const color = this.baseColor.clone().offsetHSL(hueDrift, 0, 0);
    const ringStart = this.rings * (RADIAL + 1);
    for (let j = 0; j <= RADIAL; j += 1) {
      const angle = (j / RADIAL) * Math.PI * 2;
      const offset = normal
        .clone()
        .multiplyScalar(Math.cos(angle) * radius)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
      const v = center.clone().add(offset);
      const o = (ringStart + j) * 3;
      this.positions[o] = v.x;
      this.positions[o + 1] = v.y;
      this.positions[o + 2] = v.z;
      const surfaceNormal=offset.clone().normalize();this.normals[o]=surfaceNormal.x;this.normals[o+1]=surfaceNormal.y;this.normals[o+2]=surfaceNormal.z;
      this.uvs[(ringStart+j)*2]=this.rings/60;this.uvs[(ringStart+j)*2+1]=j/RADIAL;
      this.colors[o] = color.r;
      this.colors[o + 1] = color.g;
      this.colors[o + 2] = color.b;
    }

    if (this.rings > 0) {
      const prevStart = (this.rings - 1) * (RADIAL + 1);
      let ii = (this.rings - 1) * RADIAL * 6;
      for (let j = 0; j < RADIAL; j += 1) {
        const a = prevStart + j;
        const b = prevStart + j + 1;
        const c = ringStart + j + 1;
        const d = ringStart + j;
        this.index[ii++] = a;
        this.index[ii++] = b;
        this.index[ii++] = c;
        this.index[ii++] = a;
        this.index[ii++] = c;
        this.index[ii++] = d;
      }
      (this.geometry.getIndex() as THREE.BufferAttribute).needsUpdate = true;
    }

    this.rings += 1;
    this.lastCenter = center;
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('uv') as THREE.BufferAttribute).needsUpdate=true;
    this.geometry.setDrawRange(0, (this.rings - 1) * RADIAL * 6);
    this.mesh.visible = this.rings > 1;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
