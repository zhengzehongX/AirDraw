import * as THREE from 'three';
export type TransformMode='Move'|'Rotate'|'Scale';
class ModelController {
  tool:TransformMode='Move';selected=false;hovered=false;grabbed=false;
  worldActive=false; worldRevision=0;worldResetRevision=0;
  scalePreview:{id:string;value:number}|null=null;
  frameTarget:'selection'|'all'|null=null;frameRequestedAt=0;
  frameWorld(target:'selection'|'all'){this.frameTarget=target;this.frameRequestedAt=performance.now();this.worldRevision++;this.emit();}
  resetWorld(){this.worldRevision++;this.worldResetRevision++;this.emit();}
  setWorldActive(active:boolean){if(this.worldActive!==active){this.worldActive=active;this.emit();}}
  removed=false;
  targetId:string|null=null;snap:'off'|'grid'|'angle'|'center'='off';
  diagnostic:Record<string,unknown>={};
  position=new THREE.Vector3();quaternion=new THREE.Quaternion();scale=1;
  object:THREE.Object3D|null=null;revision=0;
  private listeners=new Set<()=>void>();
  subscribe=(cb:()=>void)=>{this.listeners.add(cb);return()=>{this.listeners.delete(cb);};};
  getSnapshot=()=>this.revision;
  emit(){this.revision++;this.listeners.forEach(cb=>cb());}
  release(){this.grabbed=false;}
  reset(){this.release();this.removed=false;this.position.set(0,0,0);this.quaternion.identity();this.scale=1;this.emit();}
  setTool(tool:TransformMode){this.release();this.tool=tool;this.emit();}
  cycleTool(){const tools:TransformMode[]=['Move','Rotate','Scale'];this.setTool(tools[(tools.indexOf(this.tool)+1)%tools.length]);}
}
export const modelController=new ModelController();
