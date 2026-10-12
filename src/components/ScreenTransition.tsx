import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { motionTokens } from '../design/motion';

type ScreenTransitionProps = {
  children: ReactNode;
  /** Which screen this is, so the arrival can be told apart in a recording. */
  name: string;
};

/**
 * The handover between one full-screen surface and the next.
 *
 * Entering content lifts into place while a single accent line draws across the top
 * edge — the app's own metaphor, a stroke being laid down — and leaving content lifts
 * away faster than it arrived. Nothing here queues: the two directions overlap, so a
 * switch never shows an empty frame. The wrapper stops taking hits the moment it
 * starts leaving, because a surface on its way out must not eat the click meant for
 * the screen behind it.
 */
export function ScreenTransition({ children, name }: ScreenTransitionProps) {
  return (
    <motion.div
      className="ad-screen"
      data-screen={name}
      initial={{ opacity: 0, y: 18, scale: 0.988 }}
      animate={{ opacity: 1, y: 0, scale: 1, pointerEvents: 'auto' }}
      exit={{ opacity: 0, y: -12, scale: 0.994, pointerEvents: 'none' }}
      // The sweep and the fade carry the page-tier duration; the geometry settles in
      // the panel tier, because a sheet that is still sliding is a sheet whose hit
      // areas do not match where it appears to be.
      transition={{
        opacity: { duration: motionTokens.page.duration, ease: motionTokens.page.ease },
        y: { duration: motionTokens.panel.duration, ease: motionTokens.panel.ease },
        scale: { duration: motionTokens.panel.duration, ease: motionTokens.panel.ease },
        pointerEvents: { duration: 0 },
      }}
      style={{ transformOrigin: '50% 40%' }}
    >
      {children}
    </motion.div>
  );
}
