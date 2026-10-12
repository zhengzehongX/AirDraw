import { useEffect, useRef, useState } from 'react';
import { interactionManager } from '../interaction/GestureInteractionManager';
import type { DrawEngine } from '../engine/DrawEngine';
import type { EngineMetrics } from '../types/drawing';
import type { TutorialSignal } from './steps';

type Input = {
  engine: DrawEngine;
  metrics: EngineMetrics;
  step: number;
  dockOpen: boolean;
  inspect: boolean;
  strokeCount: number;
  color: string;
  width: number;
  theme: string;
};

/** The coach only ever compares against thresholds, so 4px is finer than it needs. */
const MOVE_QUANTUM_PX = 4;
/**
 * Publishing on every metrics tick nested React updates fifty deep and tripped its
 * maximum-update-depth guard — and once React starts dropping updates on the floor,
 * hold and drag gestures lose their clock. The coach reads thresholds, not a live
 * trace, so a 150ms cadence loses nothing it uses.
 */
const SIGNAL_INTERVAL_MS = 150;

const sameSignal = (a: TutorialSignal, b: TutorialSignal): boolean =>
  a.handPresent === b.handPresent &&
  a.cursorMovedPx === b.cursorMovedPx &&
  a.activated === b.activated &&
  a.strokesCommitted === b.strokesCommitted &&
  a.penDown === b.penDown &&
  a.penWasDown === b.penWasDown &&
  a.dockOpen === b.dockOpen &&
  a.colorChanged === b.colorChanged &&
  a.widthChanged === b.widthChanged &&
  a.undone === b.undone &&
  a.inspect === b.inspect &&
  a.themeChanged === b.themeChanged;

const EMPTY: TutorialSignal = {
  handPresent: false,
  cursorMovedPx: 0,
  activated: null,
  strokesCommitted: 0,
  penDown: false,
  penWasDown: false,
  dockOpen: false,
  colorChanged: false,
  widthChanged: false,
  undone: false,
  inspect: false,
  themeChanged: false,
};

/**
 * Turns the running pipeline into "did the user actually do the thing".
 *
 * Cursor travel is accumulated at detection rate inside refs and only published
 * at the 5 Hz metrics rate, so the coach can watch progress without the whole
 * app re-rendering per frame. Baselines are taken when a lesson starts, which is
 * what makes each lesson's requirement absolute rather than cumulative.
 */
export function useTutorialSignal(input: Input): TutorialSignal {
  const { engine, metrics, step } = input;
  const live = useRef({ x: -1, y: -1, moved: 0, penDown: false, penWasDown: false, handPresent: false });
  const base = useRef({ strokes: 0, color: '', width: 0, theme: '', undoneAt: 0 });
  const [signal, setSignal] = useState<TutorialSignal>(EMPTY);

  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(
    () =>
      engine.onCursor((cursor) => {
        const present = cursor.pointerState !== 'lost' && cursor.pointerState !== 'searching';
        if (live.current.x >= 0 && present) {
          live.current.moved += Math.hypot(cursor.x - live.current.x, cursor.y - live.current.y);
        }
        live.current.x = cursor.x;
        live.current.y = cursor.y;
        live.current.penDown = cursor.drawing;
        if (cursor.drawing) live.current.penWasDown = true;
        live.current.handPresent = present;
      }),
    [engine],
  );

  // A new lesson re-baselines everything it measures from here on.
  useEffect(() => {
    const { strokeCount, color, width, theme } = inputRef.current;
    base.current = { strokes: strokeCount, color, width, theme, undoneAt: strokeCount };
    live.current.moved = 0;
    live.current.penWasDown = false;
    live.current.x = -1;
    live.current.y = -1;
  }, [step]);

  const publishedAt = useRef(0);
  const lastPublished = useRef<TutorialSignal>(EMPTY);

  useEffect(() => {
    const now = performance.now();
    const i = inputRef.current;
    const decreased = i.strokeCount < base.current.undoneAt;
    if (decreased) base.current.undoneAt = i.strokeCount;
    const next: TutorialSignal = {
      handPresent: live.current.handPresent && metrics.handCount > 0,
      cursorMovedPx: Math.round(live.current.moved / MOVE_QUANTUM_PX) * MOVE_QUANTUM_PX,
      activated: interactionManager.lastActivatedId,
      strokesCommitted: Math.max(0, i.strokeCount - base.current.strokes),
      penDown: live.current.penDown,
      penWasDown: live.current.penWasDown,
      dockOpen: i.dockOpen,
      colorChanged: i.color !== base.current.color,
      widthChanged: i.width !== base.current.width,
      undone: decreased,
      inspect: i.inspect,
      themeChanged: i.theme !== base.current.theme,
    };
    /**
     * The cadence gate exists for cursor churn, not for facts. Summoning the Dock is a
     * ~1.4 s event (it auto-hides once the hand leaves) and a pinch that lifts the pen
     * lasts a frame or two; a starved renderer can publish nothing inside either window,
     * and the lesson then waits for an action the user already did. So only a signal that
     * differs in nothing but travel may wait for the next tick.
     */
    const churnOnly = sameSignal({ ...lastPublished.current, cursorMovedPx: next.cursorMovedPx }, next);
    if (churnOnly && now - publishedAt.current < SIGNAL_INTERVAL_MS) return;
    publishedAt.current = now;
    lastPublished.current = next;
    // An unchanged signal must not mint a new object: a fresh identity re-renders the
    // whole app for nothing, which is the update pressure this hook exists to avoid.
    setSignal((previous) => (sameSignal(previous, next) ? previous : next));
  }, [metrics, step, input.dockOpen, input.inspect, input.strokeCount, input.color, input.width, input.theme]);

  return signal;
}
