import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DrawEngine } from '../../engine/DrawEngine';
import { appMode } from '../../app/AppMode';
import { inputRouter } from '../../interaction/InputRouter';
import { interactionManager } from '../../interaction/GestureInteractionManager';
import { modelController } from '../../model/modelController';

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRipples[8];
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    float height = 0.0;
    for (int i = 0; i < 8; i++) {
      float age = uTime - uRipples[i].z;
      if (age >= 0.0 && age < 3.2) {
        float distanceFromTouch = distance(position.xy, uRipples[i].xy);
        float envelope = exp(-age * 1.12) * exp(-distanceFromTouch * 0.09);
        height += sin(distanceFromTouch * 7.2 - age * 5.6) * envelope * 0.055;
      }
    }
    vec3 displaced = position;
    displaced.z += height;
    vHeight = height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uTouch;
  uniform float uTouchOn;
  uniform float uPressed;
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPosition;
  void main() {
    float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edge = smoothstep(0.0, 0.075, edgeDistance);
    float glint = 0.5 + 0.5 * sin(vWorldPosition.x * 1.9 + vWorldPosition.z * 2.4 + uTime * 0.55);
    float crest = smoothstep(0.012, 0.055, abs(vHeight));
    float pointerDistance = distance(vUv, uTouch);
    float cursorRing = (1.0 - smoothstep(0.008, 0.018, abs(pointerDistance - 0.035))) * uTouchOn;
    float contactBloom = exp(-pointerDistance * 28.0) * uPressed;
    vec3 deep = vec3(0.018, 0.10, 0.14);
    vec3 shallows = vec3(0.032, 0.22, 0.27);
    vec3 color = mix(deep, shallows, clamp(0.32 + glint * 0.2 + crest * 0.28, 0.0, 1.0));
    color += vec3(0.22, 0.47, 0.53) * (cursorRing * 0.58 + contactBloom * 0.48);
    float alpha = edge * (0.62 + crest * 0.14 + contactBloom * 0.10);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type WaterUniforms = {
  uTime: { value: number };
  uRipples: { value: THREE.Vector3[] };
  uTouch: { value: THREE.Vector2 };
  uTouchOn: { value: number };
  uPressed: { value: number };
};

/** A light-weight interactive water sheet. Pinches only create ripples when the
 * tracked ray reaches the sheet; object grabs and UI captures retain priority. */
export function WaterTouchSurface({ engine }: { engine: DrawEngine }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const localPoint = useMemo(() => new THREE.Vector3(), []);
  const memory = useRef({ wasDown: false, lastX: 0, lastY: 0, lastAt: -1, next: 0 });
  const uniforms = useMemo<WaterUniforms>(() => ({
    uTime: { value: 0 },
    uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, -100)) },
    uTouch: { value: new THREE.Vector2(-2, -2) },
    uTouchOn: { value: 0 },
    uPressed: { value: 0 },
  }), []);

  useFrame((state) => {
    const surface = mesh.current;
    const mat = material.current;
    const root = group.current;
    if (!surface || !mat || !root) return;
    const weight = appMode.weights().MODEL_CONTROL;
    root.visible = weight > 0.001;
    root.scale.setScalar(0.94 + 0.06 * weight);
    root.position.z = -4 * (1 - weight);
    mat.uniforms.uTime.value = state.clock.elapsedTime;

    const hand = engine.tracking.primary;
    const cursor = hand && performance.now() - engine.frame.at < 220 ? engine.cursorPlanePoint() : null;
    const visible = weight > 0.15 && !!cursor && !document.hidden;
    const screen = visible ? engine.toScreenPoint(cursor!) : null;
    let hit: THREE.Intersection | null = null;
    if (screen) {
      raycaster.setFromCamera(new THREE.Vector2(screen.x / state.size.width * 2 - 1, 1 - screen.y / state.size.height * 2), state.camera);
      const intersections = raycaster.intersectObjects(state.scene.children, true);
      const firstRelevant = intersections.find((item) => {
        let current: THREE.Object3D | null = item.object;
        let projectObject = false;
        while (current) {
          if (current.userData.sceneObjectId) projectObject = true;
          current = current.parent;
        }
        return projectObject || item.object === surface;
      });
      if (firstRelevant?.object === surface) hit = firstRelevant;
    }

    const overWater = !!hit;
    const down = overWater && engine.contact.state === 'HOLD' && inputRouter.mayTransform
      && !modelController.worldActive && !modelController.targetId
      && (interactionManager.distanceToTargets(screen!) ?? Infinity) > 46;
    mat.uniforms.uTouchOn.value += ((overWater ? 1 : 0) - mat.uniforms.uTouchOn.value) * 0.24;
    mat.uniforms.uPressed.value += ((down ? 1 : 0) - mat.uniforms.uPressed.value) * 0.32;

    if (hit && overWater) {
      surface.updateWorldMatrix(true, false);
      localPoint.copy(hit.point);
      surface.worldToLocal(localPoint);
      const touch = mat.uniforms.uTouch.value as THREE.Vector2;
      touch.set(hit.uv?.x ?? 0.5, hit.uv?.y ?? 0.5);
      const now = state.clock.elapsedTime;
      const moved = Math.hypot(localPoint.x - memory.current.lastX, localPoint.y - memory.current.lastY) > 0.12;
      if (down && (!memory.current.wasDown || (moved && now - memory.current.lastAt > 0.11))) {
        const ripple = mat.uniforms.uRipples.value[memory.current.next];
        ripple.set(localPoint.x, localPoint.y, now);
        memory.current.next = (memory.current.next + 1) % 8;
        memory.current.lastAt = now;
      }
      memory.current.lastX = localPoint.x;
      memory.current.lastY = localPoint.y;
    } else {
      mat.uniforms.uTouch.value.set(-2, -2);
    }
    memory.current.wasDown = down;
  });

  return (
    <group ref={group} userData={{ excludeFromArtwork: true }}>
      <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.94, 0]} userData={{ waterTouchSurface: true, excludeFromArtwork: true }}>
        <planeGeometry args={[14, 9, 96, 64]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
