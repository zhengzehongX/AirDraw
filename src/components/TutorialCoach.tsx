import {motionTokens} from '../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { HandGlyph } from './HandGlyph';
import { interactionManager } from '../interaction/GestureInteractionManager';
import { useInteractive } from '../interaction/useInteractive';
import { TUTORIAL_STEPS, type TutorialSignal } from '../tutorial/steps';
import styles from './TutorialCoach.module.css';
import { useLocale } from '../i18n';
import { TUTORIAL_COPY_EN } from '../tutorial/copy.en';

/**
 * The one thing the tutorial adds to the canvas: a ring to confirm. It is a
 * normal spatial target, so the lesson teaches the real gesture on the real
 * interaction layer instead of on a pretend button.
 */
export function TutorialTarget({ onConfirm }: { onConfirm: () => void }) {
  const { ref, scale, glow } = useInteractive({
    id: 'tut-target',
    scope: 'tutorial',
    magnet: 20,
    onActivate: onConfirm,
  });
  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={styles.target}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      data-testid="tut-target"
      aria-hidden="true"
    />
  );
}

/**
 * The coach for one tutorial lesson: what to do, shown as a hand rather than as
 * a paragraph, plus a soft ring drawn around the real control the lesson means.
 *
 * It never explains a step in advance of the user doing it — the parent only
 * advances when the live tracking signal satisfies the lesson.
 */
export function TutorialCoach({
  index,
  signal,
  reduced,
  onSkip,
}: {
  index: number;
  signal: TutorialSignal;
  reduced: boolean;
  onSkip: () => void;
}) {
  const step = TUTORIAL_STEPS[Math.min(index, TUTORIAL_STEPS.length - 1)];
  const english=useLocale()==='en';
  const copy=english?TUTORIAL_COPY_EN[step.id]??step:step;
  const ringRef = useRef<HTMLDivElement>(null);
  const {ref:skipRef,scale:skipScale}=useInteractive({id:'tutorial-skip',scope:'tutorial',onActivate:onSkip});
  const {ref:coachRef}=useInteractive({id:'tutorial-coach-zone',scope:'tutorial'});
  const targetId = step.target?.(signal) ?? null;

  // The ring tracks a live DOM rect, so it is written imperatively: reading it
  // through React state would re-render the whole coach on every frame.
  useEffect(() => {
    if (!targetId) {
      if (ringRef.current) ringRef.current.dataset.visible = 'false';
      return undefined;
    }
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const ring = ringRef.current;
      const rect = interactionManager.rectOf(targetId);
      if (!ring) return;
      if (!rect) {
        ring.dataset.visible = 'false';
        return;
      }
      ring.dataset.visible = 'true';
      const pad = 10;
      ring.style.transform = `translate(${rect.left - pad}px, ${rect.top - pad}px)`;
      ring.style.width = `${rect.right - rect.left + pad * 2}px`;
      ring.style.height = `${rect.bottom - rect.top + pad * 2}px`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [targetId]);

  return (
    <>
      <div className={styles.ring} ref={ringRef} data-visible="false" aria-hidden="true" />
      <div className={styles.position}>
      <AnimatePresence mode="wait">
        <motion.aside
          ref={coachRef as React.RefObject<HTMLElement>}
          key={step.id}
          className={`${styles.card} ad-glass`}
          data-testid="tutorial-coach"
          data-step={index}
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -10 }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          <div className={styles.glyph}>
            <HandGlyph pose={step.pose} highlight={step.highlight} size={78} />
          </div>
          <div className={styles.text}>
            <p className="ad-eyebrow">
              {english?'Tutorial':'教程'} {index + 1} / {TUTORIAL_STEPS.length}
            </p>
            <h2 className={styles.title}>{copy.title}</h2>
            <p className={styles.body}>{copy.body}</p>
          </div>
          <motion.button ref={skipRef as React.RefObject<HTMLButtonElement>} style={{scale:skipScale}} type="button" className={`${styles.skip} ad-press`} onClick={onSkip} data-testid="tutorial-skip">
            {english?'Skip':'跳过'}
          </motion.button>
        </motion.aside>
      </AnimatePresence>

      <div className={styles.progress} aria-hidden="true">
        {TUTORIAL_STEPS.map((lesson, i) => (
          <span key={lesson.id} className={styles.dot} data-done={i < index ? 'true' : 'false'} data-now={i === index ? 'true' : 'false'} />
        ))}
      </div>
      </div>
    </>
  );
}
