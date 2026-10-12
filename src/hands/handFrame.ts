import { LANDMARK, type Handedness, type HandLandmarks, type WorldLandmarks } from '../types/hand';
import type { Point } from '../types/drawing';
import { PALM_SWIPE } from '../config';

/**
 * One stable reading of one hand, in the same plane space the pointer and the
 * ink already live in.
 *
 * The engine already computes most of this for drawing; PlayLab needs a little
 * more (normal, roll, openness, velocity) and needs it *without* re-running the
 * MediaPipe graph, so the frame is assembled where the landmarks already are.
 * Everything here is derived from at least two frames: nothing in PlayLab may
 * react to a single landmark sample, because monocular landmarks jitter by
 * several millimetres per tick.
 */
export type HandRole = 'primary' | 'secondary';

export type HandFrame = {
  role: HandRole;
  handedness: Handedness;
  /** Handedness category probability — the only real confidence MediaPipe gives us. */
  confidence: number;
  landmarks: HandLandmarks;
  worldLandmarks: WorldLandmarks | null;
  /** Palm centre in standard non-mirrored camera plane coordinates. */
  palmCenter: Point;
  /** Unit normal of the knuckle plane; `facing` is how squarely it points at the camera. */
  palmNormal: Point;
  /** 0 = edge-on, 1 = flat to the camera. A hand seen from the side cannot swipe. */
  facing: number;
  /** Palm width in plane units (≈ fraction of frame width); every threshold is relative to it. */
  palmWidth: number;
  palmVelocity: Point;
  palmAcceleration: Point;
  /** 0 = fist, 1 = fully spread. */
  openness: number;
  grabStrength: number;
  /** Roll of the hand in the image plane, radians, wrist → middle knuckle. */
  wristRotation: number;
  pinchState: 'OPEN' | 'NEAR' | 'CONTACT' | 'HOLD' | 'RELEASE';
  pinchPoint: Point;
  /** 0 = open, 1 = pads pressed together. */
  pinchStrength: number;
  isStable: boolean;
  /** How long this hand has been continuously visible. */
  visibleForMs: number;
};

export type TwoHandFrame = {
  active: boolean;
  distance: number;
  midpoint: Point;
  /** Unit vector from the left-most hand to the other, plane space. */
  direction: Point;
  /** Distance relative to the distance when both hands became stable. */
  scale: number;
  /** Angle between the current hand line and the reference line, radians. */
  twist: number;
  /** + when closing, − when opening (plane units per second). */
  approachVelocity: number;
  separationVelocity: number;
};

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

const zero = (): Point => ({ x: 0, y: 0, z: 0 });

const length = (a: Point) => Math.hypot(a.x, a.y, a.z);

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k, z: a.z * k });

const normalise = (a: Point): Point => {
  const n = length(a);
  return n < 1e-9 ? { x: 0, y: 0, z: 1 } : { x: a.x / n, y: a.y / n, z: a.z / n };
};

const cross = (a: Point, b: Point): Point => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const finite = (p: Point | undefined): p is Point =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Wrist + the four knuckles: the most reliable "where is the hand" in a monocular stream. */
export function palmCentreOf(points: readonly Point[]): Point {
  const ids = [LANDMARK.WRIST, LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP, LANDMARK.PINKY_MCP];
  let sum = zero();
  let used = 0;
  for (const id of ids) {
    const p = points[id];
    if (!finite(p)) continue;
    sum = add(sum, p);
    used += 1;
  }
  return used === 0 ? zero() : scale(sum, 1 / used);
}

/**
 * Spread of the four fingers measured from the wrist. A fist keeps tips close to
 * their own knuckles; an open hand pushes them out to ~1.6–1.9×.
 */
export function opennessOf(points: readonly Point[]): number {
  const wrist = points[LANDMARK.WRIST];
  if (!finite(wrist)) return 0;
  let total = 0;
  let used = 0;
  for (const [tip, mcp] of [
    [LANDMARK.INDEX_TIP, LANDMARK.INDEX_MCP],
    [LANDMARK.MIDDLE_TIP, LANDMARK.MIDDLE_MCP],
    [LANDMARK.RING_TIP, LANDMARK.RING_MCP],
    [LANDMARK.PINKY_TIP, LANDMARK.PINKY_MCP],
  ] as const) {
    const t = points[tip];
    const m = points[mcp];
    if (!finite(t) || !finite(m)) continue;
    const base = length(sub(m, wrist));
    if (base < 1e-6) continue;
    total += length(sub(t, wrist)) / base;
    used += 1;
  }
  if (!used) return 0;
  return clamp((total / used - PALM_SWIPE.openRatio) / (PALM_SWIPE.spreadRatio - PALM_SWIPE.openRatio));
}

/** Knuckle-plane normal in metric space, plus how squarely the palm faces the camera. */
export function palmOrientation(world: WorldLandmarks | null): { normal: Point; facing: number } {
  if (!world || world.length < 21) return { normal: { x: 0, y: 0, z: 1 }, facing: 0 };
  const wrist = world[LANDMARK.WRIST];
  const index = world[LANDMARK.INDEX_MCP];
  const middle = world[LANDMARK.MIDDLE_MCP];
  const pinky = world[LANDMARK.PINKY_MCP];
  if (![wrist, index, middle, pinky].every(finite)) return { normal: { x: 0, y: 0, z: 1 }, facing: 0 };
  // Two in-plane edges (wrist→index knuckle, pinky→index knuckle) beat wrist→middle
  // alone: the normal stays defined while the hand tilts around the arm axis.
  const normal = normalise(cross(sub(index, wrist), sub(middle, pinky)));
  return { normal, facing: Math.abs(normal.z) };
}

/** Wrist → middle knuckle angle in the image plane; y is flipped so clockwise is positive. */
export function wristRollOf(points: readonly Point[]): number {
  const wrist = points[LANDMARK.WRIST];
  const middle = points[LANDMARK.MIDDLE_MCP];
  if (!finite(wrist) || !finite(middle)) return 0;
  return Math.atan2(-(middle.y - wrist.y), middle.x - wrist.x);
}

export type HandFrameInput = {
  role: HandRole;
  handedness: Handedness;
  confidence: number;
  landmarks: HandLandmarks;
  worldLandmarks: WorldLandmarks | null;
  /** Already mirrored, plane space. */
  palmCentre: Point;
  /** Plane units. */
  palmWidth: number;
  pinchState: HandFrame['pinchState'];
  pinchPoint: Point;
  /** 0..1 from the contact detector's own normalised distance. */
  pinchStrength: number;
  openness: number;
  palmNormal: Point;
  facing: number;
  wristRotation: number;
  isStable: boolean;
  visibleForMs: number;
};

export function handFrameOf(input: HandFrameInput): HandFrame {
  return {
    role: input.role,
    handedness: input.handedness,
    confidence: input.confidence,
    landmarks: input.landmarks,
    worldLandmarks: input.worldLandmarks,
    palmCenter: input.palmCentre,
    palmNormal: input.palmNormal,
    facing: input.facing,
    palmWidth: input.palmWidth,
    palmVelocity: zero(),
    palmAcceleration: zero(),
    openness: input.openness,
    grabStrength: 1 - input.openness,
    wristRotation: input.wristRotation,
    pinchState: input.pinchState,
    pinchPoint: input.pinchPoint,
    pinchStrength: input.pinchStrength,
    isStable: input.isStable,
    visibleForMs: input.visibleForMs,
  };
}

/**
 * Velocity and acceleration are EMA'd rather than differenced: a raw difference
 * of monocular landmarks is mostly noise, and the swipe detector integrates it.
 */
export class HandMotion {
  private position: Point | null = null;
  private velocity: Point | null = null;
  private previousVelocity: Point | null = null;
  private at = 0;

  get current(): { velocity: Point; acceleration: Point } {
    return { velocity: this.velocity ?? zero(), acceleration: this.previousVelocity ? sub(this.velocity ?? zero(), this.previousVelocity) : zero() };
  }

  get speed(): number {
    return this.velocity ? length(this.velocity) : 0;
  }

  track(next: Point, at: number): { velocity: Point; acceleration: Point } {
    if (!this.position || at - this.at <= 0) {
      this.position = next;
      this.at = at;
      this.velocity = zero();
      return this.current;
    }
    const dt = Math.min(Math.max((at - this.at) / 1000, 0.001), 0.25);
    let instant = scale(sub(next, this.position), 1 / dt);
    // A single bad landmark frame reads as several frame-widths per second. Cap the
    // sample to what a hand can physically do before blending, so noise cannot ride
    // into every toy that reads this velocity.
    const speed = length(instant);
    if (speed > PALM_SWIPE.maxSpeed) instant = scale(instant, PALM_SWIPE.maxSpeed / speed);
    this.previousVelocity = this.velocity;
    const blend = PALM_SWIPE.motionSmoothing;
    this.velocity = this.velocity
      ? add(scale(this.velocity, 1 - blend), scale(instant, blend))
      : instant;
    this.position = next;
    this.at = at;
    return this.current;
  }

  reset(): void {
    this.position = null;
    this.velocity = null;
    this.previousVelocity = null;
    this.at = 0;
  }
}
