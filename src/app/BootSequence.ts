import type {CameraState} from '../services/handTracking/CameraService';
export type BootPhase='BOOT'|'BRAND_INTRO'|'READY_TO_ENTER'|'PERMISSION'|'CAMERA_WARMUP'|'QUICK_CALIBRATION'|'HOME';
/** Brand timing never gates permission or model loading. Camera states own readiness. */
export function bootPhase(context:string,camera:CameraState,calibrating:boolean,brandReady:boolean):BootPhase{
 if(context==='launch')return brandReady?'READY_TO_ENTER':'BRAND_INTRO';
 if(camera==='IDLE'||camera==='REQUESTING_PERMISSION')return 'PERMISSION';
 if(camera!=='READY')return 'CAMERA_WARMUP';
 return calibrating?'QUICK_CALIBRATION':'HOME';
}
