import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {workspace} from '../../project/workspace';
import {buildObject,disposeObject} from '../../project/geometry';
import type {SceneObject} from '../../project/types';
import type {DrawEngine} from '../../engine/DrawEngine';
import {appMode} from '../../app/AppMode';
import {inputRouter} from '../../interaction/InputRouter';
import {modelController} from '../../model/modelController';
import {ancestors,byId,isEditable} from '../../project/objectGraph';
import {BimanualTransform,palmOrientation} from '../../model/handTransform';
function ObjectTree({object,objects}:{object:SceneObject;objects:SceneObject[]}){
 const children=objects.filter(o=>o.parentId===object.id);
 if(object.type==='group')return <group visible={object.visible} position={object.transform.position} quaternion={object.transform.rotation} scale={object.transform.scale} userData={{sceneObjectId:object.id}}>{children.map(o=><ObjectTree key={o.id} object={o} objects={objects}/>)}</group>;
 return <ProjectObject object={object}/>;
}
function ProjectObject({object}:{object:SceneObject}){
 const selected=ancestors(object,workspace.project.objects).some(o=>workspace.selection.includes(o.id));
 const [root,setRoot]=useState<THREE.Group|null>(null),group=useRef<THREE.Group>(null),started=useRef(performance.now());
 useEffect(()=>{let disposed=false,resource:THREE.Group|undefined;void buildObject(object,workspace.project,selected?'export':'interactive').then(r=>{if(disposed)disposeObject(r);else{resource=r;setRoot(r);}}).catch(e=>console.error('[Project object]',e));return()=>{disposed=true;if(resource)disposeObject(resource);};},[object,selected]);
 useFrame(()=>{if(!group.current)return;const mode=appMode.getSnapshot().target,weight=appMode.weights().MODEL_CONTROL;group.current.visible=object.visible&&(object.type==='solid'||object.type==='model'||mode==='MODEL_CONTROL');if(root&&object.conversion){const u=Math.min(1,(performance.now()-started.current)/800);root.position.z=object.transform.position[2]-.6*Math.pow(1-u,3);}if(group.current.visible&&mode==='MODEL_CONTROL')group.current.scale.setScalar(.85+.15*weight);});
 return <group ref={group}>{root&&<primitive object={root} dispose={null}/>}</group>;
}
export function ProjectStage({engine}:{engine:DrawEngine}){
 useSyncExternalStore(workspace.subscribe,workspace.getSnapshot);const root=useRef<THREE.Group>(null);const {camera}=useThree();
 const ray=useRef(new THREE.Raycaster()),plane=useRef(new THREE.Plane());
 const cue=useRef<THREE.Box3Helper|null>(null);useEffect(()=>()=>{cue.current?.geometry.dispose();if(cue.current?.material instanceof THREE.Material)cue.current.material.dispose();},[]);
 const pair=useRef(new BimanualTransform()),palmStart=useRef<THREE.Quaternion|null>(null);
 const memory=useRef({down:false,id:'',offset:new THREE.Vector3(),start:undefined as SceneObject|undefined,hand:'',second:'',wrist:new THREE.Vector3(),epoch:-1,inputEpoch:-1,startScale:1,distance:0,angle:0,frozen:false});
 useFrame((state,dt)=>{
  const m=memory.current,hand=engine.tracking.primary,cursor=engine.cursorPlanePoint();
  modelController.diagnostic={down:m.down,id:m.id,frozen:m.frozen,epoch:m.epoch,inputEpoch:m.inputEpoch,currentEpoch:engine.tracking.epoch,currentInputEpoch:inputRouter.epoch,mayTransform:inputRouter.mayTransform,contact:engine.contact.state};
  const cancel=()=>{if(m.start&&m.id){const g=root.current?byId(root.current,m.id):undefined;if(g){const transform={position:g.position.toArray() as [number,number,number],rotation:g.quaternion.toArray() as [number,number,number,number],scale:g.scale.toArray() as [number,number,number]};if(JSON.stringify(transform)!==JSON.stringify(m.start.transform))workspace.patch(m.id,{transform},'对象变换');}}m.start=undefined;m.id='';modelController.targetId=null;};
  if(!root.current)return;
  if(cue.current){const selected=workspace.selection[0],item=selected?byId(root.current,selected):undefined;cue.current.visible=!!item&&inputRouter.mayTransform;if(item){cue.current.box.setFromObject(item,true);cue.current.updateMatrixWorld(true);}if(cue.current.material instanceof THREE.LineBasicMaterial){cue.current.material.transparent=true;cue.current.material.opacity=.32;}}
  if(m.epoch!==engine.tracking.epoch||m.inputEpoch!==inputRouter.epoch||!inputRouter.mayTransform||engine.debugInternals.locked||!hand||!cursor){cancel();m.down=false;m.epoch=engine.tracking.epoch;m.inputEpoch=inputRouter.epoch;return;}
  const contact=engine.contact.state==='HOLD';if(!contact){cancel();m.down=false;m.frozen=false;return;}
  const wrist=new THREE.Vector3(hand.landmarks[0].x,hand.landmarks[0].y,hand.landmarks[0].z);
  if(m.hand&&m.hand!==hand.handedness||m.start&&m.wrist.distanceTo(wrist)>.22){cancel();m.frozen=true;}
  m.hand=hand.handedness;m.wrist.copy(wrist);if(m.frozen)return;
  const screen=engine.toScreenPoint(cursor);ray.current.setFromCamera(new THREE.Vector2(screen.x/state.size.width*2-1,1-screen.y/state.size.height*2),camera);
  if(!m.down){
   const hit=ray.current.intersectObject(root.current,true).find(h=>h.object instanceof THREE.Mesh);let object:THREE.Object3D|undefined=hit?.object;while(object&&!object.userData.sceneObjectId)object=object.parent??undefined;
   const id=object?.userData.sceneObjectId as string|undefined;let o=workspace.project.objects.find(o=>o.id===id);m.down=true;
   modelController.diagnostic={...modelController.diagnostic,hitId:id,hit:hit?.object.name,editable:o?isEditable(o,workspace.project.objects):false};
   if(!o||!isEditable(o,workspace.project.objects)||!object)return;
   const parent=ancestors(o,workspace.project.objects).at(-1)!;if(parent.type==='group'){o=parent;object=byId(root.current,o.id);if(!object)return;}
   const second=engine.tracking.secondary,points=second?.landmarks;const multi=!!points&&[8,12,16,20].every(i=>Math.hypot(points[i].x-points[0].x,points[i].y-points[0].y)>Math.hypot(points[i-2].x-points[0].x,points[i-2].y-points[0].y)*1.15);
   workspace.select(o.id,multi);if(multi)return;modelController.targetId=o.id;m.id=o.id;m.start=o;m.startScale=object.scale.x;m.distance=0;m.second='';pair.current.reset();palmStart.current=palmOrientation(hand);
   plane.current.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),object.position);const projected=ray.current.ray.intersectPlane(plane.current,new THREE.Vector3());if(projected)m.offset.copy(object.position).sub(projected);
  }
  if(!m.start)return;const object=byId(root.current,m.id);if(!object)return;
  const tool=modelController.tool;
  if(tool==='Move'){const p=ray.current.ray.intersectPlane(plane.current,new THREE.Vector3());if(p){p.add(m.offset);if(modelController.snap==='grid')p.set(Math.round(p.x*2)/2,Math.round(p.y*2)/2,Math.round(p.z*2)/2);if(modelController.snap==='center')p.set(0,0,p.z);object.position.lerp(p,1-Math.exp(-20*dt));}}
  else if(tool==='Rotate'){const current=palmOrientation(hand),start=palmStart.current;if(current&&start){const delta=current.multiply(start.clone().invert()),angle=2*Math.acos(THREE.MathUtils.clamp(Math.abs(delta.w),0,1));if(angle>.035){if(modelController.snap==='angle'){const e=new THREE.Euler().setFromQuaternion(delta);e.set(...[e.x,e.y,e.z].map(v=>Math.round(v/(Math.PI/12))*Math.PI/12) as [number,number,number]);delta.setFromEuler(e);}object.quaternion.rotateTowards(delta.multiply(new THREE.Quaternion(...m.start.transform.rotation)),Math.min(.1,dt*2));}}}
  else {
   const second=engine.tracking.secondary;if(!second||!engine.tracking.secondaryContact){if(m.second){cancel();m.frozen=true;return;}return;}
   if(m.second&&m.second!==second.handedness){cancel();m.frozen=true;return;}m.second=second.handedness;
   const result=pair.current.update(hand,second,state.size.width/state.size.height,dt);if(!result){cancel();m.frozen=true;return;}
   const desired=THREE.MathUtils.clamp(m.startScale*result.scale,.2,4);object.scale.lerp(new THREE.Vector3(desired,desired,desired),1-Math.exp(-12*dt));object.quaternion.rotateTowards(new THREE.Quaternion().setFromAxisAngle(camera.getWorldDirection(new THREE.Vector3()),result.turn).multiply(new THREE.Quaternion(...m.start.transform.rotation)),Math.min(.1,dt*2));
  }
 });
 const objects=[...workspace.project.objects,...(workspace.preview?[workspace.preview]:[])];
 return <group ref={root}><box3Helper ref={cue} args={[new THREE.Box3(),0x8ea9bc]}/>{objects.filter(o=>!o.parentId&&(o.stroke||o.type==='model'||o.type==='group')).map(o=><ObjectTree key={o.id} object={o} objects={objects}/>)}</group>;
}
