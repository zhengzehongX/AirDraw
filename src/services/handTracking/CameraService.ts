import {openCamera,stopCamera,waitForVideoReady} from './camera';
import {WorkerHandProvider} from './WorkerHandProvider';
import {SyntheticHandProvider} from './SyntheticHandProvider';
import {toEngineError} from '../errors';
import {notify} from '../../app/feedback';
import type {HandTrackingProvider} from './types';
import type {EngineError,HandTrackingResult,TrackingLifecycle} from '../../types/hand';
import type {TrackingConfig} from './workerProtocol';
export type CameraState='IDLE'|'REQUESTING_PERMISSION'|'STARTING'|'WARMING_UP'|'READY'|'DEGRADED'|'RECOVERING'|'ERROR';
type Snapshot={cameraState:CameraState;lifecycle:TrackingLifecycle;stream:MediaStream|null;delegate:string;error:EngineError|null};
const legacy:Record<CameraState,TrackingLifecycle>={IDLE:'idle',REQUESTING_PERMISSION:'starting-camera',STARTING:'starting-camera',WARMING_UP:'loading-model',READY:'running',DEGRADED:'running',RECOVERING:'loading-model',ERROR:'error'};
/** One application owner. Views borrow the stream; changing rooms never restarts it. */
export class CameraService{
 private snapshot:Snapshot={cameraState:'IDLE',lifecycle:'idle',stream:null,delegate:'-',error:null};
 private listeners=new Set<()=>void>();private results=new Set<(r:HandTrackingResult)=>void>();
 private source:HTMLVideoElement|null=null;private provider:HandTrackingProvider|null=null;
 private pending:Promise<void>|null=null;private generation=0;private detachTrack=()=>{};
 private recoveryTimer:ReturnType<typeof setTimeout>|null=null;private recovering=false;private attached=false;
 private cancelWarmup=()=>{};
 private leases=0;private releaseTimer:ReturnType<typeof setTimeout>|null=null;private simulated=false;
 /** Why the running delegate differs from the one the user asked for. */
 configNotice:string|null=null;
 readonly diagnostics={streamAcquisitions:0,workerCreations:0,recoveries:0,warmupFrames:0};
 getSnapshot=()=>this.snapshot;
 getDiagnostics=()=>({...this.diagnostics,skippedFrames:this.provider instanceof WorkerHandProvider?this.provider.skippedFrames:0,activeTracks:this.snapshot.stream?.getTracks().filter(track=>track.readyState==='live').length??0});
 subscribe=(cb:()=>void)=>{this.listeners.add(cb);return()=>{this.listeners.delete(cb);};};
 subscribeResults=(cb:(r:HandTrackingResult)=>void)=>{this.results.add(cb);return()=>{this.results.delete(cb);};};
 private set(cameraState:CameraState,extra:Partial<Snapshot>={}){this.snapshot={...this.snapshot,...extra,cameraState,lifecycle:legacy[cameraState]};this.listeners.forEach(cb=>cb());}
 retain(){this.leases++;if(this.releaseTimer)clearTimeout(this.releaseTimer);return()=>{this.leases--;this.releaseTimer=setTimeout(()=>{if(!this.leases)this.dispose();},0);};}
 start(simulated=false){if(this.pending)return this.pending;if(this.provider)return Promise.resolve();this.simulated=simulated;const generation=this.generation;const operation=this.initialize(generation).finally(()=>{if(this.pending===operation)this.pending=null;});this.pending=operation;return operation;}
 private async initialize(generation:number){
  try{
   this.set(this.snapshot.stream?.active?'STARTING':'REQUESTING_PERMISSION',{error:null});
   if(this.simulated)this.provider=new SyntheticHandProvider();
   else{
    if(!this.source){this.source=document.createElement('video');Object.assign(this.source,{autoplay:true,playsInline:true,muted:true,tabIndex:-1});this.source.className='ad-camera-source';this.source.setAttribute('aria-hidden','true');document.body.append(this.source);}
    let stream=this.snapshot.stream;
    if(!stream?.active){stream=await openCamera();this.diagnostics.streamAcquisitions++;}
    if(generation!==this.generation){stopCamera(stream);return;}
    this.set('STARTING',{stream});this.watch(stream);await waitForVideoReady(this.source,stream);
    if(generation!==this.generation)return;this.set('WARMING_UP');await this.warmup(generation);if(generation!==this.generation)return;
    const provider=new WorkerHandProvider(this.source);this.provider=provider;this.diagnostics.workerCreations++;
    provider.onDelegateChange=delegate=>this.set(this.snapshot.cameraState,{delegate});
    provider.onConfigRejected=(message)=>{
      // Inference continued on `delegate`; say so instead of pretending the switch stuck.
      this.configNotice=message;
      notify(message,{tone:'warn'});
    };
    provider.onError=error=>{if(generation===this.generation){provider.dispose();this.provider=null;this.set('ERROR',{error:toEngineError(error)});}};
   }
   if(generation!==this.generation)return;
   await this.provider!.start(r=>{if(generation===this.generation&&this.snapshot.cameraState==='READY')this.results.forEach(cb=>cb(r));});
   if(generation!==this.generation)return;
   if(!this.provider||this.snapshot.cameraState==='ERROR')return;
   this.set('READY',{delegate:this.provider.delegate});this.attach();
  }catch(error){if(generation===this.generation){this.provider?.dispose();this.provider=null;this.set('ERROR',{error:toEngineError(error)});}}
 }
 private warmup(generation:number){return new Promise<void>((resolve,reject)=>{
  let callback=0,raf=0,count=0,previous=-1,finished=false;const video=this.source!;
  const finish=(error?:Error)=>{if(finished)return;finished=true;clearInterval(timer);if(callback)video.cancelVideoFrameCallback(callback);cancelAnimationFrame(raf);error?reject(error):resolve();};
  this.cancelWarmup=()=>finish(new Error('摄像头预热已取消'));
  const tick=()=>{if(generation!==this.generation){finish(new Error('摄像头启动已取消'));return;}if(!document.hidden&&video.readyState>=2&&video.videoWidth>0&&video.currentTime!==previous){previous=video.currentTime;count++;this.diagnostics.warmupFrames=count;}if(count>=6){finish();return;}schedule();};
  const schedule=()=>{if(typeof video.requestVideoFrameCallback==='function')callback=video.requestVideoFrameCallback(tick);else raf=requestAnimationFrame(tick);};
  let visibleWait=0;const timer=setInterval(()=>{if(!document.hidden)visibleWait+=1000;if(visibleWait>=10000)finish(new Error('摄像头预热超时，请重试'));},1000);schedule();
 });}
 private watch(stream:MediaStream){this.detachTrack();const track=stream.getVideoTracks()[0];if(!track)return;
  const ended=()=>{void this.recover();},mute=()=>{this.set('DEGRADED');this.recoveryTimer=setTimeout(()=>{if(track.muted)void this.recover();},1800);},unmute=()=>{if(this.recoveryTimer)clearTimeout(this.recoveryTimer);void this.resync();};
  track.addEventListener('ended',ended);track.addEventListener('mute',mute);track.addEventListener('unmute',unmute);
  this.detachTrack=()=>{track.removeEventListener('ended',ended);track.removeEventListener('mute',mute);track.removeEventListener('unmute',unmute);if(this.recoveryTimer)clearTimeout(this.recoveryTimer);};
 }
 private attach(){if(this.attached)return;this.attached=true;document.addEventListener('visibilitychange',this.visibility);window.addEventListener('pageshow',this.pageshow);navigator.mediaDevices?.addEventListener('devicechange',this.devicechange);}
 private visibility=()=>{if(this.provider instanceof WorkerHandProvider)this.provider.setPaused(document.hidden);if(document.hidden)this.results.forEach(cb=>cb({hands:[],timestamp:performance.now(),inferenceMs:0,videoWidth:this.source?.videoWidth??1280,videoHeight:this.source?.videoHeight??720,source:'mediapipe'}));else void this.resync();};
 private pageshow=()=>{if(!document.hidden)void this.resync();};
 private devicechange=()=>{if(this.snapshot.stream&&!this.snapshot.stream.getVideoTracks().some(t=>t.readyState==='live'))void this.recover();};
 private async resync(){if(this.simulated||this.recovering||!this.source||!this.provider)return;if(!this.snapshot.stream?.active){await this.recover();return;}this.recovering=true;const generation=this.generation;
  try{if(this.provider instanceof WorkerHandProvider)this.provider.setPaused(true);this.set('WARMING_UP');await this.source.play();await this.warmup(generation);if(generation!==this.generation)return;if(this.provider instanceof WorkerHandProvider)this.provider.setPaused(false);this.set('READY');}catch(e){if(generation===this.generation)this.set('ERROR',{error:toEngineError(e)});}finally{if(generation===this.generation)this.recovering=false;}
 }
 private async recover(){if(this.recovering||this.simulated||!this.source)return;this.recovering=true;const generation=this.generation;this.set('RECOVERING');this.diagnostics.recoveries++;if(this.provider instanceof WorkerHandProvider)this.provider.setPaused(true);
  try{this.detachTrack();stopCamera(this.snapshot.stream);this.set('RECOVERING',{stream:null});let recovered:MediaStream|null=null;
   for(let attempt=0;attempt<2;attempt++){try{recovered=await openCamera();break;}catch(e){if(attempt===1)throw e;}}
   if(generation!==this.generation){stopCamera(recovered);return;}this.diagnostics.streamAcquisitions++;this.set('STARTING',{stream:recovered});this.watch(recovered!);await waitForVideoReady(this.source,recovered!);if(generation!==this.generation)return;this.set('WARMING_UP');await this.warmup(generation);if(generation!==this.generation)return;if(this.provider instanceof WorkerHandProvider)this.provider.setPaused(false);this.set('READY',{error:null});
  }catch(e){if(generation===this.generation)this.set('ERROR',{error:toEngineError(e)});}finally{if(generation===this.generation)this.recovering=false;}
 }
 retry=()=>{if(this.provider){void this.recover();return;}if(!this.snapshot.stream?.active){stopCamera(this.snapshot.stream);this.source?.remove();this.source=null;}void this.start(this.simulated);};
 setMaxFps=(fps:number)=>this.provider?.setMaxFps(fps);
 configure=(config:TrackingConfig)=>{try{localStorage.setItem('airdraw-tracking-config',JSON.stringify(config));}catch{/* Session only. */}if(this.provider instanceof WorkerHandProvider)this.provider.configure(config);};
 dispose(){this.generation++;this.pending=null;this.recovering=false;this.cancelWarmup();this.detachTrack();this.provider?.dispose();this.provider=null;stopCamera(this.snapshot.stream);this.source?.remove();this.source=null;document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pageshow',this.pageshow);navigator.mediaDevices?.removeEventListener('devicechange',this.devicechange);this.attached=false;this.set('IDLE',{stream:null,error:null});}
}
export const cameraService=new CameraService();

