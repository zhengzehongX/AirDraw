import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {importModel} from '../model/importModel';
import {disposeObject} from './geometry';
import {workspace} from './workspace';
import {identityTransform,type SceneObject} from './types';
import * as THREE from 'three';
import {createId} from '../utils/id';
/** Persist self-contained GLB data, never a session-only blob URL. */
export async function importProjectModel(files:FileList,signal?:AbortSignal){
 const projectId=workspace.project.id;
 const resource=await importModel(files);let object;
 try{object=(await new GLTFLoader().loadAsync(resource.url)).scene;const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()).length();object.position.sub(box.getCenter(new THREE.Vector3()));const normalized=new THREE.Group();normalized.add(object);normalized.scale.setScalar(4/Math.max(size,.001));const binary=await new GLTFExporter().parseAsync(normalized,{binary:true});if(!(binary instanceof ArrayBuffer))throw new Error('模型序列化失败');if(signal?.aborted||workspace.project.id!==projectId)return;let text='';const bytes=new Uint8Array(binary);for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));const assetId=createId();const name=Array.from(files).find(f=>/\.(glb|gltf)$/i.test(f.name))?.name??'Model';const count=workspace.project.objects.filter(o=>o.type==='model'&&!o.parentId).length;const spawn:[number,number,number]=[Math.ceil(count/2)*3.6*(count%2?1:-1),0,0];const now=Date.now();const model:SceneObject={id:createId(),type:'model',name,visible:true,locked:false,transform:{...identityTransform(),position:spawn},material:{preset:'candy',color:'#ffffff'},createdAt:now,updatedAt:now,modeSource:'MODEL_CONTROL',assetId};workspace.project={...workspace.project,assets:{...workspace.project.assets,[assetId]:{name,data:'data:model/gltf-binary;base64,'+btoa(text)}}};workspace.change('导入模型',[...workspace.project.objects,model]);workspace.selection=[model.id];workspace.emit();
 }finally{if(object)disposeObject(object);resource.dispose();}
}
