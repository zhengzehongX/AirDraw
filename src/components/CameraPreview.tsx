import {useInteractive} from '../interaction/useInteractive';
import {handStatusCopy} from './handStatusCopy';
import {motion} from 'motion/react';
import { useEffect, useRef } from 'react';
import { HAND_CONNECTIONS, palmCenter, toPixelPoints } from '../utils/gesture/landmarks';
import { LANDMARK, type HandTrackingResult, type Handedness, type TrackingLifecycle } from '../types/hand';
import { GESTURE_LABEL } from '../utils/status';
import type { GestureName } from '../types/drawing';
import styles from './CameraPreview.module.css';

const PREVIEW_WIDTH = 244;
const PREVIEW_HEIGHT = 137;

export type CameraPreviewProps = {
  stream: MediaStream | null;
  visible: boolean;
  simulated: boolean;
  lifecycle: TrackingLifecycle;
  showSkeleton: boolean;
  primaryHandedness: Handedness | null;
  gesture: GestureName;
  subscribe: (listener: (result: HandTrackingResult) => void) => () => void;
  onHide: () => void;
  inputHint?:string;
  onDiagnostic?:()=>void;
};

/**
 * Small corner preview used for debugging: the raw video plus, for every
 * tracked hand, the 21 landmarks, bones, the thumb↔index pinch line and the
 * current gesture label. The primary (drawing) hand is highlighted.
 * Only the video is CSS-mirrored. Skeleton coordinates are mirrored before
 * drawing; labels remain readable. This is only a view of the shared stream.
 * The tracker owns its own
 * source element, so hiding or unmounting this panel cannot stop recognition.
 */
export function CameraPreview({
  stream,
  visible,
  simulated,
  lifecycle,
  showSkeleton,
  primaryHandedness,
  gesture,
  subscribe,
  onHide,
  inputHint,
  onDiagnostic,
}: CameraPreviewProps) {
  const zone=useInteractive({id:'camera-preview-zone'});
  const close=useInteractive({id:'camera-preview-close',onActivate:onHide});
  const diagnostic=useInteractive({id:'camera-input-diagnostic',onActivate:onDiagnostic});
  const videoElRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showSkeletonRef = useRef(showSkeleton);
  showSkeletonRef.current = showSkeleton;
  const metaRef = useRef({ primaryHandedness, gesture });
  metaRef.current = { primaryHandedness, gesture };

  useEffect(() => {
    const element = videoElRef.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(PREVIEW_WIDTH * dpr);
    canvas.height = Math.round(PREVIEW_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return subscribe((result) => drawOverlay(ctx, result, metaRef.current, showSkeletonRef.current));
  }, [subscribe]);

  const waiting = lifecycle === 'starting-camera' || lifecycle === 'loading-model';

  return (
    <section
      ref={zone.ref as React.RefObject<HTMLElement>}
      className={`${styles.panel} ad-glass`}
      data-visible={visible ? 'true' : 'false'}
      data-testid="camera-preview"
    >
      <header className={styles.header}>
        <span className={styles.title}>摄像头预览</span>
        <span className={styles.badge}>{simulated ? 'SIM' : lifecycle === 'running' ? 'LIVE' : '…'}</span>
        <motion.button ref={close.ref as React.RefObject<HTMLButtonElement>} style={{scale:close.scale}} type="button" className={`${styles.close} ad-press`} onClick={onHide} aria-label="隐藏摄像头预览">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.button>
      </header>

      <div className={styles.stage}>
        <video ref={videoElRef} className={styles.video} playsInline muted autoPlay />
        <canvas ref={canvasRef} className={styles.overlay} />
        {simulated && <p className={styles.notice}>模拟手部信号，未打开摄像头</p>}
        {!simulated && waiting && <p className={styles.notice}>正在准备摄像头…</p>}
      </div>
      {inputHint&&<p className={styles.inputHint} aria-live="polite">{handStatusCopy(inputHint)}</p>}
      {onDiagnostic&&<button type="button" ref={diagnostic.ref as React.RefObject<HTMLButtonElement>} className={`${styles.diagnostic} ad-press`} onClick={onDiagnostic}>{handStatusCopy('导出输入诊断')}</button>}
    </section>
  );
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  result: HandTrackingResult,
  meta: { primaryHandedness: Handedness | null; gesture: GestureName },
  showSkeleton: boolean,
): void {
  ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

  if (result.hands.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('未检测到手部', PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);
    ctx.textAlign = 'left';
    return;
  }

  for (const hand of showSkeleton ? result.hands : []) {
    const isPrimary = hand.handedness === meta.primaryHandedness;
    const points = toPixelPoints(hand.landmarks, result.videoWidth, result.videoHeight);
    const scale = Math.max(PREVIEW_WIDTH / result.videoWidth, PREVIEW_HEIGHT / result.videoHeight);
    const offsetX = (result.videoWidth * scale - PREVIEW_WIDTH) / 2;
    const offsetY = (result.videoHeight * scale - PREVIEW_HEIGHT) / 2;
    const project = (p:{x:number;y:number}) => ({x:PREVIEW_WIDTH-(p.x*scale-offsetX),y:p.y*scale-offsetY});
    const scaled = points.map(project);

    ctx.lineWidth = isPrimary ? 1.5 : 1;
    ctx.strokeStyle = isPrimary ? 'rgba(167, 232, 255, 0.6)' : 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    for (const [start, end] of HAND_CONNECTIONS) {
      const a = scaled[start];
      const b = scaled[end];
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    for (const point of scaled) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, isPrimary ? 1.7 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = isPrimary ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
      ctx.fill();
    }

    if (isPrimary) {
      const palm = palmCenter(points);
      const center=project(palm);
      drawMarker(ctx, center.x, center.y, 3, 'rgba(251,191,36,0.9)');
      // Pinch line: the distance the gesture engine normalises by palm length.
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scaled[LANDMARK.THUMB_TIP].x, scaled[LANDMARK.THUMB_TIP].y);
      ctx.lineTo(scaled[LANDMARK.INDEX_TIP].x, scaled[LANDMARK.INDEX_TIP].y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawMarker(ctx, scaled[LANDMARK.THUMB_TIP].x, scaled[LANDMARK.THUMB_TIP].y, 3.6, '#f472b6');
      drawMarker(ctx, scaled[LANDMARK.INDEX_TIP].x, scaled[LANDMARK.INDEX_TIP].y, 4.4, '#22d3ee');
    }
  }

  const primary = result.hands.find((hand) => hand.handedness === meta.primaryHandedness) ?? result.hands[0];
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';
  ctx.fillText(
    `${GESTURE_LABEL[meta.gesture]} · ${primary.handedness === 'Left' ? '左' : '右'}手`,
    8,
    PREVIEW_HEIGHT - 8,
  );
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
}
