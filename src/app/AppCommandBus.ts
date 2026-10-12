import type {WorkspaceMode} from './AppMode';
import type {ToyId} from '../playlab/types';
export type AppCommand=
 |{type:'SWITCH_MODE';mode:WorkspaceMode}|{type:'SET_THEME';theme:'day'|'night'}
 |{type:'SET_COLOR';color:string}|{type:'SET_BRUSH_SIZE';delta?:number;width?:number}|{type:'OPEN_TOY';toy:ToyId}
 |{type:'CLEAR_CANVAS';confirmed?:boolean}
 |{type:'PAN_BOARD';dx?:number;dy?:number}|{type:'ZOOM_BOARD';factor:number}|{type:'VIEW_FIT'|'VIEW_RESET'|'VIEW_LAST'}
 |{type:'RETURN_TO_CANVAS'}|{type:'PAUSE_GESTURES';on?:boolean}
 |{type:'OPEN_MENU'|'CLOSE_MENU'|'NEXT_PAGE'|'PREVIOUS_PAGE'|'UNDO'|'REDO'|'SAVE'|'OPEN_GALLERY'|'OPEN_HELP'|'OPEN_PLAYLAB'|'CENTER_ARTWORK'|'EXIT_VIEW_MODE'|'HOME'|'CANCEL'|'OPEN_SETTINGS'|'OPEN_COLOR_PANEL'|'SET_LANGUAGE'};
type Handler=(command:AppCommand)=>void|Promise<void>;
/** All input producers use this bus; only the application adapter owns UI state. */
export class AppCommandBus {
 private handler:Handler|null=null;private waiting:{command:AppCommand;resolve:()=>void;reject:(error:Error)=>void}[]=[];
 bind(handler:Handler){this.handler=handler;return()=>{if(this.handler===handler)this.handler=null;};}
 defer:()=>boolean=()=>false;
 async send(command:AppCommand){
  if((command.type==='UNDO'||command.type==='REDO'||command.type==='SAVE')&&this.defer()){
   if(this.waiting.length>=8)throw new Error('请等待当前操作完成');
   return new Promise<void>((resolve,reject)=>this.waiting.push({command,resolve,reject}));
  }
  if(!this.handler)throw new Error('工作区尚未准备好');
  await this.handler(command);
 }
 async flush(){if(this.defer())return;const queue=this.waiting.splice(0);for(const item of queue){try{await this.send(item.command);item.resolve();}catch(error){item.reject(error as Error);}}}
 clear(){for(const item of this.waiting)item.reject(new Error('操作已取消'));this.waiting=[];}
}
export const appCommandBus=new AppCommandBus();
