import {useEffect,useSyncExternalStore} from 'react';
import {cameraService,type CameraState} from '../services/handTracking/CameraService';
import type {EngineError,HandTrackingResult,TrackingLifecycle} from '../types/hand';
import type {TrackingConfig} from '../services/handTracking/workerProtocol';
export type HandTrackingApi={cameraState:CameraState;lifecycle:TrackingLifecycle;error:EngineError|null;delegate:string;stream:MediaStream|null;simulated:boolean;retry:()=>void;subscribe:(listener:(result:HandTrackingResult)=>void)=>()=>void;setMaxFps:(fps:number)=>void;configure:(config:TrackingConfig)=>void};
/** React observes the application service; mode components never acquire a camera. */
export function useHandTracking(enabled:boolean,simulate:boolean):HandTrackingApi{
 const snapshot=useSyncExternalStore(cameraService.subscribe,cameraService.getSnapshot);
 useEffect(()=>cameraService.retain(),[]);
 useEffect(()=>{if(enabled)void cameraService.start(simulate);},[enabled,simulate]);
 return {...snapshot,simulated:simulate,retry:cameraService.retry,subscribe:cameraService.subscribeResults,setMaxFps:cameraService.setMaxFps,configure:cameraService.configure};
}
