import type { AppMode } from '../app/AppMode';
export type InteractionContext = 'WORKSPACE' | 'UI' | 'BLOCKED';
/** One focus owner. Epoch changes force all clients to release their grab / pen. */
export class InputRouter {
  mode: AppMode='HOME'; context:InteractionContext='BLOCKED'; epoch=0;
  private awaitRelease=false;
  set(mode:AppMode,context:InteractionContext,holding=false){if(mode!==this.mode||context!==this.context){if((context!=='WORKSPACE'||mode==='TRANSITION')&&holding)this.awaitRelease=true;this.mode=mode;this.context=context;this.epoch++;}}
  contact(active:boolean,state?:string){if(!active&&(!state||state==='OPEN'||state==='RELEASE'))this.awaitRelease=false;}
  suspend(){this.awaitRelease=true;this.epoch++;}
  /**
   * Navigation ending (or a hand coming back) retires every in-flight capture: the
   * pinch that was holding the sheet must not be the pinch that draws, and a latch
   * left over from a transition must not swallow the next deliberate pinch.
   */
  clearCapture(){this.awaitRelease=false;this.epoch++;}
  get waitingForRelease(){return this.awaitRelease;}
  get mayDraw(){return !this.awaitRelease&&this.context==='WORKSPACE'&&(this.mode==='SPATIAL_DRAW'||this.mode==='CANVAS_DRAW');}
  get mayTransform(){return !this.awaitRelease&&this.context==='WORKSPACE'&&this.mode==='MODEL_CONTROL';}
}
export const inputRouter=new InputRouter();
