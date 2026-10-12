import {motionTokens} from '../design/motion';
import { motion } from 'motion/react';
import { useInteractive } from '../interaction/useInteractive';
import type { ThemeMode } from '../theme/themeController';
import styles from './ThemeToggle.module.css';

export type ThemeToggleProps = {
  mode: ThemeMode;
  onToggle: () => void;
};

/**
 * Day/night entry point. The sun/moon morph is a single restrained motion:
 * the disc rotates and shrinks into a crescent while the theme controller
 * interpolates every colour in the app (see ThemeController).
 */
export function ThemeToggle({ mode, onToggle }: ThemeToggleProps) {
  const { ref, scale, glow } = useInteractive({ id: 'theme-toggle', onActivate: onToggle, magnet: 10 });

  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.toggle} ad-glass ad-press`}
      style={{ scale }}
      data-mode={mode}
      onClick={onToggle}
      aria-label={mode === 'night' ? '切换到白天模式' : '切换到夜间模式'}
      data-testid="theme-toggle"
    >
      <motion.span className={styles.glow} style={{ opacity: glow }} aria-hidden="true" />
      <span className={styles.disc} aria-hidden="true">
        <motion.span
          className={styles.mask}
          animate={{ x: mode === 'night' ? -3.5 : 9, y: mode === 'night' ? -2 : 9 }}
          transition={motionTokens.spring}
        />
        <motion.span
          className={styles.rays}
          animate={{ rotate: mode === 'night' ? 90 : 0, scale: mode === 'night' ? 0.4 : 1, opacity: mode === 'night' ? 0 : 1 }}
          transition={motionTokens.spring}
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <span key={deg} className={styles.ray} style={{ transform: `rotate(${deg}deg) translateY(-8.5px)` }} />
          ))}
        </motion.span>
      </span>
    </motion.button>
  );
}
