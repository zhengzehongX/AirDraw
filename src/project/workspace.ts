import {CommandHistory} from './CommandHistory';
import {newProject,identityTransform,type Project,type SceneObject} from './types';
import type {Stroke} from '../types/drawing';
import {isEditable,ancestors} from './objectGraph';
import {worldMatrix} from './objectGraph';
import * as THREE from 'three';
import {createId} from '../utils/id';
/** What the piece's relationship to storage is. Symbolic: prose must never carry state. */
export type SaveState = 'unsaved' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * The words beside each state. The label is derived from the state, never the other
 * way round — a translated string used as state changes meaning when the interface
 * language changes, and nothing could then compare it reliably.
 */
const SAVE_PHRASE: Record<SaveState, string> = {
  unsaved: '未保存',
  dirty: '待保存',
  saving: '正在保存',
  saved: '已自动保存',
  error: '保存失败，可重试',
};

class Workspace {
  project:Project=newProject();history=new CommandHistory();selection:string[]=[];revision=0;
  saveState:SaveState='unsaved';
  status=SAVE_PHRASE.unsaved;
  /** Set the state and its label together so the two can never disagree. */
  mark(saveState: SaveState, detail?: string) {
    this.saveState = saveState;
    this.status = detail ? `${SAVE_PHRASE[saveState]}·${detail}` : SAVE_PHRASE[saveState];
  }
  preview:SceneObject|null=null;
  beforeOpen:(()=>void)|null=null;
  private listeners=new Set<()=>void>();
  subscribe=(cb:()=>void)=>{this.listeners.add(cb);return()=>{this.listeners.delete(cb);};};getSnapshot=()=>this.revision;
  emit(){this.revision++;this.listeners.forEach(cb=>cb());}
  change(name:string,objects:SceneObject[]){const before=this.project.objects;const apply=(next:SceneObject[])=>{this.project={...this.project,objects:next,updatedAt:Date.now()};this.mark('dirty');this.selection=this.selection.filter(id=>next.some(o=>o.id===id));this.emit();};this.history.execute({name,apply:()=>apply(objects),revert:()=>apply(before)});this.emit();}
  patch(id:string,patch:Partial<SceneObject>,name='编辑对象'){const object=this.project.objects.find(o=>o.id===id);if(!object)return;if(!isEditable(object,this.project.objects)&&Object.keys(patch).some(k=>!['locked','visible','name'].includes(k)))return;this.change(name,this.project.objects.map(o=>o.id===id?{...o,...patch,updatedAt:Date.now()}:o));}
  select(id:string,add=false){const o=this.project.objects.find(o=>o.id===id);if(!o||!isEditable(o,this.project.objects))return;this.selection=add?[...new Set([...this.selection,id])]:[id];this.emit();}
  /** Layer rows need a tap that can also let go of an object, which `select` deliberately cannot. */
  toggleSelection(id:string){const o=this.project.objects.find(o=>o.id===id);if(!o||!isEditable(o,this.project.objects))return;this.selection=this.selection.includes(id)?this.selection.filter(s=>s!==id):[...this.selection,id];this.emit();}
  clearSelection(){if(!this.selection.length)return;this.selection=[];this.emit();}
  remove(id:string){const object=this.project.objects.find(o=>o.id===id);if(!object||!isEditable(object,this.project.objects))return;const subtree=this.project.objects.filter(o=>ancestors(o,this.project.objects).some(p=>p.id===id));if(subtree.some(o=>o.locked))return;this.change('删除',this.project.objects.filter(o=>!subtree.includes(o)));}
  duplicate(id:string){const o=this.project.objects.find(o=>o.id===id);if(!o||!isEditable(o,this.project.objects))return;const subtree=this.project.objects.filter(o=>ancestors(o,this.project.objects).some(p=>p.id===id)),ids=new Map(subtree.map(o=>[o.id,createId()]));let strokeId=Math.max(0,...this.project.objects.map(o=>o.stroke?.id??0));const copies=subtree.map(item=>({...item,id:ids.get(item.id)!,parentId:ids.get(item.parentId??'')??item.parentId,stroke:item.stroke?{...item.stroke,id:++strokeId}:undefined,name:item.name+' copy',transform:item===o?{...item.transform,position:[item.transform.position[0]+.3,item.transform.position[1]+.3,item.transform.position[2]] as [number,number,number]}:item.transform,createdAt:Date.now(),updatedAt:Date.now()}));this.change('复制',[...this.project.objects,...copies]);}
  reorder(id:string,index:number){const list=[...this.project.objects],at=list.findIndex(o=>o.id===id);if(at<0)return;const [o]=list.splice(at,1);list.splice(Math.max(0,Math.min(index,list.length)),0,o);this.change('图层排序',list);}
  group(){const objects=this.project.objects,items=objects.filter(o=>this.selection.includes(o.id)&&isEditable(o,objects)&&!ancestors(o,objects).slice(1).some(p=>this.selection.includes(p.id)));if(items.length<2)return;const now=Date.now(),id=createId(),center=new THREE.Vector3();items.forEach(o=>center.add(new THREE.Vector3().setFromMatrixPosition(worldMatrix(o,objects))));center.divideScalar(items.length);const transforms=new Map(items.map(o=>{const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();worldMatrix(o,objects).decompose(p,q,s);p.sub(center);return [o.id,{position:p.toArray() as [number,number,number],rotation:q.toArray() as [number,number,number,number],scale:s.toArray() as [number,number,number]}];}));this.change('编组',[...objects.map(o=>items.includes(o)?{...o,parentId:id,transform:transforms.get(o.id)!}:o),{id,type:'group',name:'Group',visible:true,locked:false,transform:{...identityTransform(),position:center.toArray() as [number,number,number]},material:{preset:'candy',color:'#22d3ee'},createdAt:now,updatedAt:now,modeSource:'MODEL_CONTROL'}]);this.selection=[id];this.emit();}
  open(project:Project){this.beforeOpen?.();this.project=project;this.history.clear();this.selection=[];this.preview=null;this.mark('saved');this.emit();}
  rename(name:string){this.project={...this.project,name:name.trim().slice(0,60)||'Untitled',updatedAt:Date.now()};this.mark('dirty');this.emit();}
  environment(patch:Partial<Pick<Project,'theme'|'paper'|'camera'>>){const before={theme:this.project.theme,paper:this.project.paper,camera:this.project.camera},after={...before,...patch};if(JSON.stringify(before)===JSON.stringify(after))return;const apply=(state:typeof before)=>{this.project={...this.project,...state,updatedAt:Date.now()};this.mark('dirty');this.emit();};this.history.execute({name:'场景环境',apply:()=>apply(after),revert:()=>apply(before)});this.emit();}
  /** Looking around is not an edit: the viewpoint is worth saving, but it must not push a page of real work out of the undo stack. */
  camera(patch:Partial<Project['camera']>){const before=this.project.camera,after={...before,...patch};if(JSON.stringify(before)===JSON.stringify(after))return;this.project={...this.project,camera:after,updatedAt:Date.now()};this.mark('dirty');this.emit();}
  modelView(view:NonNullable<Project['modelView']>){if(JSON.stringify(view)===JSON.stringify(this.project.modelView))return;this.project={...this.project,modelView:view,updatedAt:Date.now()};this.mark('dirty');this.emit();}
  captureStrokes(strokes:readonly Stroke[],mode:'CANVAS_DRAW'|'SPATIAL_DRAW'){
    const type=mode==='CANVAS_DRAW'?'stroke2d':'stroke3d';const old=this.project.objects.filter(o=>o.type===type);
    // A locked original is the source a solid was made from; emptying the ink
    // must not take it along, or undoing "Make 3D" would have nothing to unlock.
    const locked=old.filter(o=>o.locked),lockedStrokes=new Set(locked.map(o=>o.stroke));
    // A partial erase replaces the immutable Stroke value but not the artwork
    // object. Match by its stable per-mode stroke id so its transform, layer state,
    // parent group and material survive clipping and undo/redo.
    const existing=new Map(old.filter(o=>!o.locked&&o.stroke).map(o=>[o.stroke!.id,o]));
    const next=strokes.filter(s=>!lockedStrokes.has(s)).map(s=>{const previous=existing.get(s.id);return previous?(previous.stroke===s?previous:{...previous,stroke:s,updatedAt:Date.now()}):({id:createId(),type,name:`${type==='stroke2d'?'2D':'3D'} stroke ${s.id}`,visible:true,locked:false,transform:identityTransform(),material:{preset:s.material,color:s.color},createdAt:Date.now(),updatedAt:Date.now(),modeSource:mode,stroke:s} satisfies SceneObject);});
    const merged=[...next,...locked];
    if(old.length===merged.length&&old.every((o,i)=>o===merged[i]))return;
    this.change('绘画',[...this.project.objects.filter(o=>o.type!==type),...merged]);
  }
}
export const workspace=new Workspace();
