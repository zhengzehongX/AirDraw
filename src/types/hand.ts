/**
 * Shared domain types for hand tracking.
 *
 * Phase 2 introduces a provider-agnostic result shape (`HandTrackingResult`)
 * so MediaPipe Tasks Vision and (later) TensorFlow.js hand-pose-detection can
 * be swapped behind the same interface — see services/handTracking/types.ts.
 */

export type Landmark = { x: number; y: number; z: number };

/** 21 landmarks, ordered exactly as MediaPipe Hands defines them. */
export type HandLandmarks = Landmark[];

/** Metric 3D landmarks, wrist-centred, in metres (MediaPipe worldLandmarks). */
export type WorldLandmarks = Landmark[];

export type Handedness = 'Left' | 'Right';

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const LANDMARK_COUNT = 21;

/** One detected hand, normalised across tracking backends. */
export type TrackedHand = {
  /** Normalized (0..1) positions in raw video space. */
  landmarks: HandLandmarks;
  /** Metric wrist-centred 3D points when the backend provides them. */
  worldLandmarks: WorldLandmarks | null;
  handedness: Handedness;
  /**
   * Backend confidence. MediaPipe exposes no per-landmark score, so this is the
   * handedness category probability — the only real confidence signal available.
   */
  score: number;
};

/** One detection tick; may contain zero, one or two hands. */
export type HandTrackingResult = {
  hands: TrackedHand[];
  /** performance.now() at detection time. */
  timestamp: number;
  inferenceMs: number;
  videoWidth: number;
  videoHeight: number;
  source: 'mediapipe' | 'synthetic' | 'tfjs';
};

export type TrackingLifecycle =
  | 'idle'
  | 'starting-camera'
  | 'loading-model'
  | 'running'
  | 'stopped'
  | 'error';

export type CameraErrorCode =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-in-use'
  | 'constraints-unsupported'
  | 'no-webgl'
  | 'no-camera-api'
  | 'unknown';

export type EngineErrorCode = CameraErrorCode | 'model-load-failed';

export type EngineError = {
  code: EngineErrorCode;
  /** Human readable, zh-CN. */
  message: string;
  hint?: string;
};
