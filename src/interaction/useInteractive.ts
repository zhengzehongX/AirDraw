import { useEffect, useRef } from 'react';
import { animate, useMotionValue, type MotionValue } from 'motion/react';
import { motionTokens } from '../design/motion';
import { interactionManager, type InteractiveRegion } from './GestureInteractionManager';
import type { Point } from '../types/drawing';

export type InteractiveOptions = {
  id: string;
  /** Application context that owns this target; defaults to the active one. */
  scope?: string;
  onActivate?: () => void;
  onDrag?: (point: Point, delta: Point) => void;
  onPressStart?:()=>void;
  onPressEnd?:(cancelled:boolean)=>void;
  onHoldProgress?: (progress: number) => void;
  onHoldComplete?: () => void;
  holdMs?: number;
  magnet?: number;
  dragThreshold?: number;
  isDisabled?: () => boolean;
};

export type InteractiveHandle = {
  ref: React.MutableRefObject<HTMLElement | null>;
  /** 1 idle → 1.04 hover → 0.97 press, spring-driven by consumers. */
  scale: MotionValue<number>;
  /** 0..1 hover glow / glass brighten. */
  glow: MotionValue<number>;
  /** 0..1 hold-to-confirm progress. */
  hold: MotionValue<number>;
};

/**
 * Registers a DOM node as a spatial interactive region and exposes motion
 * values so feedback (scale, glow, hold ring) updates imperatively at frame
 * rate — no React re-render per cursor tick. All gesture semantics live in
 * GestureInteractionManager; components only declare what they do.
 */
export function useInteractive(options: InteractiveOptions): InteractiveHandle {
  const ref = useRef<HTMLElement | null>(null);
  const scale = useMotionValue(1);
  const glow = useMotionValue(0);
  const hold = useMotionValue(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const region: InteractiveRegion = {
      id: options.id,
      scope: options.scope,
      getElement: () => ref.current,
      onActivate: options.onActivate ? () => optionsRef.current.onActivate?.() : undefined,
      onDrag: options.onDrag ? (point, delta) => optionsRef.current.onDrag?.(point, delta) : undefined,
      onPressStart:()=>optionsRef.current.onPressStart?.(),
      onPressEnd:cancelled=>optionsRef.current.onPressEnd?.(cancelled),
      onHoldProgress: (p) => optionsRef.current.onHoldProgress?.(p),
      onHoldComplete: options.onHoldComplete ? () => optionsRef.current.onHoldComplete?.() : undefined,
      // Live reads: hold time and magnet may be retuned from Settings.
      get holdMs() {
        return optionsRef.current.holdMs;
      },
      get magnet() {
        return optionsRef.current.magnet;
      },
      get dragThreshold() {
        return optionsRef.current.dragThreshold;
      },
      // Read through the ref: `disabled` flips as the app state evolves
      // (undo becomes enabled, clear arms when strokes exist).
      isDisabled: () => optionsRef.current.isDisabled?.() ?? false,
    };
    const unregister = interactionManager.register(region);
    let lastTarget=1;
    const unsubscribe = interactionManager.subscribe((snapshot) => {
      const hovered = snapshot.hoverId === options.id;
      const pressed = snapshot.pressId === options.id;
      const disabled=optionsRef.current.isDisabled?.()??false;
      const armed=hovered&&(snapshot.contactState==='NEAR'||snapshot.contactState==='CONTACT');
      const state=disabled?'DISABLED':snapshot.state==='lost'?'HAND_LOST':snapshot.successId===options.id?'SUCCESS':pressed?'PRESSED':armed?'ARMED':hovered?'HOVER':ref.current?.dataset.active==='true'?'ACTIVE':'IDLE';
      if(ref.current)ref.current.dataset.gestureState=state;
      const target = pressed ? .96 : hovered ? 1.03 : 1;
      if(lastTarget!==target){lastTarget=target;animate(scale,target,document.documentElement.dataset.reducedMotion==='on'||matchMedia('(prefers-reduced-motion: reduce)').matches?{duration:0}:motionTokens.spring);}
      glow.set(hovered || pressed ? 1 : 0);
      hold.set(pressed ? snapshot.holdProgress : 0);
    });
    return () => {
      unregister();
      unsubscribe();
    };
    // Re-registered when the id or scope changes; behaviour reads from optionsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.id, options.scope]);

  return { ref, scale, glow, hold };
}
