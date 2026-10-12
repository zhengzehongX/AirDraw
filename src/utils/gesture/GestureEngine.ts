import { GESTURE_CONFIRM_FRAMES, GESTURE_MIN_SCORE } from '../../config';
import type { GestureName, GestureState } from '../../types/drawing';
import type { TrackedHand } from '../../types/hand';
import { computeCurls, FingerCurl, gesturePoints, type FingerCurls, type FingerKey } from './curl';

type DescriptionEntry = { curl: FingerCurl; weight: number };
type GestureDescription = {
  name: GestureName;
  curls: Partial<Record<FingerKey, DescriptionEntry>>;
};

/**
 * Weighted curl descriptions, in the spirit of fingerpose's GestureDescription
 * (addCurl with a contribution weight) but without its screen-space direction
 * voting: camera-relative directions flip with hand rotation and added noise
 * for the five poses AirDraw needs.
 */
const DESCRIPTIONS: GestureDescription[] = [
  {
    name: 'POINT',
    curls: {
      index: { curl: FingerCurl.NoCurl, weight: 1 },
      middle: { curl: FingerCurl.FullCurl, weight: 1 },
      ring: { curl: FingerCurl.FullCurl, weight: 1 },
      pinky: { curl: FingerCurl.FullCurl, weight: 1 },
      thumb: { curl: FingerCurl.HalfCurl, weight: 0.4 },
    },
  },
  {
    name: 'OPEN_PALM',
    curls: {
      thumb: { curl: FingerCurl.NoCurl, weight: 0.7 },
      index: { curl: FingerCurl.NoCurl, weight: 1 },
      middle: { curl: FingerCurl.NoCurl, weight: 1 },
      ring: { curl: FingerCurl.NoCurl, weight: 1 },
      pinky: { curl: FingerCurl.NoCurl, weight: 1 },
    },
  },
  {
    name: 'FIST',
    curls: {
      thumb: { curl: FingerCurl.FullCurl, weight: 0.7 },
      index: { curl: FingerCurl.FullCurl, weight: 1 },
      middle: { curl: FingerCurl.FullCurl, weight: 1 },
      ring: { curl: FingerCurl.FullCurl, weight: 1 },
      pinky: { curl: FingerCurl.FullCurl, weight: 1 },
    },
  },
  {
    name: 'VICTORY',
    curls: {
      index: { curl: FingerCurl.NoCurl, weight: 1 },
      middle: { curl: FingerCurl.NoCurl, weight: 1 },
      ring: { curl: FingerCurl.FullCurl, weight: 1 },
      pinky: { curl: FingerCurl.FullCurl, weight: 1 },
      thumb: { curl: FingerCurl.HalfCurl, weight: 0.3 },
    },
  },
];

/** fingerpose scoring: +weight on match, −weight on mismatch, scaled to 0..10. */
function scoreDescription(description: GestureDescription, curls: FingerCurls): number {
  let total = 0;
  let earned = 0;
  for (const key of Object.keys(description.curls) as FingerKey[]) {
    const entry = description.curls[key];
    if (!entry) continue;
    total += entry.weight;
    const actual = curls[key];
    if (actual === entry.curl) earned += entry.weight;
    else if (Math.abs(actual - entry.curl) === 1) earned -= entry.weight * 0.5;
    else earned -= entry.weight;
  }
  if (total === 0) return 0;
  return Math.max(0, (earned / total) * 10);
}

/**
 * Standalone gesture classifier with temporal hysteresis (which neither
 * fingerpose nor the MediaPipe samples provide): a candidate pose must repeat
 * for `confirmFrames` ticks before it replaces the reported gesture, and the
 * reported gesture accumulates a duration used by hold-to-act actions.
 */
export class GestureEngine {
  private current: GestureName = 'NONE';
  private confidence = 0;
  private candidate: GestureName = 'NONE';
  private candidateFrames = 0;
  private sinceMs = 0;

  get state(): GestureState {
    return {
      gesture: this.current,
      confidence: this.confidence,
      durationMs: this.sinceMs,
      handedness: this.handedness,
    };
  }

  private handedness: TrackedHand['handedness'] | null = null;

  reset(): void {
    this.current = 'NONE';
    this.candidate = 'NONE';
    this.candidateFrames = 0;
    this.sinceMs = 0;
    this.confidence = 0;
    this.handedness = null;
  }

  /** @param pinchActive already-confirmed pinch from the hysteresis detector */
  update(hand: TrackedHand | null, pinchActive: boolean, dtMs: number, videoAspect: number): GestureState {
    if (!hand) {
      this.reset();
      return this.state;
    }
    this.handedness = hand.handedness;

    const curls = computeCurls(gesturePoints(hand, videoAspect));
    let best: GestureName = pinchActive ? 'PINCH' : 'NONE';
    let bestScore = pinchActive ? 10 : 0;

    if (!pinchActive) {
      for (const description of DESCRIPTIONS) {
        const score = scoreDescription(description, curls);
        if (score > bestScore) {
          bestScore = score;
          best = description.name;
        }
      }
      if (bestScore < GESTURE_MIN_SCORE) {
        best = 'NONE';
        bestScore = 0;
      }
    }

    if (best === this.candidate) {
      this.candidateFrames += 1;
    } else {
      this.candidate = best;
      this.candidateFrames = 1;
    }

    if (this.candidateFrames >= GESTURE_CONFIRM_FRAMES && best !== this.current) {
      this.current = best;
      this.sinceMs = 0;
    } else if (best === this.current) {
      this.sinceMs += dtMs;
    }

    this.confidence = bestScore;
    return this.state;
  }
}
