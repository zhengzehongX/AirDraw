import {motionTokens} from '../design/motion';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useInteractive } from '../interaction/useInteractive';
import { WELCOME } from '../config';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';

import type { LaunchStage } from '../app/appState';
import { welcomeAcceptsEntry } from '../app/appState';
import { Logo, Wordmark } from './Logo';
import styles from './LaunchScreen.module.css';

type LaunchScreenProps = {
  stage: LaunchStage;
  /** Saw the opening before, so the copy leads with continuing instead. */
  helloSeen: boolean;
  /** Camera is already authorised, so a pinch can drive the opening. */
  gestureReady: boolean;
  reduced: boolean;
  onStage: (stage: LaunchStage) => void;
  onBegin: () => void;
};

/** Stage hints are stored as keys so the copy is read at render, not at import. */
const HINT: Record<LaunchStage, TextKey | null> = {
  floating: 'launch.hintGesture',
  gathering: null,
  hello: 'launch.hintHello',
  dispersing: null,
  'home-ready': null,
};

/**
 * The opening: brand, one line, one entry, and a field of points that answers the
 * first confirmation by gathering into "Hello", holding it long enough to be read,
 * and then bursting as the next screen rises from behind.
 *
 * One click drives the whole sequence; a second click during the readable hold only
 * skips the wait. Every transitional stage consumes input and drops its own hit
 * area, so the animation can never be double-fired, clicked through, or left
 * covering the screen it is supposed to reveal.
 */
export function LaunchScreen({ stage, helloSeen, gestureReady, reduced, onStage, onBegin }: LaunchScreenProps) {
  const text = useText();
  const [entered, setEntered] = useState(false);
  const advanceRef = useRef(onStage);
  advanceRef.current = onStage;
  const beginRef = useRef(onBegin);
  beginRef.current = onBegin;
  // The callbacks live in refs because App re-renders on every metrics tick, and a
  // fresh function identity would restart each timer before it ever fired.
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  /** The entry itself: start the sequence, or skip the remaining hold. */
  const confirm = () => {
    if (reducedRef.current) {
      beginRef.current();
      advanceRef.current('dispersing');
      return;
    }
    if (stage === 'floating') advanceRef.current('gathering');
    else if (stage === 'hello') advanceRef.current('dispersing');
  };

  // Each stage schedules exactly one successor. `dispersing` is where the app is
  // entered, so the next screen is already mounting while the points fly outward.
  // Reduced motion keeps the same states — the shader snaps between them — so a
  // low-performance device still reads "Hello" before the hub arrives.
  useEffect(() => {
    if (stage === 'floating') return undefined;
    const wait = (next: LaunchStage, ms: number) => {
      const id = window.setTimeout(() => advanceRef.current(next), ms);
      return () => window.clearTimeout(id);
    };
    if (stage === 'gathering') return wait('hello', reduced ? 120 : helloSeen ? WELCOME.gatherReturningMs : WELCOME.gatherMs);
    if (stage === 'hello') return wait('dispersing', reduced ? 500 : helloSeen ? WELCOME.helloReturningMs : WELCOME.helloMs);
    if (stage === 'dispersing') {
      if (!entered) {
        setEntered(true);
        beginRef.current();
      }
      return wait('home-ready', reduced ? 200 : WELCOME.disperseMs);
    }
    return undefined;
  }, [stage, reduced, helloSeen, entered]);

  const { ref, scale, glow } = useInteractive({
    id: 'launch-begin',
    scope: 'launch',
    magnet: 16,
    onActivate: confirm,
    isDisabled: () => !welcomeAcceptsEntry(stage),
  });
  const { ref: skipRef, scale: skipScale, glow: skipGlow } = useInteractive({
    id: 'launch-skip',
    scope: 'launch',
    magnet: 10,
    onActivate: () => {
      // "直接进入" jumps to the end of the sequence without replaying it.
      beginRef.current();
      advanceRef.current('dispersing');
    },
    isDisabled: () => stage === 'dispersing' || stage === 'home-ready',
  });

  const hintKey = HINT[stage];
  const copy = hintKey ? text(hintKey) : '';
  // Once the field starts gathering, the word owns the centre: the headline and the
  // paragraph step aside instead of competing with it.
  const wordOnStage = stage === 'gathering' || stage === 'hello' || stage === 'dispersing';
  const entryVisible = stage === 'floating';
  const live = stage !== 'home-ready';

  return (
    <motion.div
      className={styles.screen}
      data-testid="launch-screen"
      data-stage={stage}
      data-live={live}
      initial={{ opacity: 0, filter: 'blur(6px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.97, filter: 'blur(6px)' }}
      transition={{ duration: reduced ? 0 : 0.7 }}
      style={{ pointerEvents: live ? undefined : 'none' }}
    >
      <main className={styles.inner}>
        <motion.div
          className={styles.brand}
          animate={{ opacity: wordOnStage ? 0 : 1, y: wordOnStage ? -6 : 0 }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          <Logo size={44} />
          <Wordmark className={styles.wordmark} />
        </motion.div>

        <motion.h1
          className={styles.tagline}
          animate={{ opacity: wordOnStage ? 0 : 1, filter: wordOnStage ? 'blur(12px)' : 'blur(0px)' }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          {text('launch.tagline')}
        </motion.h1>

        <motion.p
          className={styles.sub}
          animate={{ opacity: wordOnStage ? 0 : 1 }}
          transition={{...motionTokens.panel, duration:reduced?0:motionTokens.panel.duration}}
        >
          {helloSeen
            ? text('launch.subReturning')
            : text('launch.subFirst')}
        </motion.p>

        <motion.button
          ref={ref as React.RefObject<HTMLButtonElement>}
          type="button"
          className={`${styles.begin} ad-press`}
          style={{ scale }}
          animate={{ opacity: entryVisible ? 1 : 0 }}
          transition={reduced?{duration:0}:motionTokens.panel}
          onClick={confirm}
          disabled={!entryVisible}
          data-testid="launch-begin"
          data-stage={stage}
        >
          <motion.span className={styles.halo} style={{ opacity: glow }} aria-hidden="true" />
          <span className={styles.beginLabel}>{text('launch.begin')}</span>
        </motion.button>

        <motion.p className={styles.hint} animate={{ opacity: entryVisible || stage === 'hello' ? 0.9 : 0 }}>
          {gestureReady ? copy : stage === 'hello' ? copy : text('launch.hintNoCamera')}
        </motion.p>
      </main>

      <motion.button
        ref={skipRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${styles.skip} ad-press`}
        style={{ scale: skipScale }}
        animate={{ opacity: stage === 'floating' ? 0.85 : 0 }}
        transition={reduced ? { duration: 0 } : motionTokens.panel}
        onClick={() => {
          beginRef.current();
          advanceRef.current('dispersing');
        }}
        disabled={stage !== 'floating'}
        data-testid="launch-skip"
        aria-label={text('launch.skip')}
      >
        <motion.span className={styles.halo} style={{ opacity: skipGlow }} aria-hidden="true" />
        {text('launch.skip')}
      </motion.button>
    </motion.div>
  );
}
