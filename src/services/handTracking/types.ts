import type { HandTrackingResult, WorldLandmarks } from '../../types/hand';

export type ProviderKind = 'mediapipe' | 'synthetic' | 'tfjs';

/**
 * Backend contract for hand tracking.
 *
 * MediaPipe Tasks Vision is the production provider and `SyntheticProvider`
 * powers `?simulate=1`. A TensorFlow.js `hand-pose-detection` provider can be
 * added later by mapping `estimateHands()` output
 * (`{ keypoints, keypoints3D, handedness, score }`) onto `TrackedHand` — the
 * engine, gestures and renderers never see the difference.
 */
export interface HandTrackingProvider {
  readonly kind: ProviderKind;
  /** e.g. "GPU", "CPU", "SIM". */
  readonly delegate: string;
  /** Where the model came from, for the debug panel. */
  readonly modelSource: string;

  start(onResult: (result: HandTrackingResult) => void): Promise<void>;
  stop(): void;
  /** Releases WASM/runtime resources. Must be called on unmount. */
  dispose(): void;
  /** Performance governor hook: cap detection rate without touching accuracy. */
  setMaxFps(fps: number): void;
}

/** Structural subset of the tasks-vision `HandLandmarker`. Declaring it here keeps
 *  the heavy, dynamically imported bundle out of every module that only needs to
 *  consume detection results. */
export type HandLandmarkerLike = {
  detectForVideo(video: HTMLVideoElement | ImageBitmap, timestampMs: number): DetectionResultLike;
  setOptions?: (options: Record<string, unknown>) => Promise<void>;
  close(): void;
};

export type DetectionResultLike = {
  landmarks: WorldLandmarks[];
  worldLandmarks?: WorldLandmarks[] | null;
  handedness?: { categoryName?: string; score?: number }[][];
  handednesses?: { categoryName?: string; score?: number }[][];
};

export type { HandTrackingResult };
