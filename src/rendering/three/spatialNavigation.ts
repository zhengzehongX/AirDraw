import * as THREE from 'three';

/**
 * Palm-driven navigation for the 3D ink, with the same rule as the 2D sheet: a
 * session freezes its baseline (camera, centre, distance, hand positions) when it
 * engages, and every later frame recomputes the camera from that baseline. Nothing
 * is ever added to the current camera position, so a still hand holds the view
 * perfectly and a 100 px hand move is the same world move on frame 1 and frame 900.
 *
 * Pan intersects the *starting* camera's rays through the palm with a fixed
 * reference plane (the plane through the view centre, perpendicular to the starting
 * view direction). Rebuilding that baseline from the already-moved camera each frame
 * is exactly the feedback loop this module exists to avoid.
 *
 * Zoom is an absolute distance ratio from the session start, clamped, with the
 * two-hand midpoint's world point kept in place by the same pan term — so the ink
 * between the hands stays between the hands.
 */
export type SpatialNavBaseline = {
  camPos: THREE.Vector3;
  camQuat: THREE.Quaternion;
  halfTan: number;
  aspect: number;
  planeZ: number;
  centreX: number;
  centreY: number;
  distance: number;
  palmNdc: { x: number; y: number };
  midNdc: { x: number; y: number };
  distancePx: number;
};

export type SpatialNavTarget = {
  centerX: number;
  centerY: number;
  distance: number;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Ray from a frozen camera through an NDC point, hit against the z = planeZ plane. */
export function rayHitPlane(base: SpatialNavBaseline, ndc: { x: number; y: number }): THREE.Vector3 | null {
  const dir = new THREE.Vector3(ndc.x * base.halfTan * base.aspect, ndc.y * base.halfTan, -1).applyQuaternion(base.camQuat);
  if (Math.abs(dir.z) < 1e-4) return null;
  const t = (base.planeZ - base.camPos.z) / dir.z;
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return base.camPos.clone().addScaledVector(dir, t);
}

/**
 * Absolute camera target for this frame. `null` means "the geometry went degenerate
 * (hands crossed, distance collapsed, ray parallel to the plane)": the caller must
 * hold the view instead of dividing by noise.
 */
export function spatialNavTarget(
  base: SpatialNavBaseline,
  palmNdc: { x: number; y: number } | null,
  midNdc: { x: number; y: number } | null,
  distancePx: number,
  limits: { min: number; max: number; centre: number },
): SpatialNavTarget | null {
  let dx = 0;
  let dy = 0;
  if (palmNdc) {
    const from = rayHitPlane(base, base.palmNdc);
    const to = rayHitPlane(base, palmNdc);
    if (!from || !to) return null;
    dx = to.x - from.x;
    dy = to.y - from.y;
  }
  if (midNdc && base.distancePx > 0 && distancePx > 0) {
    const from = rayHitPlane(base, base.midNdc);
    const to = rayHitPlane(base, midNdc);
    if (!from || !to) return null;
    dx += to.x - from.x;
    dy += to.y - from.y;
  }
  const ratio = base.distancePx > 0 && distancePx > 0 ? base.distancePx / distancePx : 1;
  return {
    // Hand right moves the ink right: the rig's centre travels the other way.
    centerX: clamp(base.centreX - dx, -limits.centre, limits.centre),
    centerY: clamp(base.centreY - dy, -limits.centre, limits.centre),
    distance: clamp(base.distance * ratio, limits.min, limits.max),
  };
}

/** NDC for a container-CSS-pixel point, y up, in [-1, 1]. */
export function screenToNdc(point: { x: number; y: number }, surface: { x: number; y: number }) {
  return { x: (point.x / surface.x) * 2 - 1, y: 1 - (point.y / surface.y) * 2 };
}
