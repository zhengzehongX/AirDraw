import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {outline} from '../rendering/canvas2d/freehand';
import {planeToWorld,brushRadius} from '../rendering/three/plane';
import type {Project,SceneObject} from './types';
import {isVisible} from './objectGraph';
import {MATERIAL_PRESETS} from '../rendering/three/materials';
import {textShapes} from './textShapes';
export function disposeObject(object:THREE.Object3D){const resources=new Set<{dispose:()=>void}>();object.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)resources.add(v);});}}});resources.forEach(r=>r.dispose());}
export async function buildObject(o:SceneObject,project:Project,detail:'interactive'|'export'='interactive'):Promise<THREE.Group>{
 const root=new THREE.Group();root.name=o.name;root.userData.sceneObjectId=o.id;
 const preset=MATERIAL_PRESETS.find(p=>p.id===o.material.preset);
 const material=new THREE.MeshPhysicalMaterial({...preset?.props,color:o.material.color,emissive:o.material.preset==='neon'?o.material.color:'#000000'});
 try{
 if(o.type==='model'){
  material.dispose();const asset=project.assets[o.assetId??''];if(!asset)throw new Error('模型引用缺失');const gltf=await new GLTFLoader().loadAsync(asset.data);root.add(gltf.scene);
 }else if(o.text&&o.type==='solid'){
  const shapes=textShapes(o.text);if(!shapes.length){material.dispose();throw new Error('当前系统字体未生成有效文字轮廓');}
  root.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shapes,{depth:o.conversion?.depth??.5,bevelEnabled:(o.conversion?.bevel??0)>0,bevelSize:o.conversion?.bevel??0,bevelThickness:o.conversion?.bevel??0,bevelSegments:2}),material));
 }else if(o.stroke){
  for(const segment of o.stroke.segments){
   if(segment.length<2)continue;const points=segment.map(p=>new THREE.Vector3(...planeToWorld(p)));
   let geometry:THREE.BufferGeometry;
   const method=o.conversion?.method;
   if(method==='Extrude'||method==='Relief'){
    if(points.length<4||points[0].distanceTo(points.at(-1)!)>.7)throw new Error('请先选择封闭图形，或使用 Tube');
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,p.y)));
    geometry=new THREE.ExtrudeGeometry(shape,{depth:o.conversion!.depth,bevelEnabled:o.conversion!.bevel>0,bevelSize:o.conversion!.bevel,bevelThickness:o.conversion!.bevel,bevelSegments:2,steps:1,curveSegments:12});
    if(method==='Relief'){
     geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),position=geometry.getAttribute('position');
     for(let i=0;i<position.count;i++){const r=Math.min(1,Math.hypot((position.getX(i)-center.x)/Math.max(.01,size.x/2),(position.getY(i)-center.y)/Math.max(.01,size.y/2)));position.setZ(i,position.getZ(i)*(.25+.75*Math.pow(1-r,2)));}position.needsUpdate=true;
    }
   }else if(o.type==='stroke2d'&&!method){const shape=new THREE.Shape(outline(segment,o.stroke).map(p=>new THREE.Vector2(p[0]/100-8,4.5-p[1]/100)));geometry=new THREE.ShapeGeometry(shape);}
   else {geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'catmullrom',o.conversion?.smooth??.5),Math.round(Math.min(detail==='export'?320:96,Math.max(12,points.length*(detail==='export'?2:.75)))),method?Math.max(.015,(o.conversion?.depth??.1)*(method==='Outline'?.15:.3)):brushRadius(o.stroke.width),detail==='export'?12:6,false);}
   geometry.computeVertexNormals();geometry.computeBoundingSphere();root.add(new THREE.Mesh(geometry,material));
  }
  if(!root.children.length)material.dispose();
 }else material.dispose();
 const t=o.transform;root.position.set(...t.position);root.quaternion.set(...t.rotation);root.scale.set(...t.scale);root.visible=o.visible;return root;
 }catch(error){disposeObject(root);material.dispose();throw error;}
}
export async function buildProject(project:Project){const root=new THREE.Group();const map=new Map<string,THREE.Group>();try{let count=0;for(const o of project.objects){if(['light','camera','background'].includes(o.type)||!isVisible(o,project.objects))continue;map.set(o.id,await buildObject(o,project,'export'));if(++count%8===0)await new Promise(requestAnimationFrame);}for(const o of project.objects){const g=map.get(o.id);if(g)(map.get(o.parentId??'')??root).add(g);}root.updateMatrixWorld(true);return root;}catch(e){map.forEach(disposeObject);throw e;}}
