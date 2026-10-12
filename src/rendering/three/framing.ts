import type { Stroke } from '../../types/drawing';
import { planeToWorld } from './plane';

/**
 * "Center Artwork": work out where the ink actually is and how far back the
 * camera has to sit to hold all of it, so a piece drawn off to one side can be
 * brought in front of the user with one pinch.
 *
 * The distance is derived from the vertical field of view and the bounding box,
 * with a margin, and is then handed to the inspect controller — which eases to
 * it. Nothing teleports.
 */

const CAMERA_FOV_DEG = 42;
const FIT_MARGIN = 1.18;

export type Frame = { x: number; y: number; distance: number };

export function frameRequest(strokes: readonly Stroke[]): Frame | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = minX;
  let maxY = maxX;
  let seen = false;

  for (const stroke of strokes) {
    for (const segment of stroke.segments) {
      for (const point of segment) {
        const [wx, wy] = planeToWorld(point);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        seen = true;
      }
    }
  }
  if (!seen) return null;

  const halfVertical = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const aspect = Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight));
  const spanX = (maxX - minX) / 2 + 1.2;
  const spanY = (maxY - minY) / 2 + 1.2;
  // The tighter of the two axes decides how far back the camera has to sit.
  const distance = Math.max(spanY / halfVertical, spanX / (halfVertical * aspect)) * FIT_MARGIN;

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, distance };
}
