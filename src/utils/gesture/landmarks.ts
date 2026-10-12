import { LANDMARK, type HandLandmarks, type TrackedHand, type WorldLandmarks } from '../../types/hand';
import type { Point } from '../../types/drawing';

/** Bone pairs used to draw the debug skeleton. Mirrors MediaPipe's own
 *  HAND_CONNECTIONS but is declared locally so UI code never has to import the
 *  (heavy, dynamically loaded) tasks-vision bundle. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Convert normalized landmarks to video pixel space (z unused in 2D math). */
export function toPixelPoints(
  landmarks: HandLandmarks,
  videoWidth: number,
  videoHeight: number,
): Point[] {
  return landmarks.map((lm) => ({ x: lm.x * videoWidth, y: lm.y * videoHeight, z: 0 }));
}

/**
 * Wrist → middle-finger knuckle length, the most stable "how big is the hand
 * right now" reference available. Used to normalise the pinch distance.
 */
export function palmLength(pixels: Point[]): number {
  const wrist = pixels[LANDMARK.WRIST];
  const middleMcp = pixels[LANDMARK.MIDDLE_MCP];
  if (!wrist || !middleMcp) return 0;
  return distance(wrist, middleMcp);
}

/** Rough centre of the palm; handy for debugging and future gestures. */
export function palmCenter(pixels: Point[]): Point {
  const ids = [LANDMARK.WRIST, LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP, LANDMARK.PINKY_MCP];
  let x = 0;
  let y = 0;
  let n = 0;
  for (const id of ids) {
    const p = pixels[id];
    if (!p) continue;
    x += p.x;
    y += p.y;
    n += 1;
  }
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: x / n, y: y / n, z: 0 };
}

/** Scale-invariant pinch measure: 0 = fingertips touching, ~1.2 = hand open. */
export function pinchRatio(pixels: Point[]): { ratio: number; distancePx: number } {
  const thumb = pixels[LANDMARK.THUMB_TIP];
  const index = pixels[LANDMARK.INDEX_TIP];
  if (!thumb || !index) return { ratio: Number.POSITIVE_INFINITY, distancePx: 0 };
  const distancePx = distance(thumb, index);
  const palm = palmLength(pixels);
  if (palm < 4) return { ratio: Number.POSITIVE_INFINITY, distancePx };
  return { ratio: distancePx / palm, distancePx };
}

/** Metric palm length from worldLandmarks, or 0 when unavailable. */
export function worldPalmLength(world: WorldLandmarks | null): number {
  if (!world || world.length < 21) return 0;
  const wrist = world[LANDMARK.WRIST];
  const middleMcp = world[LANDMARK.MIDDLE_MCP];
  return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z);
}

/**
 * Depth feedback in [-1, 1]: how far the index fingertip sits in front of /
 * behind the wrist plane, normalised by palm size. Phase 2 uses it only for
 * subtle brush modulation — never as a world coordinate, because metric depth
 * from a monocular camera jitters too much for that.
 */
export function indexDepthFeedback(hand: TrackedHand): number {
  const world = hand.worldLandmarks;
  if (!world || world.length < 21) return 0;
  const palm = worldPalmLength(world);
  if (palm < 1e-4) return 0;
  const wrist = world[LANDMARK.WRIST];
  const tip = world[LANDMARK.INDEX_TIP];
  return (tip.z - wrist.z) / palm;
}
