import type { HandTrackingProvider } from './types';
import type { HandTrackingResult } from '../../types/hand';
import { loadTrackingConfig, type TrackingConfig, type WorkerResponse } from './workerProtocol';
/** Single-flight frame transfer: no queued frames, no main-thread inference. */
export class WorkerHandProvider implements HandTrackingProvider {
  readonly kind='mediapipe' as const;
  delegate='-';modelSource='local';
  private worker:Worker|null=null;private raf=0;private running=false;private busy=false;
  private interval=1000/30;private last=0;private videoTime=-1;private errors=0;
  private emit:((r:HandTrackingResult)=>void)|null=null;
  private frameCallback=0;private paused=false;
  private starting:Promise<void>|null=null;
  private cancelStart:(()=>void)|null=null;
  onError:((error:Error)=>void)|null=null;
  skippedFrames=0;
  onDelegateChange:((delegate:string)=>void)|null=null;
  /** Set when a requested delegate was refused; the message says what is still running. */
  onConfigRejected:((message:string,delegate:string)=>void)|null=null;
  constructor(private video:HTMLVideoElement,private config:TrackingConfig=loadTrackingConfig()){}
  start(emit:(r:HandTrackingResult)=>void):Promise<void>{
    if(this.running)return Promise.resolve();
    if(this.starting)return this.starting;
    this.emit=emit;
    const worker=new Worker(new URL('./tracking.worker.ts',import.meta.url),{type:'module'});
    this.worker=worker;
    const ready=new Promise<void>((resolve,reject)=>{
      const fail=(error:Error)=>{clearTimeout(timer);this.cancelStart=null;reject(error);};
      const timer=setTimeout(()=>fail(new Error('手部识别 Worker 启动超时')),45000);
      this.cancelStart=()=>fail(new DOMException('Tracking initialization cancelled','AbortError'));
      worker.onerror=(e)=>{if(this.worker!==worker)return;this.busy=false;const error=new Error(e.message);fail(error);this.onError?.(error);};
      worker.onmessage=(event:MessageEvent<WorkerResponse>)=>{
        if(this.worker!==worker)return;
        const m=event.data;
        if(m.type==='ready'){clearTimeout(timer);this.cancelStart=null;this.delegate=m.delegate;this.modelSource=m.modelSource;this.onDelegateChange?.(m.delegate);resolve();}
        else if(m.type==='configRejected'){
          // Inference keeps running on the delegate that actually works; the UI is
          // told which one that is, so a refused switch never looks like a success.
          this.delegate=m.delegate;this.config={...this.config,delegate:m.delegate as TrackingConfig['delegate']};
          try{localStorage.setItem('airdraw-tracking-config',JSON.stringify(this.config));}catch{/* Session only. */}
          this.onConfigRejected?.(m.message,m.delegate);
        }
        else if(m.type==='result'){this.busy=false;this.errors=0;this.emit?.(m.result);}
        else {this.busy=false;this.errors++;fail(new Error(m.message));this.emitEmpty();if(this.errors>=3)this.onError?.(new Error(m.message));}
      };
      worker.postMessage({type:'init',config:this.config});
    });
    const task=ready.then(()=>{if(this.worker!==worker)throw new DOMException('Tracking initialization cancelled','AbortError');this.running=true;this.schedule();}).finally(()=>{if(this.starting===task)this.starting=null;});
    this.starting=task;return task;
  }
  configure(config:TrackingConfig){this.config=config;this.worker?.postMessage({type:'configure',config});}
  stop(){this.running=false;cancelAnimationFrame(this.raf);if(this.frameCallback)this.video.cancelVideoFrameCallback(this.frameCallback);this.frameCallback=0;}
  setPaused(paused:boolean){this.paused=paused;this.videoTime=-1;this.last=0;}
  dispose(){this.stop();this.cancelStart?.();this.cancelStart=null;const worker=this.worker;this.worker=null;if(worker){worker.onmessage=null;worker.onerror=null;worker.postMessage({type:'dispose'});worker.terminate();}this.emit=null;this.busy=false;this.videoTime=-1;}
  setMaxFps(fps:number){this.interval=1000/Math.max(20,Math.min(30,fps));}
  private emitEmpty(){this.emit?.({hands:[],timestamp:performance.now(),inferenceMs:0,videoWidth:this.video.videoWidth,videoHeight:this.video.videoHeight,source:'mediapipe'});}
  private schedule(){if(!this.running)return;if(typeof this.video.requestVideoFrameCallback==='function')this.frameCallback=this.video.requestVideoFrameCallback(now=>{void this.tick(now);});else this.raf=requestAnimationFrame(this.tick);}
  private tick=async(now:number)=>{
    if(!this.running)return;
    this.schedule();
    if(this.paused||document.hidden)return;
    if(this.video.ended || this.video.srcObject instanceof MediaStream && !this.video.srcObject.active){this.emitEmpty();return;}
    if(this.busy){this.skippedFrames++;return;}
    if(now-this.last<this.interval-1||this.video.readyState<2||this.video.currentTime===this.videoTime)return;
    this.busy=true;this.last=now;this.videoTime=this.video.currentTime;
    const ratio=Math.min(1,640/this.video.videoWidth);
    try {const bitmap=await createImageBitmap(this.video,{resizeWidth:Math.max(1,Math.round(this.video.videoWidth*ratio)),resizeHeight:Math.max(1,Math.round(this.video.videoHeight*ratio)),resizeQuality:'low'});if(!this.running||this.paused){bitmap.close();this.busy=false;return;}this.worker!.postMessage({type:'frame',bitmap,timestamp:performance.now(),width:this.video.videoWidth,height:this.video.videoHeight},[bitmap]);}
    catch {this.busy=false;this.emitEmpty();}
  };
}
