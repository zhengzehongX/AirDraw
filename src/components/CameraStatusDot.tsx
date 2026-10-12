import { motion } from 'motion/react';
import { useInteractive } from '../interaction/useInteractive';
import type { EngineMetrics } from '../types/drawing';
import type { TrackingLifecycle } from '../types/hand';
import type {CameraState} from '../services/handTracking/CameraService';
import styles from './CameraStatusDot.module.css';

export type CameraStatusDotProps = {
  metrics: EngineMetrics;
  lifecycle: TrackingLifecycle;
  cameraState?:CameraState;
  simulated: boolean;
  onExpand: () => void;
};

const TONE: Record<string, string> = {
  running: 'ok',
  'starting-camera': 'warn',
  'loading-model': 'warn',
  error: 'danger',
  idle: 'dim',
  stopped: 'dim',
};

/**
 * The camera's permanent presence is a single status dot: green when tracking,
 * amber while starting, red on error, with a soft pulse while the hand is
 * lost. Pinching it expands the full developer preview.
 */
export function CameraStatusDot({ metrics, lifecycle, cameraState, simulated, onExpand }: CameraStatusDotProps) {
  const { ref, scale, glow } = useInteractive({ id: 'camera-dot', onActivate: onExpand, magnet: 12 });
  const lost = metrics.pointerState === 'lost';

  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.dot} ad-press`}
      style={{ scale }}
      data-tone={cameraState==='DEGRADED'?'warn':TONE[lifecycle] ?? 'dim'}
      data-lost={lost ? 'true' : 'false'}
      onClick={onExpand}
      aria-label="摄像头状态，捏合展开预览"
      title={simulated ? '模拟信号' : lifecycle}
      data-testid="camera-dot"
    >
      <motion.span className={styles.halo} style={{ opacity: glow }} aria-hidden="true" />
      <span className={styles.core} aria-hidden="true" />
    </motion.button>
  );
}
