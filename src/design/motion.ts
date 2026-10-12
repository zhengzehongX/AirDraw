/**
 * One motion vocabulary for the whole product.
 *
 * Three tiers, matching the CSS tokens: micro (a control answering the hand or the
 * pointer), panel (a surface arriving), page (one screen handing over to the next).
 * Exits run at 0.7× the enter so a dismissed surface never feels slower than the
 * thing replacing it. Everything here is interruptible by design: Motion values are
 * driven, not queued, so a second tap retargets the same animation.
 */
const easeOut = [0.16, 1, 0.3, 1] as [number, number, number, number];
const easeMicro = [0.22, 1, 0.36, 1] as [number, number, number, number];
const easeIn = [0.55, 0, 0.68, 0.19] as [number, number, number, number];

export const motionTokens = {
  hover: { duration: 0.18, ease: easeMicro },
  panel: { duration: 0.34, ease: easeOut },
  page: { duration: 0.64, ease: easeOut },
  pageExit: { duration: 0.45, ease: easeIn },
  /** A line of text arriving. Kept under 600ms so a staged sequence still reads as
   *  one gesture, and deliberately transform-only: a blur filter on every headline
   *  repaints the whole layer each frame, which is the first thing to stutter when
   *  the scene behind it is busy. */
  reveal: { duration: 0.56, ease: easeOut },
  spring: { type: 'spring' as const, stiffness: 360, damping: 30, mass: 0.8 },
  /** Stagger between siblings in an entrance sequence. */
  stagger: 0.05,
  successMs: 220,
  modeMs: 800,
};

/**
 * Entrance for one step of a staged sequence. `order` is the step's position, not a
 * delay in seconds: the stagger lives here so a caller cannot accidentally turn
 * "third in line" into "three seconds late".
 */
export const lineReveal = (order = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: motionTokens.reveal.duration, ease: easeOut, delay: order * motionTokens.stagger },
});
