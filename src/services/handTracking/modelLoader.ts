import type { EngineErrorCode } from '../../types/hand';
import { AirDrawError } from '../errors';
import type { DetectionResultLike, HandLandmarkerLike } from './types';
import { defaultTrackingConfig, type TrackingConfig } from './workerProtocol';

export type Delegate = 'GPU' | 'CPU';

/**
 * MediaPipe runtime assets are vendored under /public so AirDraw works without
 * a CDN round trip. BASE_URL keeps this correct when the app is deployed under
 * a sub-path.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const WASM_BASE_PATH = `${BASE}/mediapipe/wasm`;
const MODEL_PATH = `${BASE}/models/hand_landmarker.task`;
/** Fallback for deployments that ship without the vendored 7.5 MB model. */
const REMOTE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type HandLandmarkerHandle = {
  landmarker: HandLandmarkerLike;
  delegate: Delegate;
  modelSource: 'local' | 'remote';
};

type TasksVisionModule = typeof import('@mediapipe/tasks-vision');

let visionModulePromise: Promise<TasksVisionModule> | null = null;

/** The bundle is ~1 MB; load it lazily and only once, ever. */
function loadVisionModule(): Promise<TasksVisionModule> {
  visionModulePromise ??= import('@mediapipe/tasks-vision');
  return visionModulePromise;
}

/**
 * Creates a VIDEO-mode hand landmarker for up to two hands.
 *
 * GPU delegate is tried first (several times faster than CPU); WebGL init fails
 * on some drivers and inside remote-desktop sessions, so CPU is the fallback.
 * The vendored model is preferred, the CDN copy is the last resort.
 */
export async function createHandLandmarker(config: TrackingConfig = defaultTrackingConfig): Promise<HandLandmarkerHandle> {
  const attempts: Array<Omit<HandLandmarkerHandle, 'landmarker'> & { modelAssetPath: string }> = [
    { delegate: 'GPU', modelSource: 'local', modelAssetPath: MODEL_PATH },
    { delegate: 'CPU', modelSource: 'local', modelAssetPath: MODEL_PATH },
    { delegate: 'GPU', modelSource: 'remote', modelAssetPath: REMOTE_MODEL_PATH },
    { delegate: 'CPU', modelSource: 'remote', modelAssetPath: REMOTE_MODEL_PATH },
  ];

  let lastError: unknown;
  try {
    const vision = await loadVisionModule();
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE_PATH);

    for (const attempt of attempts.filter(a => config.delegate === 'AUTO' || a.delegate === config.delegate)) {
      try {
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: attempt.modelAssetPath,
            delegate: attempt.delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: config.detection,
          minHandPresenceConfidence: config.presence,
          minTrackingConfidence: config.tracking,
        });
        return {
          landmarker: landmarker as HandLandmarkerLike,
          delegate: attempt.delegate,
          modelSource: attempt.modelSource,
        };
      } catch (err) {
        lastError = err;
        console.warn(
          `[AirDraw] hand landmarker init failed (${attempt.delegate}/${attempt.modelSource}):`,
          err,
        );
      }
    }
  } catch (err) {
    lastError ??= err;
    visionModulePromise = null;
  }

  throw new AirDrawError(
    'model-load-failed' satisfies EngineErrorCode,
    '手部识别模型加载失败',
    '请确认 public/models/hand_landmarker.task 与 public/mediapipe/wasm 是否存在，或检查网络后重试。',
    { cause: lastError },
  );
}

export type { DetectionResultLike };
