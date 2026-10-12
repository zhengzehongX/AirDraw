import {motionTokens} from '../design/motion';
import { motion } from 'motion/react';
import { Logo } from './Logo';
import type { EngineMetrics } from '../types/drawing';
import { GESTURE_LABEL } from '../utils/status';
import { useText } from '../i18n';
import styles from './TopStatus.module.css';
import {useSyncExternalStore} from 'react';
import {cameraService} from '../services/handTracking/CameraService';
import {voiceAssistant} from '../voice/VoiceAssistantService';
import {appMode} from '../app/AppMode';

export type TopStatusProps = {
  metrics: EngineMetrics;
  flash: string | null;
  focusMode: boolean;
};

/**
 * The only permanent header: a small centred glass pill with the AirDraw mark
 * and one line of live state. Hand loss shows a light "Show your hand" hint
 * here instead of a modal, and fades out on recovery.
 */
export function TopStatus({ metrics, flash, focusMode }: TopStatusProps) {
  const text = useText();
  const camera=useSyncExternalStore(cameraService.subscribe,cameraService.getSnapshot);
  const voice=useSyncExternalStore(voiceAssistant.subscribe,voiceAssistant.getSnapshot);
  const mode=useSyncExternalStore(appMode.subscribe,appMode.getSnapshot);
  const lost = metrics.pointerState === 'lost';
  const stateLine = flash
    ? flash
    : lost
      ? 'Show your hand'
      : metrics.pointerState === 'searching'
        ? text('status.searching')
        : metrics.drawing
          ? text('status.drawing')
          : `${GESTURE_LABEL[metrics.gesture]}`;

  return (
    <motion.header
      className={`${styles.pill} ad-glass`}
      animate={{ opacity: focusMode ? 0.25 : 1, y: 0 }}
      initial={{ opacity: 0, y: -8 }}
      transition={motionTokens.hover}
      data-testid="top-status"
    >
      <Logo size={16} />
      <span className={styles.word}>AirDraw</span>
      <span className={styles.state}>{mode.target==='CANVAS_DRAW'?'Canvas':mode.target==='MODEL_CONTROL'?'Model':'Spatial'}</span>
      <span className={styles.indicator} title={`Camera · ${camera.cameraState}`} data-tone={camera.cameraState==='ERROR'?'error':camera.cameraState==='DEGRADED'?'warn':camera.cameraState==='READY'?'ready':'off'} aria-label={`Camera ${camera.cameraState}`}/>
      <span className={styles.indicator} title="Hand" data-tone={metrics.handCount?'ready':'off'} aria-label={metrics.handCount?'Hand Ready':'Hand lost'}/>
      <span className={styles.indicator} title={`Voice · ${voice.state}`} data-tone={voice.state==='ERROR'?'error':voice.state==='OFF'?'off':'ready'} aria-label={`Voice ${voice.state}`}/>
      {flash && <span className={styles.state}>{flash}</span>}
      <span className={styles.divider} aria-hidden="true" />
      <motion.span
        key={stateLine}
        className={styles.state}
        data-tone={lost ? 'warn' : metrics.drawing ? 'accent' : 'dim'}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionTokens.hover}
      >
        {lost?'Show your hand':metrics.drawing?text('status.drawing'):GESTURE_LABEL[metrics.gesture]}
      </motion.span>
    </motion.header>
  );
}
