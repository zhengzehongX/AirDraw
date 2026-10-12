import { DETECTION_MAX_FPS } from '../../config';
import { LANDMARK_COUNT, type HandTrackingResult, type TrackedHand } from '../../types/hand';
import type { DetectionResultLike, HandLandmarkerLike } from './types';
import type { HandTrackingProvider } from './types';

/**
 * MediaPipe Tasks Vision provider.
 *
 * Loop skeleton follows google-ai-edge/mediapipe-samples-web:
 *  - skip ticks where `video.currentTime` has not advanced (no new camera frame);
 *  - clamp the timestamp to be strictly monotonically increasing, because
 *    `detectForVideo` throws otherwise;
 *  - throttle to a sane detection rate so rendering keeps headroom.
 *
 * Unlike the sample, results are post-processed here (stability guards, gesture
 * engine and smoothing live in the engine layer) instead of going straight to a
 * drawing utility.
 */
export class MediaPipeHandProvider implements HandTrackingProvider {
  readonly kind = 'mediapipe' as const;

  private minIntervalMs: number;
  private rafId = 0;
  private running = false;
  private lastRunAt = Number.NEGATIVE_INFINITY;
  private lastTimestamp = -1;
  private lastVideoTime = -1;
  private lastInferenceMs = 0;
  private onResult: ((result: HandTrackingResult) => void) | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly landmarker: HandLandmarkerLike,
    readonly delegate: string,
    readonly modelSource: string,
    maxFps: number = DETECTION_MAX_FPS,
  ) {
    this.minIntervalMs = 1000 / maxFps;
  }

  get inferenceMs(): number {
    return this.lastInferenceMs;
  }

  async start(onResult: (result: HandTrackingResult) => void): Promise<void> {
    if (this.running) return;
    this.onResult = onResult;
    this.running = true;
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
    try {
      this.landmarker.close();
    } catch (err) {
      console.warn('[AirDraw] failed to close hand landmarker', err);
    }
  }

  setMaxFps(fps: number): void {
    this.minIntervalMs = 1000 / Math.max(5, fps);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const video = this.video;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    // Same-frame guard borrowed from the official sample.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    if (now - this.lastRunAt < this.minIntervalMs - 0.5) return;

    const timestamp = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastRunAt = now;
    this.lastTimestamp = timestamp;

    let result: DetectionResultLike;
    try {
      result = this.landmarker.detectForVideo(video, timestamp);
    } catch (err) {
      // A dropped frame is recoverable; spamming the console is not.
      console.warn('[AirDraw] detection failed for frame', timestamp, err);
      return;
    }

    this.lastInferenceMs = performance.now() - now;
    this.onResult?.(toResult(result, now, this.lastInferenceMs, video));
  };
}

function toResult(
  result: DetectionResultLike,
  timestamp: number,
  inferenceMs: number,
  video: HTMLVideoElement,
): HandTrackingResult {
  const hands: TrackedHand[] = [];
  const rawHands = result.landmarks ?? [];
  for (let i = 0; i < rawHands.length; i += 1) {
    const landmarks = rawHands[i];
    if (!landmarks || landmarks.length < LANDMARK_COUNT) continue;
    const categories = result.handedness?.[i] ?? result.handednesses?.[i];
    const primary = categories?.[0];
    hands.push({
      landmarks,
      worldLandmarks: result.worldLandmarks?.[i] ?? null,
      handedness: primary?.categoryName === 'Left' ? 'Left' : 'Right',
      score: primary?.score ?? 0,
    });
  }

  return {
    hands,
    timestamp,
    inferenceMs,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    source: 'mediapipe',
  };
}
