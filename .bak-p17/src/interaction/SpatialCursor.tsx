import { useEffect, useRef } from 'react';
import { interactionManager } from '../interaction/GestureInteractionManager';
import styles from './SpatialCursor.module.css';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** The ring only starts closing once the evidence is past "clearly apart". */
const RING_FROM = 0.34;
const RIPPLE_MS = 140;

/**
 * The spatial pointer: a soft orb, not an arrow. Position follows the manager's magnetically
 * snapped cursor at frame rate; the snap ring closes continuously with the pinch score so a hand
 * that is *about* to touch reads as about to touch, and a confirmed contact collapses the ring
 * into the core with one short ripple. All imperative — the cursor moves at tracking rate and
 * must never re-render React.
 */
export function SpatialCursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = { x: -100, y: -100 };
    let target = { x: -100, y: -100 };
    let raf = 0;
    let visible = false;
    let ringScale = 1;
    let rippleAt = -1;
    let calm = false;
    try {
      calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { /* No media query support: animate anyway. */ }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      current.x += (target.x - current.x) * 0.55;
      current.y += (target.y - current.y) * 0.55;
      const el = rootRef.current;
      if (el) el.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
      const ripple = rippleRef.current;
      if (ripple && rippleAt >= 0) {
        const p = (now - rippleAt) / RIPPLE_MS;
        if (p >= 1) {
          rippleAt = -1;
          ripple.style.opacity = '0';
        } else {
          ripple.style.opacity = (0.5 * (1 - p)).toFixed(3);
          ripple.style.transform = `scale(${(0.72 + 0.85 * p).toFixed(3)})`;
        }
      }
    };
    raf = requestAnimationFrame(loop);

    const unsubscribe = interactionManager.subscribe((snapshot) => {
      target = { x: snapshot.snapped.x, y: snapshot.snapped.y };
      const el = rootRef.current;
      const ring = ringRef.current;
      const core = coreRef.current;
      if (!el || !ring || !core) return;

      const shouldShow = snapshot.state !== 'lost' && snapshot.snapped.x >= 0;
      if (shouldShow !== visible) {
        visible = shouldShow;
        el.dataset.visible = shouldShow ? 'true' : 'false';
      }
      const previous = el.dataset.contact;
      el.dataset.state = snapshot.state;
      el.dataset.contact = snapshot.contactState;
      if (previous !== 'HOLD' && snapshot.contactState === 'HOLD' && !calm) rippleAt = performance.now();

      // The ring opens wide only over a target that would actually act on release, then closes
      // with the pinch score; hovering an inert cluster zone keeps the cursor calm.
      const base = snapshot.contactState === 'HOLD' ? 0.56 : snapshot.state === 'press' ? 0.82 : snapshot.hoverActionable ? 1.25 : 1;
      const closing = 1 - 0.3 * clamp01((snapshot.contactScore - RING_FROM) / (1 - RING_FROM));
      const next = snapshot.contactState === 'HOLD' ? base : base * closing;
      if (Math.abs(next - ringScale) > 0.004) {
        ringScale = next;
        ring.style.transform = `scale(${next.toFixed(3)})`;
      }
      ring.style.opacity = snapshot.contactState === 'HOLD' ? '0.95' : snapshot.hoverId ? '0.9' : snapshot.contactScore > RING_FROM ? '0.65' : '0.45';
      // OPEN keeps the orb deliberately small so a resting hand is quiet; it grows as the pinch
      // lands, which is the "collapsing into a solid dot" the ring cannot show on its own.
      const swell = snapshot.contactState === 'OPEN' ? 0.62 : snapshot.contactState === 'NEAR' ? 0.8 : snapshot.contactState === 'CONTACT' ? 1.15 : 1;
      const press = snapshot.state === 'press' ? 0.72 : snapshot.state === 'drag' ? 0.86 : 1;
      core.style.transform = `scale(${(swell * press).toFixed(3)})`;
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.cursor} ref={rootRef} data-visible="false" data-state="idle" data-contact="OPEN" data-testid="cursor">
      <span className={styles.ring} ref={ringRef} aria-hidden="true" />
      <span className={styles.ripple} ref={rippleRef} aria-hidden="true" />
      <span className={styles.core} ref={coreRef} aria-hidden="true" />
    </div>
  );
}
