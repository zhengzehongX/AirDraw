import { CAMERA_IDEAL } from '../../config';
import type { EngineErrorCode } from '../../types/hand';
import { AirDrawError } from '../errors';

const FALLBACK_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };

const IDEAL_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: CAMERA_IDEAL.width },
    height: { ideal: CAMERA_IDEAL.height },
    facingMode: 'user',
    frameRate: { ideal: 30 },
  },
};

type ErrorCopy = { message: string; hint?: string };

const ERROR_COPY: Record<EngineErrorCode, ErrorCopy> = {
  'insecure-context': {
    message: '浏览器禁止在非安全页面访问摄像头',
    hint: '请通过 https:// 或 http://localhost 打开 AirDraw。',
  },
  'permission-denied': {
    message: '摄像头权限被拒绝',
    hint: '点击地址栏左侧的锁形图标，把「摄像头」改为允许，然后重试。',
  },
  'no-camera': {
    message: '没有检测到可用的摄像头',
    hint: '请连接摄像头（或检查系统设置里是否禁用了相机），然后重试。',
  },
  'camera-in-use': {
    message: '摄像头正被其他程序占用',
    hint: '关闭视频会议、直播软件或其他正在使用摄像头的标签页后重试。',
  },
  'no-webgl': {
    message: '当前浏览器无法创建 3D 画布',
    hint: '请改用较新的 Chrome / Edge，并在设置里开启硬件加速。',
  },
  'no-camera-api': {
    message: '当前浏览器没有提供摄像头接口',
    hint: '请改用较新的 Chrome / Edge / Safari。',
  },
  'constraints-unsupported': {
    message: '摄像头不支持请求的采集参数',
    hint: '已尝试用默认参数重新打开，若仍失败请更换摄像头。',
  },
  'model-load-failed': {
    message: '手部识别模型加载失败',
    hint: '确认 public/models/hand_landmarker.task 与 public/mediapipe/wasm 存在，或检查网络后重试。',
  },
  unknown: {
    message: '启动摄像头时发生未知错误',
  },
};

export function classifyCameraError(err: unknown): AirDrawError {
  const copy = (code: EngineErrorCode): AirDrawError =>
    new AirDrawError(code, ERROR_COPY[code].message, ERROR_COPY[code].hint, { cause: err });

  if (!isDomException(err) && !(err instanceof Error)) return copy('unknown');

  const name = isDomException(err) ? err.name : '';
  const message = err instanceof Error ? err.message.toLowerCase() : '';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return copy('permission-denied');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return copy('no-camera');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return copy('camera-in-use');
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return copy('constraints-unsupported');
    default:
      break;
  }

  if (message.includes('permission') || message.includes('denied')) return copy('permission-denied');
  if (message.includes('no device') || message.includes('not found')) return copy('no-camera');
  if (message.includes('in use') || message.includes('busy')) return copy('camera-in-use');

  return copy('unknown');
}

function isDomException(err: unknown): err is DOMException {
  return typeof DOMException !== 'undefined' && err instanceof DOMException;
}

/**
 * Opens the user-facing camera. Requests 720p but falls back to whatever the
 * device offers, since an over-constrained request fails outright on some
 * laptops and integrated webcams.
 */
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new AirDrawError(
      'insecure-context',
      ERROR_COPY['insecure-context'].message,
      ERROR_COPY['insecure-context'].hint,
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new AirDrawError(
      'no-camera',
      ERROR_COPY['no-camera'].message,
      '当前浏览器不支持 getUserMedia，请使用较新版本的 Chrome / Edge。',
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia(IDEAL_CONSTRAINTS);
  } catch (err) {
    if (isDomException(err) && err.name === 'OverconstrainedError') {
      try {
        return await navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
      } catch (retryErr) {
        throw classifyCameraError(retryErr);
      }
    }
    throw classifyCameraError(err);
  }
}

/** Resolves once the video element can actually report frame dimensions. */
export function waitForVideoReady(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  // Required on Safari; harmless elsewhere.
  const playPromise = video.play();
  if (playPromise) playPromise.catch(() => undefined);

  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new AirDrawError(
          'camera-in-use',
          ERROR_COPY['camera-in-use'].message,
          '摄像头已授权但迟迟没有画面，可能被其他程序占用。',
        ),
      );
    }, 8000);

    const onLoaded = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const onEnded = () => {
      cleanup();
      reject(
        new AirDrawError(
          'camera-in-use',
          ERROR_COPY['camera-in-use'].message,
          '摄像头画面中断，可能设备被拔出或被其他程序接管。',
        ),
      );
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onEnded);
      video.removeEventListener('ended', onEnded);
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onEnded);
    video.addEventListener('ended', onEnded);
  });
}

export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
