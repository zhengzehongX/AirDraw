import * as THREE from 'three';
import type {Project,SceneObject} from './types';
import {identityTransform} from './types';
import {ancestors,worldMatrix} from './objectGraph';
/** Bake selected 2D paths into one conversion input; originals remain untouched. */
export function conversionSource(selection:readonly string[],project:Project):{object:SceneObject;sourceIds:readonly string[]}|null{
 const ids=selection.length?selection:[project.objects.filter(o=>o.type==='stroke2d').at(-1)?.id??''];
 const sources=project.objects.filter(o=>o.type==='stroke2d'&&o.stroke&&ancestors(o,project.objects).some(p=>ids.includes(p.id)));
 if(!sources.length)return null;
 const first=sources[0];if(sources.length===1&&!first.parentId&&!selection.some(id=>id!==first.id))return {object:first,sourceIds:ids};
 const segments=sources.flatMap(o=>{const matrix=worldMatrix(o,project.objects);return o.stroke!.segments.map(segment=>segment.map(p=>{const v=new THREE.Vector3((p.x-.5)*16,(.5-p.y)*9,p.z*.35).applyMatrix4(matrix);return{x:v.x/16+.5,y:.5-v.y/9,z:v.z/.35};}));});
 return {object:{...first,id:ids[0],name:sources.length+' paths',transform:identityTransform(),parentId:undefined,stroke:{...first.stroke!,segments}},sourceIds:ids};
}
