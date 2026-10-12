import { useEffect } from 'react';
import type { DrawEngine } from '../engine/DrawEngine';
import { useDrawEngine, type DrawEngineApi } from './useDrawEngine';
import { useHandTracking, type HandTrackingApi } from './useHandTracking';
import {appMode} from '../app/AppMode';
import {inputRouter} from '../interaction/InputRouter';
import {modelController} from '../model/modelController';

export type AirDrawSession = HandTrackingApi & DrawEngineApi;

/**
 * Composes tracking + drawing: detection results flow straight into the engine
 * (never through React state), and the engine reports which delegate is in use.
 */
export function useAirDrawSession(enabled: boolean, simulate: boolean): AirDrawSession {
  const tracking = useHandTracking(enabled, simulate);
  const draw = useDrawEngine();
  const { engine } = draw;
  const { subscribe, delegate } = tracking;
  useEffect(()=>{if(import.meta.env.DEV)Object.assign(window,{__airdrawTracking:tracking});},[tracking.lifecycle,tracking.delegate,tracking.stream]);

  useEffect(() => {
    engine.setDelegate(delegate);
  }, [engine, delegate]);

  useEffect(() => subscribe((result) => engine.handleResult(result)), [subscribe, engine]);
  useEffect(()=>{if(tracking.cameraState!=='READY'){engine.cancelInput();modelController.release();}},[tracking.cameraState,engine]);
  useEffect(()=>{const visibility=()=>{if(document.hidden){engine.cancelInput();modelController.release();}};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[engine]);

  // Dev-only inspection handles so the pipeline can be driven deterministically
  // from the console (mirroring, pinch thresholds, dropout recovery, UI gestures).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { __airdraw?: DrawEngine }).__airdraw = engine;
    Object.assign(window,{__airdrawMode:appMode,__airdrawInput:inputRouter,__airdrawModel:modelController});
    import('../interaction/GestureInteractionManager').then(({ interactionManager }) => {
      (window as Window & { __airdrawInteraction?: unknown }).__airdrawInteraction = interactionManager;
    });
    return () => {
      delete (window as Window & { __airdraw?: DrawEngine }).__airdraw;
    };
  }, [engine]);

  return { ...tracking, ...draw };
}
