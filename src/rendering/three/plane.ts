import type { Point } from '../../types/drawing';

/** Virtual drawing plane size in world units (16:9, like the camera frame). */
export const PLANE_WIDTH = 16;
export const PLANE_HEIGHT = 9;

/** Normalized plane point → world position on the fixed drawing plane.
 *  The z term is deliberately tiny: monocular depth jitters too much to drive
 *  world position, so it only nudges the tube off the plane for parallax. */
export function planeToWorld(point: Point, zScale = 0.35): [number, number, number] {
  return [(point.x - 0.5) * PLANE_WIDTH, (0.5 - point.y) * PLANE_HEIGHT, point.z * zScale];
}

/**
 * The inverse of {@link planeToWorld} for a point that lies on the drawing plane. Used
 * to place ink where the camera says the pointer is, so a stroke lands under the cursor
 * at any field of view, distance or orbit instead of at a fixed pixel scale.
 */
export function worldToPlane(world: { x: number; y: number; z?: number }, zScale = 0.35): Point {
  return {
    x: world.x / PLANE_WIDTH + 0.5,
    y: 0.5 - world.y / PLANE_HEIGHT,
    z: (world.z ?? 0) / zScale,
  };
}

/** Brush width in px (2..24) → tube radius in world units. */
export function brushRadius(widthPx: number): number {
  const t = Math.min(Math.max((widthPx - 2) / 22, 0), 1);
  return 0.05 + t * 0.26;
}

/**
 * Uniform arc-length resampling with corner preservation: points where the
 * path turns sharply are always kept as knots — including under the stride
 * decimation that kicks in when a stroke exceeds the point budget — so letters,
 * spirals and tight corners survive smoothing instead of being shaved off.
 */
export function resamplePolyline(
  points: readonly Point[],
  spacing: number,
  maxPoints: number,
): Point[] {
  if (points.length < 2) return [...points];

  const isCorner = (i: number): boolean => {
    if (i <= 0 || i >= points.length - 1) return false;
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) return false;
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    return cos < 0.35; // turn sharper than ~69°
  };

  const out: Point[] = [{ ...points[0] }];
  /** Parallel to `out`: knots that must survive decimation. */
  const knot: boolean[] = [true];
  let carried = 0;

  for (let i = 1; i < points.length; i += 1) {
    let from = { ...points[i - 1] };
    const to = points[i];
    let remaining = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining < 1e-9) {
      if (isCorner(i)) {
        out.push({ ...to });
        knot.push(true);
      }
      continue;
    }

    while (carried + remaining >= spacing) {
      const t = (spacing - carried) / remaining;
      from = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        z: from.z + (to.z - from.z) * t,
      };
      out.push({ ...from });
      knot.push(false);
      carried = 0;
      remaining = Math.hypot(to.x - from.x, to.y - from.y);
      if (remaining < 1e-9) break;
    }
    carried += remaining;
    if (isCorner(i)) {
      out.push({ ...to });
      knot.push(true);
    }
  }

  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > spacing * 0.4) {
    out.push({ ...last });
    knot.push(true);
  }

  if (out.length <= maxPoints) return out;
  const stride = Math.max(2, Math.ceil(out.length / maxPoints));
  const decimated: Point[] = [];
  for (let i = 0; i < out.length; i += 1) {
    if (i % stride === 0 || knot[i]) decimated.push(out[i]);
  }
  if (decimated[decimated.length - 1] !== out[out.length - 1]) decimated.push(out[out.length - 1]);
  return decimated;
}
