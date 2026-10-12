import {workspace} from './workspace';
import {createId} from '../utils/id';
import {identityTransform,type SceneObject} from './types';
let pending:Promise<void>|null=null;
/** Adopt the original bundled demo as a normal, persistent project object. */
export function ensureBuiltinModel(force=false){
 if((!force&&workspace.project.objects.length)||workspace.project.objects.some(o=>o.type==='model'&&workspace.project.assets[o.assetId??'']?.name==='airdraw-orb.glb'))return Promise.resolve();
 return pending??=(async()=>{const projectId=workspace.project.id,response=await fetch(import.meta.env.BASE_URL+'models/airdraw-orb.glb');if(!response.ok)throw new Error('示例模型加载失败');const bytes=new Uint8Array(await response.arrayBuffer());let content='';for(let i=0;i<bytes.length;i+=8192)content+=String.fromCharCode(...bytes.subarray(i,i+8192));if(projectId!==workspace.project.id||!force&&workspace.project.objects.length)return;const now=Date.now(),assetId=createId(),object:SceneObject={id:createId(),type:'model',name:'AirDraw Orb',visible:true,locked:false,transform:identityTransform(),material:{preset:'candy',color:'#b8d7ef'},modeSource:'MODEL_CONTROL',createdAt:now,updatedAt:now,assetId};workspace.project={...workspace.project,assets:{...workspace.project.assets,[assetId]:{name:'airdraw-orb.glb',data:'data:model/gltf-binary;base64,'+btoa(content)}}};workspace.change('示例模型',[...workspace.project.objects,object]);})().finally(()=>{pending=null;});
}
