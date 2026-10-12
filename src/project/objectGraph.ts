import * as THREE from 'three';
import type {SceneObject} from './types';

/** Resolve ancestors without copying geometry or model data. */
export function ancestors(object:SceneObject,objects:readonly SceneObject[]){
 const chain:SceneObject[]=[object],seen=new Set([object.id]);let parent=object.parentId;
 while(parent){const next=objects.find(o=>o.id===parent);if(!next||seen.has(next.id))break;chain.push(next);seen.add(next.id);parent=next.parentId;}
 return chain;
}
export const isEditable=(o:SceneObject,objects:readonly SceneObject[])=>ancestors(o,objects).every(p=>p.visible&&!p.locked);
export const isVisible=(o:SceneObject,objects:readonly SceneObject[])=>ancestors(o,objects).every(p=>p.visible);
export function worldMatrix(o:SceneObject,objects:readonly SceneObject[]){
 const matrix=new THREE.Matrix4();for(const node of ancestors(o,objects).reverse()){const t=node.transform;matrix.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...t.position),new THREE.Quaternion(...t.rotation),new THREE.Vector3(...t.scale)));}return matrix;
}
export function byId(root:THREE.Object3D,id:string){let result:THREE.Object3D|undefined;root.traverse(o=>{if(o.userData.sceneObjectId===id)result=o;});return result;}
