import { useInteractive } from '../interaction/useInteractive';
import { motion, useTransform } from 'motion/react';
import type { EngineError, EngineErrorCode } from '../types/hand';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';
import styles from './TrackingProblem.module.css';

/** What the user can actually do next, in their words, per failure. */
const GUIDANCE: Record<EngineErrorCode, { title: TextKey; steps: TextKey[]; retry: boolean }> = {
  'permission-denied': {
    title: 'error.cameraDenied',
    steps: ['problem.denied1', 'problem.denied2', 'problem.denied3'],
    retry: true,
  },
  'no-camera': {
    title: 'problem.titleNoCam',
    steps: ['problem.noCam1', 'problem.noCam2'],
    retry: true,
  },
  'camera-in-use': {
    title: 'error.cameraInUse',
    steps: ['problem.inUse1'],
    retry: true,
  },
  'constraints-unsupported': {
    title: 'problem.titleMode',
    steps: ['problem.mode1'],
    retry: true,
  },
  'insecure-context': {
    title: 'error.insecure',
    steps: ['problem.insecure1', 'problem.insecure2', 'problem.insecure3', 'problem.insecure4', 'problem.insecure5'],
    retry: false,
  },
  'model-load-failed': {
    title: 'error.modelFailed',
    steps: ['problem.model1', 'problem.model2'],
    retry: true,
  },
  'no-webgl': {
    title: 'problem.titleWebgl',
    steps: ['problem.webgl1', 'problem.webgl2'],
    retry: false,
  },
  'no-camera-api': {
    title: 'problem.titleNoApi',
    steps: ['problem.noApi1', 'problem.noApi2'],
    retry: false,
  },
  unknown: {
    title: 'problem.titleStart',
    steps: ['problem.start1'],
    retry: true,
  },
};

export function TrackingProblem({
  error,
  onRetry,
  simulated,
}: {
  error: EngineError;
  onRetry: () => void;
  simulated: boolean;
}) {
  const text = useText();
  const guidance = GUIDANCE[error.code] ?? GUIDANCE.unknown;
  const { ref, scale, glow } = useInteractive({ id: 'problem-retry', magnet: 10, onActivate: onRetry });
  const halo = useTransform(glow, (g) => 0.12 + g * 0.5);

  return (
    <div className={styles.screen} data-testid="tracking-problem" data-simulated={simulated ? 'true' : 'false'}>
      <div className={styles.scrim} aria-hidden="true" />
      <section className={`${styles.card} ad-glass`} role="alertdialog" aria-live="assertive">
        <p className="ad-eyebrow">{text('problem.eyebrow')}</p>
        <h1 className={styles.title}>{text(guidance.title)}</h1>
        <p className={styles.detail}>{error.message}</p>
        <ol className={styles.steps}>
          {guidance.steps.map((key, index) => (
          <li key={key} className={styles.step}>
            <span className={styles.index}>{index + 1}</span>
            <span>{text(key, { port: window.location.port || '5173' })}</span>
            </li>
          ))}
        </ol>
        {guidance.retry && (
          <motion.button
            ref={ref as React.RefObject<HTMLButtonElement>}
            type="button"
            className={`${styles.retry} ad-press`}
            style={{ scale }}
            onClick={onRetry}
          >
            <motion.span className={styles.halo} style={{ opacity: halo }} aria-hidden="true" />
            {text('common.retry')}
          </motion.button>
        )}
        <p className={styles.privacy}>{text('problem.privacy')}</p>
      </section>
    </div>
  );
}
