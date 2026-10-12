import { DETECTION_MAX_FPS, WORLD_PALM_REFERENCE_M } from '../../config';
import { LANDMARK } from '../../types/hand';
import type { HandLandmarks, HandTrackingResult, TrackedHand, WorldLandmarks } from '../../types/hand';
import type { HandTrackingProvider } from './types';

/**
 * Dev-only synthetic provider (`?simulate=1`).
 *
 * A physical hand cannot be present during automated checks, so this replays a
 * scripted ~26 s timeline that exercises every path the real tracker can take:
 * hovering (POINT), pinching to draw, a tracking dropout mid-stroke, a fast
 * sweep, a slow precise pass, held FIST / VICTORY poses (hold-to-act + gesture
 * labels) and a two-hand window (primary-hand stickiness). It feeds the exact
 * same `HandTrackingResult` shape as MediaPipe, including worldLandmarks.
 */

type Point2 = { x: number; y: number };
type PoseName = 'open' | 'point' | 'fist' | 'victory';

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
/** Local pose units → metres (palm = 0.9 units = 0.09 m). */
const WORLD_SCALE = WORLD_PALM_REFERENCE_M / 0.9;

type Segment = {
  duration: number;
  present: boolean;
  pinch: number;
  pose: PoseName;
  twoHands?: boolean;
  motion?: (u: number) => Point2;
};

const smooth = (u: number) => u * u * (3 - 2 * u);

const SEGMENTS: Segment[] = [
  {
    duration: 4,
    present: true,
    pinch: 0,
    pose: 'point',
    motion: (u) => ({ x: 0.5 + 0.24 * Math.cos(u * Math.PI * 2), y: 0.5 + 0.2 * Math.sin(u * Math.PI * 2) }),
  },
  {
    duration: 4,
    present: true,
    pinch: 1,
    pose: 'point',
    motion: (u) => ({ x: 0.15 + 0.7 * u, y: 0.5 + 0.26 * Math.sin(u * Math.PI * 6) }),
  },
  { duration: 1.5, present: false, pinch: 1, pose: 'point' },
  {
    duration: 3.5,
    present: true,
    pinch: 1,
    pose: 'point',
    motion: (u) => ({ x: 0.85 - 0.5 * u, y: 0.5 + 0.26 * Math.sin(Math.PI * 6 + u * Math.PI * 5) }),
  },
  {
    duration: 3,
    present: true,
    pinch: 0,
    pose: 'open',
    motion: (u) => ({ x: 0.35 + 0.55 * Math.sin(u * Math.PI * 6), y: 0.5 + 0.34 * Math.cos(u * Math.PI * 4) }),
  },
  {
    duration: 4,
    present: true,
    pinch: 1,
    pose: 'point',
    motion: (u) => ({ x: 0.5 + 0.1 * Math.cos(u * Math.PI * 4) + 0.06 * u, y: 0.55 + 0.09 * Math.sin(u * Math.PI * 4) }),
  },
  { duration: 3, present: true, pinch: 0, pose: 'fist', motion: () => ({ x: 0.5, y: 0.5 }) },
  { duration: 2, present: true, pinch: 0, pose: 'victory', motion: () => ({ x: 0.5, y: 0.45 }) },
  {
    duration: 3,
    present: true,
    pinch: 0,
    pose: 'point',
    twoHands: true,
    motion: (u) => ({ x: 0.42 + 0.16 * Math.cos(u * Math.PI * 2), y: 0.5 + 0.14 * Math.sin(u * Math.PI * 2) }),
  },
];

const TOTAL = SEGMENTS.reduce((sum, s) => sum + s.duration, 0);

function segmentAt(t: number): { segment: Segment; local: number } {
  let remaining = t % TOTAL;
  for (const segment of SEGMENTS) {
    if (remaining < segment.duration) return { segment, local: remaining / segment.duration };
    remaining -= segment.duration;
  }
  return { segment: SEGMENTS[SEGMENTS.length - 1], local: 1 };
}

/** Open-hand pose in palm-scale units, origin at the palm centre. */
const OPEN: Record<number, Point2> = {
  [LANDMARK.WRIST]: { x: 0, y: 1.0 },
  [LANDMARK.INDEX_MCP]: { x: -0.35, y: 0.15 },
  [LANDMARK.MIDDLE_MCP]: { x: 0, y: 0.1 },
  [LANDMARK.RING_MCP]: { x: 0.3, y: 0.15 },
  [LANDMARK.PINKY_MCP]: { x: 0.55, y: 0.35 },
  [LANDMARK.INDEX_PIP]: { x: -0.42, y: -0.25 },
  [LANDMARK.INDEX_DIP]: { x: -0.45, y: -0.5 },
  [LANDMARK.INDEX_TIP]: { x: -0.47, y: -0.78 },
  [LANDMARK.MIDDLE_PIP]: { x: 0, y: -0.3 },
  [LANDMARK.MIDDLE_DIP]: { x: 0, y: -0.58 },
  [LANDMARK.MIDDLE_TIP]: { x: 0, y: -0.85 },
  [LANDMARK.RING_PIP]: { x: 0.3, y: -0.25 },
  [LANDMARK.RING_DIP]: { x: 0.32, y: -0.5 },
  [LANDMARK.RING_TIP]: { x: 0.33, y: -0.74 },
  [LANDMARK.PINKY_PIP]: { x: 0.58, y: 0.02 },
  [LANDMARK.PINKY_DIP]: { x: 0.62, y: -0.2 },
  [LANDMARK.PINKY_TIP]: { x: 0.64, y: -0.4 },
  [LANDMARK.THUMB_CMC]: { x: -0.42, y: 0.72 },
  [LANDMARK.THUMB_MCP]: { x: -0.68, y: 0.44 },
  [LANDMARK.THUMB_IP]: { x: -0.84, y: 0.16 },
  [LANDMARK.THUMB_TIP]: { x: -0.95, y: -0.05 },
};

const THUMB_HALF: Partial<Record<number, Point2>> = {
  [LANDMARK.THUMB_MCP]: { x: -0.6, y: 0.35 },
  [LANDMARK.THUMB_IP]: { x: -0.72, y: 0.05 },
  [LANDMARK.THUMB_TIP]: { x: -0.78, y: -0.15 },
};

const THUMB_FIST: Partial<Record<number, Point2>> = {
  // Kept well away from the index tip: a fist must not read as a pinch
  // (ratio stays above PINCH_RELEASE_RATIO).
  [LANDMARK.THUMB_MCP]: { x: -0.45, y: 0.45 },
  [LANDMARK.THUMB_IP]: { x: -0.25, y: 0.68 },
  [LANDMARK.THUMB_TIP]: { x: 0.0, y: 0.85 },
};

const THUMB_PINCHED: Partial<Record<number, Point2>> = {
  [LANDMARK.THUMB_MCP]: { x: -0.5, y: 0.2 },
  [LANDMARK.THUMB_IP]: { x: -0.56, y: -0.28 },
  [LANDMARK.THUMB_TIP]: { x: -0.56, y: -0.62 },
};

const CURLABLE = [
  { mcp: LANDMARK.INDEX_MCP, pip: LANDMARK.INDEX_PIP, dip: LANDMARK.INDEX_DIP, tip: LANDMARK.INDEX_TIP },
  { mcp: LANDMARK.MIDDLE_MCP, pip: LANDMARK.MIDDLE_PIP, dip: LANDMARK.MIDDLE_DIP, tip: LANDMARK.MIDDLE_TIP },
  { mcp: LANDMARK.RING_MCP, pip: LANDMARK.RING_PIP, dip: LANDMARK.RING_DIP, tip: LANDMARK.RING_TIP },
  { mcp: LANDMARK.PINKY_MCP, pip: LANDMARK.PINKY_PIP, dip: LANDMARK.PINKY_DIP, tip: LANDMARK.PINKY_TIP },
];

const CURLED_FINGERS: Record<PoseName, number[]> = {
  open: [],
  point: [LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP, LANDMARK.PINKY_MCP],
  victory: [LANDMARK.RING_MCP, LANDMARK.PINKY_MCP],
  fist: [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP, LANDMARK.PINKY_MCP],
};

function lerpPoint(a: Point2, b: Point2, t: number): Point2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Local-space pose for a gesture name + pinch amount. */
function buildLocal(pose: PoseName, pinch: number): Point2[] {
  const local: Point2[] = new Array(21);
  const curled = CURLED_FINGERS[pose];
  const closed = smooth(Math.min(Math.max(pinch, 0), 1));

  for (let i = 0; i < 21; i += 1) local[i] = { ...OPEN[i] };

  for (const finger of CURLABLE) {
    if (!curled.includes(finger.mcp)) continue;
    const mcp = OPEN[finger.mcp];
    // Fold back toward the palm so the mid-joint interior angle reads FullCurl.
    local[finger.pip] = { x: mcp.x, y: mcp.y + 0.3 };
    local[finger.dip] = { x: mcp.x + 0.12, y: mcp.y + 0.34 };
    local[finger.tip] = { x: mcp.x + 0.22, y: mcp.y + 0.12 };
  }

  const thumbVariant = pose === 'fist' ? THUMB_FIST : pose === 'open' ? null : THUMB_HALF;
  if (thumbVariant) {
    for (const [key, value] of Object.entries(thumbVariant) as [string, Point2][]) local[Number(key)] = { ...value };
  }
  if (closed > 0) {
    for (const [key, value] of Object.entries(THUMB_PINCHED) as [string, Point2][]) {
      const index = Number(key);
      local[index] = lerpPoint(local[index], value, closed);
    }
  }

  local[LANDMARK.INDEX_TIP] = { ...local[LANDMARK.INDEX_TIP] };
  return local;
}

/** Local pose → normalized landmarks + wrist-centred metric world landmarks. */
function toHand(
  local: Point2[],
  originPx: Point2,
  scalePx: number,
  handedness: 'Left' | 'Right',
  mirrorX: boolean,
  depthWobble: number,
  score: number,
): TrackedHand {
  const wristLocal = local[LANDMARK.WRIST];
  const landmarks: HandLandmarks = new Array(21);
  const worldLandmarks: WorldLandmarks = new Array(21);

  for (let i = 0; i < 21; i += 1) {
    const jitter = i === LANDMARK.INDEX_TIP || i === LANDMARK.THUMB_TIP ? 0.006 : 0.002;
    const lx = (mirrorX ? -local[i].x : local[i].x) + (Math.random() - 0.5) * jitter;
    const ly = local[i].y + (Math.random() - 0.5) * jitter;
    const lz = i === LANDMARK.INDEX_TIP ? depthWobble : curledDepth(i);
    landmarks[i] = {
      x: (originPx.x + lx * scalePx) / VIDEO_WIDTH,
      y: (originPx.y + ly * scalePx) / VIDEO_HEIGHT,
      z: 0,
    };
    worldLandmarks[i] = {
      x: (lx - (mirrorX ? -wristLocal.x : wristLocal.x)) * WORLD_SCALE,
      y: (ly - wristLocal.y) * WORLD_SCALE,
      z: lz * WORLD_SCALE,
    };
  }

  return { landmarks, worldLandmarks, handedness, score };
}

function curledDepth(index: number): number {
  return index >= LANDMARK.MIDDLE_PIP && index <= LANDMARK.PINKY_TIP ? 0.15 : 0;
}

export class SyntheticHandProvider implements HandTrackingProvider {
  readonly kind = 'synthetic' as const;
  readonly delegate = 'SIM';
  readonly modelSource = 'local';

  private rafId = 0;
  private running = false;
  private startedAt = 0;
  private lastRunAt = 0;
  private currentPinch = 0;
  private minIntervalMs: number;
  private onResult: ((result: HandTrackingResult) => void) | null = null;

  constructor(maxFps: number = DETECTION_MAX_FPS) {
    this.minIntervalMs = 1000 / maxFps;
  }

  async start(onResult: (result: HandTrackingResult) => void): Promise<void> {
    if (this.running) return;
    this.onResult = onResult;
    this.running = true;
    this.startedAt = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  dispose(): void {
    this.stop();
    this.onResult = null;
  }

  setMaxFps(fps: number): void {
    this.minIntervalMs = 1000 / Math.max(5, fps);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // Test-drive takeover: while a harness pushes frames through
    // `__airdraw.handleResult`, the scripted timeline must stay silent or both
    // sources fight over the cursor.
    if (typeof window !== 'undefined' && (window as { __airdrawTestDrive?: boolean }).__airdrawTestDrive) {
      return;
    }

    const now = performance.now();
    if (now - this.lastRunAt < this.minIntervalMs - 0.5) return;
    const dt = this.lastRunAt === 0 ? 0.033 : (now - this.lastRunAt) / 1000;
    this.lastRunAt = now;

    const t = (now - this.startedAt) / 1000;
    const { segment, local } = segmentAt(t);

    // Ease the pinch instead of stepping it, so the hysteresis thresholds are
    // crossed the same way a real hand crosses them.
    const rate = 3.2 * dt;
    this.currentPinch += Math.max(-rate, Math.min(rate, segment.pinch - this.currentPinch));

    if (!segment.present || !segment.motion) {
      this.onResult?.({
        hands: [],
        timestamp: now,
        inferenceMs: 0.4,
        videoWidth: VIDEO_WIDTH,
        videoHeight: VIDEO_HEIGHT,
        source: 'synthetic',
      });
      return;
    }

    const scalePx = 0.16 * VIDEO_HEIGHT;
    const target = segment.motion(smooth(local));
    const depthWobble = 0.18 * Math.sin(t * 1.7);
    const primaryLocal = buildLocal(segment.pose, this.currentPinch);
    const indexTipLocal = primaryLocal[LANDMARK.INDEX_TIP];
    const originPx = {
      x: target.x * VIDEO_WIDTH - indexTipLocal.x * scalePx,
      y: target.y * VIDEO_HEIGHT - indexTipLocal.y * scalePx,
    };

    const hands: TrackedHand[] = [
      toHand(primaryLocal, originPx, scalePx, 'Right', false, depthWobble, 0.99),
    ];

    if (segment.twoHands) {
      const secondaryLocal = buildLocal('open', 0);
      const secondaryTip = secondaryLocal[LANDMARK.INDEX_TIP];
      const drift = { x: 0.8 + 0.04 * Math.sin(t * 0.9), y: 0.32 + 0.05 * Math.cos(t * 0.7) };
      hands.push(
        toHand(
          secondaryLocal,
          {
            x: drift.x * VIDEO_WIDTH - -secondaryTip.x * scalePx,
            y: drift.y * VIDEO_HEIGHT - secondaryTip.y * scalePx,
          },
          scalePx * 0.9,
          'Left',
          true,
          0,
          0.9,
        ),
      );
    }

    this.onResult?.({
      hands,
      timestamp: now,
      inferenceMs: 0.4,
      videoWidth: VIDEO_WIDTH,
      videoHeight: VIDEO_HEIGHT,
      source: 'synthetic',
    });
  };
}
