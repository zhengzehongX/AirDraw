import { createHandLandmarker } from './modelLoader';
import type { HandLandmarkerHandle } from './modelLoader';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';
let handle:HandLandmarkerHandle|null=null;
let initialization:Promise<void>|null=null;
// Tasks' UMD WASM loader expects importScripts. Module workers cannot call it;
// adapt its documented fallback and expose the vendored UMD factory explicitly.
const runtime=self as unknown as {importScripts:(url:string)=>void;import:(url:string)=>Promise<void>};
runtime.importScripts=()=>{throw new TypeError('Module worker');};
runtime.import=async(url)=>{
  const response=await fetch(url);if(!response.ok)throw new Error(`WASM loader ${response.status}`);
  // Emscripten's classic-script fallback declares custom_dbg in a block. ESM
  // strict mode gives it block scope, so supply the outer binding explicitly.
  const blob=new Blob(['const custom_dbg = () => {};\n',await response.text(),'\nglobalThis.ModuleFactory = ModuleFactory;'],{type:'text/javascript'});
  const objectUrl=URL.createObjectURL(blob);
  try {await import(/* @vite-ignore */ objectUrl);} finally {URL.revokeObjectURL(objectUrl);}
};
const send=(response:WorkerResponse)=>self.postMessage(response);
const handleMessage=async(event:MessageEvent<WorkerRequest>)=>{
  const m=event.data;
  try {
    if(m.type==='init'){
      initialization??=(async()=>{handle=await createHandLandmarker(m.config);send({type:'ready',delegate:handle.delegate,modelSource:handle.modelSource});})();
      await initialization;
    } else if(m.type==='configure'){
      await initialization;
      if(handle){
        const wanted=m.config.delegate==='AUTO'?handle.delegate:m.config.delegate;
        const active=handle.delegate;
        try{
          await handle.landmarker.setOptions?.({baseOptions:{delegate:wanted},minHandDetectionConfidence:m.config.detection,minHandPresenceConfidence:m.config.presence,minTrackingConfidence:m.config.tracking});
        }catch(error){
          // A refused delegate must not tear down inference: keep the working one
          // and say so, instead of reporting a switch that never happened. The
          // thresholds ride on the same call, so nothing here changed.
          send({type:'configRejected',delegate:active,message:`识别器拒绝了 ${wanted} 推理后端，仍在使用 ${active}：${error instanceof Error?error.message:String(error)}`});
          return;
        }
        handle.delegate=wanted;
        send({type:'ready',delegate:handle.delegate,modelSource:handle.modelSource});
      }
    } else if(m.type==='frame'){
      try {
        await initialization;
        if(!handle)throw new Error('识别服务尚未就绪');
        const start=performance.now();
        const result=handle.landmarker.detectForVideo(m.bitmap,m.timestamp);
        send({type:'result',result:{timestamp:m.timestamp,inferenceMs:performance.now()-start,videoWidth:m.width,videoHeight:m.height,source:'mediapipe',hands:result.landmarks.map((landmarks,i)=>({landmarks,worldLandmarks:result.worldLandmarks?.[i]??null,handedness:(result.handedness?.[i]??result.handednesses?.[i])?.[0]?.categoryName==='Left'?'Left':'Right',score:(result.handedness?.[i]??result.handednesses?.[i])?.[0]?.score??0}))}});
      } finally {m.bitmap.close();}
    } else {handle?.landmarker.close();handle=null;self.close();}
  } catch(error){send({type:'error',message:error instanceof Error?`${error.message}${error.cause ? `: ${String(error.cause)}` : ''}`:String(error)});}
};
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{queue=queue.then(()=>handleMessage(event));};
