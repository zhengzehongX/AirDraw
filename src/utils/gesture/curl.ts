import { CURL_HALF_CURL_DEG, CURL_NO_CURL_DEG } from '../../config';
import { LANDMARK, type Landmark, type TrackedHand } from '../../types/hand';

export const FingerCurl = {
  NoCurl: 0,
  HalfCurl: 1,
  FullCurl: 2,
} as const;

export type FingerCurl = (typeof FingerCurl)[keyof typeof FingerCurl];

export type FingerKey = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export type FingerCurls = Record<FingerKey, FingerCurl>;

/**
 * 3D points used for curl math. Metric `worldLandmarks` are preferred (they are
 * rotation- and scale-invariant); when a backend does not provide them we fall
 * back to normalized landmarks stretched by the video aspect so angles stay
 * meaningful in screen space.
 */
export function gesturePoints(hand: TrackedHand, videoAspect: number): Landmark[] {
  if (hand.worldLandmarks && hand.worldLandmarks.length >= 21) return hand.worldLandmarks;
  return hand.landmarks.map((lm) => ({ x: lm.x * videoAspect, y: lm.y, z: lm.z }));
}

function interiorAngleDeg(at: Landmark, a: Landmark, b: Landmark): number {
  const ax = a.x - at.x;
  const ay = a.y - at.y;
  const az = a.z - at.z;
  const bx = b.x - at.x;
  const by = b.y - at.y;
  const bz = b.z - at.z;
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la < 1e-9 || lb < 1e-9) return 180;
  const cos = Math.min(Math.max((ax * bx + ay * by + az * bz) / (la * lb), -1), 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * fingerpose-style curl: interior angle at the middle joint of
 * (knuckle, middle, tip). ~180° = straight, ~0° = fully folded.
 * Thresholds (130° / 60°) follow fingerpose's FingerPoseEstimator.
 */
export function curlOf(points: Landmark[], base: number, mid: number, tip: number): FingerCurl {
  const angle = interiorAngleDeg(points[mid], points[base], points[tip]);
  if (angle > CURL_NO_CURL_DEG) return FingerCurl.NoCurl;
  if (angle > CURL_HALF_CURL_DEG) return FingerCurl.HalfCurl;
  return FingerCurl.FullCurl;
}

export function computeCurls(points: Landmark[]): FingerCurls {
  return {
    thumb: curlOf(points, LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP),
    index: curlOf(points, LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP, LANDMARK.INDEX_TIP),
    middle: curlOf(points, LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_TIP),
    ring: curlOf(points, LANDMARK.RING_MCP, LANDMARK.RING_PIP, LANDMARK.RING_TIP),
    pinky: curlOf(points, LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP, LANDMARK.PINKY_TIP),
  };
}
