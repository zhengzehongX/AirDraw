import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_BRUSH } from '../config';
import { readPreferences, updatePreferences } from '../app/preferences';
import { DrawEngine } from '../engine/DrawEngine';
import type { MaterialPresetId } from '../types/drawing';
import { EMPTY_METRICS, type Brush, type EngineMetrics } from '../types/drawing';

export type DrawEngineApi = {
  engine: DrawEngine;
  metrics: EngineMetrics;
  brush: Brush;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setMaterial: (material: MaterialPresetId) => void;
  undo: () => void;
  clear: () => void;
  strokeCount: number;
  canUndo: boolean;
};

/**
 * Creates the engine once and mirrors the small amount of state the UI needs
 * (brush, stroke count, throttled metrics). Cursor and per-frame data stay
 * outside React on purpose — they update at tracking rate.
 */
export function useDrawEngine(): DrawEngineApi {
  const brushRef = useRef<Brush>({ ...DEFAULT_BRUSH, ...readPreferences().brush });
  const engineRef = useRef<DrawEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new DrawEngine({
      getBrush: () => brushRef.current,
    });
  }
  const engine = engineRef.current;

  const [brush, setBrush] = useState<Brush>(() => ({ ...brushRef.current }));
  const [history, setHistory] = useState({ count: 0, canUndo: false });

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  /**
   * The engine publishes on its own animation frame. Reading it through
   * `useSyncExternalStore` (rather than `setState` from inside that frame) is what
   * keeps React in charge of *when* the UI updates: a `setState` arriving between two
   * of React's units of work counts as a nested update, and after fifty of those
   * React drops the update on the floor — which looks exactly like a pen that will
   * not draw while every gate reports that drawing is allowed.
   */
  const subscribeMetrics = useCallback(
    (onStoreChange: () => void) => engine.onMetrics(onStoreChange),
    [engine],
  );
  const metrics = useSyncExternalStore(subscribeMetrics, () => engine.getMetrics(), () => EMPTY_METRICS);

  useEffect(
    () =>
      engine.onHistoryChange(() => {
        setHistory({ count: engine.strokeCount, canUndo: engine.canUndo });
      }),
    [engine],
  );

  const setColor = useCallback((color: string) => {
    brushRef.current = { ...brushRef.current, color };
    updatePreferences({brush:brushRef.current});
    setBrush(brushRef.current);
  }, []);

  const setWidth = useCallback((width: number) => {
    brushRef.current = { ...brushRef.current, width };
    updatePreferences({brush:brushRef.current});
    setBrush(brushRef.current);
  }, []);

  const setMaterial = useCallback((material: MaterialPresetId) => {
    brushRef.current = { ...brushRef.current, material };
    updatePreferences({brush:brushRef.current});
    setBrush(brushRef.current);
  }, []);

  const undo = useCallback(() => {
    engine.undo();
    setHistory({ count: engine.strokeCount, canUndo: engine.canUndo });
  }, [engine]);

  const clear = useCallback(() => {
    engine.clear();
    setHistory({ count: engine.strokeCount, canUndo: engine.canUndo });
  }, [engine]);

  return useMemo(
    () => ({
      engine,
      metrics,
      brush,
      setColor,
      setWidth,
      setMaterial,
      undo,
      clear,
      strokeCount: history.count,
      canUndo: history.canUndo,
    }),
    [engine, metrics, brush, setColor, setWidth, setMaterial, undo, clear, history],
  );
}
