import {identityTransform,newProject,type Project,type SceneObject} from './types';
import {createId} from '../utils/id';
import type {Stroke} from '../types/drawing';
import type {Artwork} from '../storage/artworks';
let database:Promise<IDBDatabase>|undefined;
const db=()=>{
 if(database)return database;
 const pending=new Promise<IDBDatabase>((resolve,reject)=>{
  const r=indexedDB.open('airdraw-projects',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('snapshots',{keyPath:'id'});};
  r.onsuccess=()=>{const connection=r.result;connection.onversionchange=()=>{connection.close();if(database===pending)database=undefined;};resolve(connection);};
  r.onerror=()=>reject(r.error);
 });
 database=pending;void pending.catch(()=>{if(database===pending)database=undefined;});return pending;
};
export function migrateProject(raw:unknown):Project {
  if(!raw||typeof raw!=='object')throw new Error('无效工程');
  const value=raw as Record<string,unknown>;if(Number(value.schemaVersion)>2)throw new Error('工程版本过新，请保留文件并升级 AirDraw');
  const base=newProject(typeof value.name==='string'?value.name:'Imported');
  let objects=Array.isArray(value.objects)?value.objects:[];
  if(!objects.length&&Array.isArray(value.strokes))objects=(value.strokes as Stroke[]).map((stroke,index)=>({id:`legacy-${index}`,type:stroke.mode==='canvas'?'stroke2d':'stroke3d',name:`Stroke ${index+1}`,stroke}));
  if(objects.length>10000)throw new Error('工程对象数量超过限制');
  const ids=new Set<string>();let pointCount=0;
  const normalized=objects.map((o:Partial<SceneObject>)=>{
    if(!o||typeof o.id!=='string'||ids.has(o.id)||!['stroke2d','stroke3d','solid','model','group','light','camera','background'].includes(o.type??''))throw new Error('对象损坏');ids.add(o.id);
    const t=o.transform??identityTransform();if(![t.position,t.rotation,t.scale].every(Array.isArray)||t.position.length!==3||t.rotation.length!==4||t.scale.length!==3||[...t.position,...t.rotation,...t.scale].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||t.scale.some(v=>v<=0))throw new Error('变换数据损坏');
    if(Math.hypot(...t.rotation)<.0001)throw new Error('旋转数据损坏');
    if(o.stroke){if(!Array.isArray(o.stroke.segments)||!Number.isFinite(o.stroke.width)||o.stroke.width<=0||o.stroke.width>256)throw new Error('笔迹损坏');for(const s of o.stroke.segments){if(!Array.isArray(s)||s.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>10000))throw new Error('轨迹损坏');pointCount+=s.length;}if(pointCount>1000000)throw new Error('轨迹数量过多');}
    else if(o.type==='stroke2d'||o.type==='stroke3d')throw new Error('笔迹对象缺少笔迹数据');
    if(o.conversion&&(!['Extrude','Tube','Outline','Relief'].includes(o.conversion.method)||![o.conversion.depth,o.conversion.bevel,o.conversion.smooth].every(Number.isFinite)||o.conversion.depth<=0||o.conversion.depth>8||o.conversion.bevel<0||o.conversion.bevel>1||o.conversion.smooth<0||o.conversion.smooth>1))throw new Error('转换参数损坏');
    return{visible:true,locked:false,name:'Object',createdAt:Date.now(),updatedAt:Date.now(),material:{preset:'candy',color:'#22d3ee'},modeSource:'SPATIAL_DRAW',...o,transform:t} as SceneObject;
  });
  for(const o of normalized){const seen=new Set([o.id]);let parent=o.parentId;while(parent){if(seen.has(parent))throw new Error('编组存在循环');seen.add(parent);parent=normalized.find(o=>o.id===parent)?.parentId;}}
  const assets=value.assets&&typeof value.assets==='object'?value.assets as Project['assets']:{};
  for(const asset of Object.values(assets)){if(!asset||typeof asset.name!=='string'||typeof asset.data!=='string'||!/^data:(model\/gltf-binary|application\/octet-stream);base64,/.test(asset.data)||asset.data.length>140*1024*1024)throw new Error('模型资源必须是工程内嵌 GLB');}
  const camera=value.camera as Project['camera']|undefined;if(camera&&![camera.yaw,camera.pitch,camera.distance].every(Number.isFinite))throw new Error('相机数据损坏');
  const modelView=value.modelView as Project['modelView'];
  if(modelView&&(!Array.isArray(modelView.center)||modelView.center.length!==3||![modelView.yaw,modelView.pitch,modelView.distance,...modelView.center].every(Number.isFinite)||modelView.distance<4||modelView.distance>35||Math.abs(modelView.pitch)>1.25||modelView.center.some(n=>Math.abs(n)>10000)))throw new Error('模型视角数据损坏');
  const canvasView=value.canvasView as Project['canvasView'];
  if(canvasView&&(![canvasView.zoom,canvasView.offsetX,canvasView.offsetY].every(Number.isFinite)||canvasView.zoom<.2||canvasView.zoom>8))throw new Error('画布视图损坏');
  return {...base,id:typeof value.id==='string'?value.id:base.id,name:typeof value.name==='string'?value.name.slice(0,60):typeof value.title==='string'?value.title.slice(0,60):base.name,createdAt:typeof value.createdAt==='number'?value.createdAt:base.createdAt,updatedAt:typeof value.updatedAt==='number'?value.updatedAt:base.updatedAt,theme:value.theme==='night'?'night':'day',paper:value.paper==='dark'||value.paper==='transparent'?value.paper:'white',schemaVersion:2,objects:normalized,assets,modelView:modelView?{...modelView,center:[...modelView.center]}:undefined,camera:camera??base.camera,canvasView:canvasView?{...canvasView}:{zoom:1,offsetX:0,offsetY:0},thumbnail:typeof value.thumbnail==='string'&&value.thumbnail.startsWith('data:image/')?value.thumbnail:null};
}
/**
 * Gallery pieces predate the project store. Opening one has to produce a project
 * of its own — loading it into the live one would let the next autosave overwrite
 * whatever the user was working on.
 */
export function projectFromArtwork(piece:Artwork):Project{
  const now=Date.now();
  const objects=piece.strokes.map((stroke):SceneObject=>{
    const canvas=(stroke.mode??piece.mode)==='canvas';
    return{id:createId(),type:canvas?'stroke2d':'stroke3d',name:`${canvas?'2D':'3D'} stroke ${stroke.id}`,visible:true,locked:false,transform:identityTransform(),material:{preset:stroke.material,color:stroke.color},createdAt:piece.createdAt,updatedAt:now,modeSource:canvas?'CANVAS_DRAW':'SPATIAL_DRAW',stroke};
  });
  return migrateProject({...newProject(piece.title),name:piece.title,theme:piece.theme,paper:piece.paper??'white',camera:piece.camera,thumbnail:piece.thumbnail,createdAt:piece.createdAt,objects});
}
export async function saveProject(project:Project){const valid=migrateProject(project),d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction(['projects','snapshots'],'readwrite'),store=tx.objectStore('projects'),old=store.get(valid.id);old.onsuccess=()=>{let snapshot=valid;try{if(old.result)snapshot=migrateProject(old.result);}catch{/* Keep the new validated state when no previous valid state exists. */}tx.objectStore('snapshots').put(snapshot);store.put(valid);};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new Error('保存未提交'));});}
async function read<T>(store:string,key?:string):Promise<T>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,'readonly'),r=key?tx.objectStore(store).get(key):tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export const listProjects=()=>read<Project[]>('projects');
export async function openProject(id:string,recovery=false){return migrateProject(await read(recovery?'snapshots':'projects',id));}
export async function deleteProject(id:string){const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction(['projects','snapshots'],'readwrite');tx.objectStore('projects').delete(id);tx.objectStore('snapshots').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
