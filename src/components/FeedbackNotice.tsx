import {motionTokens} from '../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { subscribeNotice, type FeedbackNotice as Notice } from '../app/feedback';
import styles from './FeedbackNotice.module.css';

/**
 * The whole product has one notice at a time. Actions call `notify(...)`; this
 * component is the only place it becomes visible, so messages replace each other
 * instead of stacking into a toast pile.
 */
export function FeedbackNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => subscribeNotice(setNotice), []);

  return (
    <div className={styles.host} aria-live="polite">
      <AnimatePresence mode="wait">
        {notice && (
          <motion.div
            key={notice.id}
            className={`${styles.pill} ad-glass`}
            data-tone={notice.tone}
            data-testid="feedback"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={motionTokens.hover}
          >
            <span className={styles.dot} aria-hidden="true" />
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
