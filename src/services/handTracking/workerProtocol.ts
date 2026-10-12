import type { HandTrackingResult } from '../../types/hand';
export type TrackingConfig = { delegate:'GPU'|'CPU'|'AUTO'; detection:number; presence:number; tracking:number };
export const defaultTrackingConfig:TrackingConfig={delegate:'AUTO',detection:.65,presence:.65,tracking:.65};
export function loadTrackingConfig():TrackingConfig {try{const p=JSON.parse(localStorage.getItem('airdraw-tracking-config')??'null');if(p&&['AUTO','GPU','CPU'].includes(p.delegate)&&[p.detection,p.presence,p.tracking].every(n=>typeof n==='number'&&n>=.3&&n<=.95))return p;}catch{/* Defaults */}return {...defaultTrackingConfig};}
export type WorkerRequest = {type:'init';config:TrackingConfig} | {type:'frame';bitmap:ImageBitmap;timestamp:number;width:number;height:number} | {type:'configure';config:TrackingConfig} | {type:'dispose'};
export type WorkerResponse = {type:'ready';delegate:string;modelSource:string} | {type:'configRejected';message:string;delegate:string} | {type:'result';result:HandTrackingResult} | {type:'error';message:string};
