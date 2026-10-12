import { Logo } from './Logo';
import type { TrackingLifecycle } from '../types/hand';
import styles from './PermissionCard.module.css';
import type {CameraState} from '../services/handTracking/CameraService';
import {motion} from 'motion/react';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';

/** Keys, not sentences: the list is module scope, the copy is render scope. */
const LINE_KEYS: TextKey[] = ['permission.linePrivacy', 'permission.lineLandmarks', 'permission.lineDistance'];

/**
 * Shown while the browser's own permission prompt is on screen. AirDraw never
 * fakes a permission dialog — this is the explanation the user needs before the
 * browser asks, plus honest progress text and a way back: declining the camera
 * must return them to the hub, not trap them on a retry loop.
 */
export function PermissionCard({ lifecycle,cameraState,onDecline }: { lifecycle: TrackingLifecycle;cameraState?:CameraState;onDecline?:() => void }) {
  const text = useText();
  const stage =
    cameraState==='WARMING_UP'?text('permission.warming'):cameraState==='RECOVERING'?text('permission.recovering'):lifecycle === 'loading-model'
      ? text('permission.loadingModel')
      : lifecycle === 'running'
        ? text('permission.ready')
        : text('permission.ask');

  return (
    <motion.div className={styles.screen} data-testid="permission-card" initial={{opacity:0,scale:.98}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.96,filter:'blur(6px)'}} transition={{duration:.4}}>
      <section className={`${styles.card} ad-glass`}>
        <Logo size={40} />
        <h1 className={styles.title}>{text('permission.title')}</h1>
        <ul className={styles.lines}>
          {LINE_KEYS.map((key) => (
            <li key={key} className={styles.line}>
              {text(key)}
            </li>
          ))}
        </ul>
        <p className={styles.stage} data-busy={lifecycle !== 'running' ? 'true' : 'false'}>
          <span className={styles.spinner} aria-hidden="true" />
          {stage}
        </p>
        {onDecline && (
          <button type="button" className={`${styles.decline} ad-press`} onClick={onDecline} data-testid="permission-decline">
            {text('permission.decline')}
          </button>
        )}
      </section>
    </motion.div>
  );
}
