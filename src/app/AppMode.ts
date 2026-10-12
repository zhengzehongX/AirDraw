import { motionTokens } from '../design/motion';
export type WorkspaceMode = 'SPATIAL_DRAW' | 'CANVAS_DRAW' | 'MODEL_CONTROL';
export type AppMode = 'HOME' | WorkspaceMode | 'TRANSITION';
const keys: WorkspaceMode[]=['SPATIAL_DRAW','CANVAS_DRAW','MODEL_CONTROL'];
type Weights = Record<WorkspaceMode,number>;
class ModeController {
  private listeners=new Set<()=>void>();
  snapshot={ mode:'HOME' as AppMode, target:'SPATIAL_DRAW' as WorkspaceMode, revision:0 };
  private from: Weights={SPATIAL_DRAW:1,CANVAS_DRAW:0,MODEL_CONTROL:0};
  private started=0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  reduced=false;
  getSnapshot=()=>this.snapshot;
  subscribe=(cb:()=>void)=>{this.listeners.add(cb);return()=>{this.listeners.delete(cb);};};
  private emit(){this.snapshot={...this.snapshot,revision:this.snapshot.revision+1};this.listeners.forEach(cb=>cb());}
  enter(){if(this.snapshot.mode==='HOME'){this.snapshot.mode=this.snapshot.target;this.emit();}}
  request(target:WorkspaceMode){
    if(target===this.snapshot.target && this.snapshot.mode!=='HOME')return;
    this.from=this.weights();this.snapshot.target=target;this.started=performance.now();
    this.snapshot.mode='TRANSITION';clearTimeout(this.timer);this.emit();
    this.timer=setTimeout(()=>{this.snapshot.mode=target;this.from=this.weights();this.emit();},this.duration);
  }
  get duration(){return this.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches?80:motionTokens.modeMs;}
  weights():Weights {
    if(this.snapshot.mode!=='TRANSITION')return Object.fromEntries(keys.map(k=>[k,k===this.snapshot.target?1:0])) as Weights;
    const t=Math.min(1,(performance.now()-this.started)/this.duration),e=t*t*(3-2*t);
    return Object.fromEntries(keys.map(k=>[k,this.from[k]+((k===this.snapshot.target?1:0)-this.from[k])*e])) as Weights;
  }
}
export const appMode=new ModeController();
