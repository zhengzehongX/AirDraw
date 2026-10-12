import {useInteractive} from '../interaction/useInteractive';
import {motion} from 'motion/react';
import { loadContactProfile, type ContactMetrics } from '../utils/gesture/PinchContactDetector';
const {contact:PINCH_START_RATIO,release:PINCH_RELEASE_RATIO}=loadContactProfile();
import type { EngineMetrics, ViewMode } from '../types/drawing';
import { GESTURE_LABEL } from '../utils/status';
import styles from './DebugPanel.module.css';

export type DebugPanelProps = {
  metrics: EngineMetrics;
  mirror: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleMirror: () => void;
  onClose: () => void;
  contact?: ContactMetrics;
  /** Which recognition backend is really running, and why it differs from the request. */
  camera?: { state: string; delegate: string; notice: string | null };
  /** PlayLab's own state machine, so a stuck toy is readable instead of guessed at. */
  lab?: { phase: string; status: string; detail: string | null; swipeState: string; index: number; error: string | null };
};

const BAR_MAX = 1.4;

function Row({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'ok' | 'warn' }) {
  return (
    <div className={styles.row}>
      <span className={styles.key}>{label}</span>
      <span className={styles.value} data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

const fmt = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);

const pt = (p: { x: number; y: number; z?: number } | null): string =>
  p ? `${p.x.toFixed(2)}, ${p.y.toFixed(2)}` : '—';

/** Developer Mode panel: everything needed to tune the pipeline live. */
export function DebugPanel({ metrics, mirror, viewMode, onViewModeChange, onToggleMirror, onClose, contact, camera, lab }: DebugPanelProps) {
  const zone=useInteractive({id:'debug-zone'});
  const close=useInteractive({id:'debug-close',onActivate:onClose});
  const view=useInteractive({id:'debug-view',onActivate:()=>onViewModeChange(viewMode==='3d'?'2d':'3d')});
  const mirrorControl=useInteractive({id:'debug-mirror',onActivate:onToggleMirror});
  const ratio = metrics.pinchRatio;
  const markerLeft = ratio === null ? 0 : Math.min(Math.max(ratio / BAR_MAX, 0), 1) * 100;

  return (
    <section ref={zone.ref as React.RefObject<HTMLElement>} className={`${styles.panel} ad-glass`} data-testid="debug-panel">
      <header className={styles.header}>
        <span className={styles.title}>Developer Mode</span>
        <motion.button ref={close.ref as React.RefObject<HTMLButtonElement>} style={{scale:close.scale}} type="button" className={styles.close} onClick={onClose} aria-label="关闭开发者面板">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.button>
      </header>

      <div className={styles.group}>
        {contact && <>
          <Row label="pinchState" value={contact.pinchState??contact.state}/>
          <Row label="tipDistance2D" value={fmt(contact.tipDistance2D,4)}/>
          <Row label="worldDistance (m)" value={fmt(contact.worldDistance,4)}/>
          <Row label="normalized enter / release" value={`${fmt(contact.enterThreshold,3)} / ${fmt(contact.releaseThreshold,3)}`}/>
          <Row label="release frames" value={String(contact.releaseFrames??0)}/>
          <Row label="contact state" value={contact.state} tone={contact.state === 'HOLD' ? 'accent' : contact.depthVeto ? 'warn' : undefined} />
          <Row label="contactScore" value={`${fmt(contact.contactScore, 3)}`} tone={contact.contactScore >= contact.enterScore ? 'accent' : undefined} />
          <Row label="enter / release" value={`${contact.enterScore} / ${contact.exitScore}`} />
          <Row label="2D 距离 · 得分 × 权重" value={`${fmt(contact.d2Normalized, 3)} · ${fmt(contact.score2D, 2)} ×${fmt(contact.weight2D, 2)}`} />
          <Row label="3D 距离 · 得分 × 权重" value={`${fmt(contact.d3Normalized, 3)} · ${fmt(contact.score3D, 2)} ×${fmt(contact.weight3D, 2)}`} />
          <Row label="zGap / depth trust" value={`${fmt(contact.zGap, 3)} / ${fmt(contact.depthTrust, 2)}`} tone={contact.depthVeto ? 'warn' : undefined} />
          <Row label="depth veto" value={contact.depthVeto ? 'stacked / apart in world' : 'no'} tone={contact.depthVeto ? 'warn' : undefined} />
          <Row label="radius / stable frames" value={`${fmt(contact.radius, 3)} / ${contact.stableFrames}`} />
        </>}
        <Row label="camera fps" value={fmt(metrics.detectFps, 0)} />
        {camera && (
          <>
            <Row label="camera / delegate" value={`${camera.state} · ${camera.delegate}`} tone={camera.state === 'ERROR' ? 'warn' : undefined} />
            {camera.notice && <Row label="delegate notice" value={camera.notice} tone="warn" />}
          </>
        )}
        {lab && (
          <>
            <Row label="playlab" value={`${lab.phase} / ${lab.status} #${lab.index}`} tone={lab.error ? 'warn' : lab.status === 'ready' ? 'ok' : undefined} />
            {lab.detail && <Row label="why" value={lab.detail} tone={lab.error ? 'warn' : undefined} />}
            <Row label="swipe" value={lab.swipeState} />
          </>
        )}
        <Row label="render fps" value={fmt(metrics.renderFps, 0)} tone={metrics.renderFps < 30 ? 'warn' : 'ok'} />
        <Row label="scene fps" value={fmt(metrics.sceneFps, 0)} tone={metrics.sceneFps > 0 && metrics.sceneFps < 30 ? 'warn' : undefined} />
        <Row label="inference" value={`${fmt(metrics.inferenceMs)} ms`} tone={metrics.inferenceMs > 30 ? 'warn' : undefined} />
        <Row label="gesture latency" value={`${fmt(metrics.gestureLatencyMs)} ms`} tone={metrics.gestureLatencyMs > 60 ? 'warn' : undefined} />
        <Row label="draw calls" value={`${metrics.drawCalls}`} />
        <Row label="geometries" value={`${metrics.geometries}`} />
        <Row label="quality" value={metrics.qualityTier} tone={metrics.qualityTier === 'low' ? 'warn' : undefined} />
        <Row label="delegate" value={metrics.delegate} />
      </div>

      <div className={styles.group}>
        <div className={styles.barHeader}>
          <span className={styles.key}>pinch ratio</span>
          <span className={styles.value} data-tone={metrics.drawing ? 'accent' : undefined}>
            {fmt(ratio, 3)}
          </span>
        </div>
        <div className={styles.bar}>
          <span className={styles.zoneStart} style={{ left: `${((contact?.radius || PINCH_START_RATIO) / BAR_MAX) * 100}%` }} />
          <span className={styles.zoneEnd} style={{ left: `${(PINCH_RELEASE_RATIO / BAR_MAX) * 100}%` }} />
          <span className={styles.marker} style={{ left: `${markerLeft}%` }} data-on={metrics.drawing} />
        </div>
        <div className={styles.barLegend}>
          <span>落笔半径 &lt; {fmt(contact?.radius ?? PINCH_START_RATIO, 2)}</span>
          <span>抬笔 &gt; {PINCH_RELEASE_RATIO}</span>
        </div>
      </div>

      <div className={styles.group}>
        <Row label="gesture" value={`${GESTURE_LABEL[metrics.gesture]} (${fmt(metrics.gestureConfidence, 1)})`} tone={metrics.gesture === 'PINCH' ? 'accent' : undefined} />
        <Row label="gesture held" value={`${fmt(metrics.gestureDurationMs, 0)} ms`} />
        <Row label="hands" value={`${metrics.handCount}${metrics.primaryHandedness ? ` · ${metrics.primaryHandedness}` : ''}`} />
        <Row label="hands distance" value={`${fmt(metrics.handsDistancePx, 0)} px`} />
        <Row label="confidence" value={fmt(metrics.confidence, 2)} tone={metrics.confidence > 0 && metrics.confidence < 0.6 ? 'warn' : undefined} />
        <Row label="index (smoothed)" value={pt(metrics.index)} tone="accent" />
        <Row label="index (raw)" value={pt(metrics.indexRaw)} />
        <Row label="thumb" value={pt(metrics.thumb)} />
        <Row label="pinch distance" value={`${fmt(metrics.pinchDistancePx, 1)} px`} />
        <Row label="palm scale" value={`${fmt(metrics.palmScalePx, 1)} px`} />
        <Row label="depth z" value={fmt(metrics.index?.z ?? 0, 3)} />
        <Row label="drawing" value={metrics.drawing ? 'true' : 'false'} tone={metrics.drawing ? 'accent' : undefined} />
        <Row label="pointer state" value={metrics.pointerState} />
        <Row label="lost for" value={`${fmt(metrics.lostForMs, 0)} ms`} tone={metrics.lostForMs > 0 ? 'warn' : undefined} />
        <Row label="outliers" value={`${metrics.outliersRejected}`} tone={metrics.outliersRejected > 40 ? 'warn' : undefined} />
      </div>

      <div className={styles.group}>
        <Row label="strokes" value={`${metrics.strokeCount}`} />
        <Row label="traj points" value={`${metrics.trajectoryPoints}`} />
        <Row label="video" value={`${metrics.videoWidth}×${metrics.videoHeight}`} />
        <Row label="canvas" value={`${fmt(metrics.canvasWidth, 0)}×${fmt(metrics.canvasHeight, 0)}`} />
        <Row label="mapper scale" value={fmt(metrics.mapperScale, 4)} />
      </div>

      <div className={styles.buttons}>
        <motion.button ref={view.ref as React.RefObject<HTMLButtonElement>} style={{scale:view.scale}} type="button" className={styles.toggle} onClick={() => onViewModeChange(viewMode === '3d' ? '2d' : '3d')}>
          画布：{viewMode === '3d' ? '3D' : '2D'}
        </motion.button>
        <motion.button ref={mirrorControl.ref as React.RefObject<HTMLButtonElement>} style={{scale:mirrorControl.scale}} type="button" className={styles.toggle} onClick={onToggleMirror}>
          镜像：{mirror ? '开' : '关'}
        </motion.button>
      </div>
    </section>
  );
}
