import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { DrawEngine } from '../../engine/DrawEngine';
import { modelController as model } from '../../model/modelController';
import { appMode } from '../../app/AppMode';
import { inputRouter } from '../../interaction/InputRouter';
import type { TrackedHand } from '../../types/hand';
import {workspace} from '../../project/workspace';

function palmQuaternion(hand:TrackedHand){const w=hand.worldLandmarks;if(!w)return new THREE.Quaternion();const p=w.map(v=>new THREE.Vector3(v.x,-v.y,-v.z));const x=p[17].clone().sub(p[5]).normalize(),y=p[5].clone().add(p[17]).multiplyScalar(.5).sub(p[0]).normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();y.crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
function LoadedModel({url}:{url:string}){
  const gltf=useGLTF(url),cleanup=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const object=useMemo(()=>{const clone=gltf.scene.clone(true),box=new THREE.Box3().setFromObject(clone),size=box.getSize(new THREE.Vector3()).length();clone.position.sub(box.getCenter(new THREE.Vector3()));const root=new THREE.Group();root.add(clone);root.scale.setScalar(4/Math.max(size,.001));return root;},[gltf]);
  useEffect(()=>{clearTimeout(cleanup.current);return()=>{cleanup.current=setTimeout(()=>{const resources=new Set<{dispose:()=>void}>();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){resources.add(material);Object.values(material).forEach(v=>{if(v instanceof THREE.Texture)resources.add(v);});}}});resources.forEach(r=>r.dispose());useGLTF.clear(url);},0);};},[gltf,url]);
  return <primitive object={object}/>;
}
export function ModelStage({engine,url}:{engine:DrawEngine;url:string}){
  const root=useRef<THREE.Group>(null),body=useRef<THREE.Group>(null),hint=useRef<THREE.BoxHelper|null>(null),axes=useRef<THREE.Group>(null);
  const {camera}=useThree();
  const ray=useMemo(()=>new THREE.Raycaster(),[]),plane=useMemo(()=>new THREE.Plane(),[]);
  const memory=useRef({down:false,epoch:-1,inputEpoch:-1,offset:new THREE.Vector3(),startMatrix:new THREE.Matrix4(),grabPoint:new THREE.Vector3(),startPos:new THREE.Vector3(),startQ:new THREE.Quaternion(),startPalm:new THREE.Quaternion(),startScale:1,startY:0,twoDistance:0,twoAngle:0,openSince:0,lastWrist:new THREE.Vector3(),handedness:''});
  useEffect(()=>()=>{model.release();hint.current?.geometry.dispose();(hint.current?.material as THREE.Material|undefined)?.dispose();},[]);
  useFrame((state,dt)=>{
    if(!root.current||!body.current)return;
    const weight=appMode.weights().MODEL_CONTROL;
    root.current.visible=weight>.001;root.current.scale.setScalar(Math.max(.001,weight));root.current.position.z=-4*(1-weight);
    model.object=body.current;
    body.current.visible=!model.removed;
    if(workspace.project.objects.some(o=>o.visible&&(o.stroke||o.type==='model'||o.type==='group'))){body.current.visible=false;if(axes.current)axes.current.visible=false;if(hint.current)hint.current.visible=false;model.release();memory.current.down=false;return;}
    if(model.targetId)return;
    if(axes.current){axes.current.visible=model.selected&&!model.removed;axes.current.position.copy(model.position);axes.current.quaternion.copy(model.quaternion);}
    body.current.position.copy(model.position);body.current.quaternion.slerp(model.quaternion,1-Math.exp(-16*dt));body.current.scale.setScalar(model.scale);
    const m=memory.current,hand=engine.tracking.primary,cursor=engine.cursorPlanePoint();
    if(model.removed||m.epoch!==engine.tracking.epoch||m.inputEpoch!==inputRouter.epoch||!inputRouter.mayTransform||!hand||!cursor){model.release();m.down=false;m.epoch=engine.tracking.epoch;m.inputEpoch=inputRouter.epoch;return;}
    const contact=engine.contact.state==='HOLD',pointer=new THREE.Vector2((engine.toScreenPoint(cursor).x/state.size.width)*2-1,1-(engine.toScreenPoint(cursor).y/state.size.height)*2);
    if(engine.tracking.secondaryContact||model.worldActive){model.release();m.down=contact;return;}
    ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObject(body.current,true).find(h=>h.object.type==='Mesh');model.hovered=!!hit;
    const normal=camera.getWorldDirection(new THREE.Vector3());plane.setFromNormalAndCoplanarPoint(normal,model.position);
    const projected=ray.ray.intersectPlane(plane,new THREE.Vector3());
    const w=hand.landmarks[0];const wrist=new THREE.Vector3(w.x,w.y,w.z);
    const identityChanged=m.handedness!==hand.handedness||m.lastWrist.distanceTo(wrist)>.22;
    m.handedness=hand.handedness;m.lastWrist.copy(wrist);
    if(identityChanged){model.release();m.down=contact;return;}
    if(contact&&!m.down&&hit&&projected){body.current.updateWorldMatrix(true,false);m.startMatrix.copy(body.current.matrixWorld);m.grabPoint.copy(hit.point);model.selected=true;model.grabbed=true;m.offset.copy(model.position).sub(projected);m.startPos.copy(model.position);m.startQ.copy(model.quaternion);m.startPalm.copy(palmQuaternion(hand));m.startScale=model.scale;m.startY=cursor.y;m.twoDistance=0;model.emit();}
    if(!contact){model.release();m.twoDistance=0;}
    m.down=contact;
    if(model.grabbed&&contact&&projected){
      if(model.tool==='Move')model.position.copy(projected).add(m.offset);
      else if(model.tool==='Rotate'){
        const rotation=palmQuaternion(hand).multiply(m.startPalm.clone().invert());const angle=rotation.angleTo(new THREE.Quaternion());if(angle>.035){rotation.rotateTowards(new THREE.Quaternion(),Math.max(0,angle-1.5));model.quaternion.rotateTowards(rotation.multiply(m.startQ),Math.min(.12,dt*2.5));}
      } else {
        const second=engine.tracking.secondary;
        if(second&&engine.tracking.secondaryContact){const a=hand.landmarks[8],b=second.landmarks[8];const dx=(a.x-b.x)*state.size.width/state.size.height,dy=a.y-b.y;const distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
          if(!m.twoDistance){m.twoDistance=distance;m.twoAngle=angle;m.startScale=model.scale;m.startQ.copy(model.quaternion);}
          if(distance<.04){model.release();m.down=true;return;}
          if(m.twoDistance>.03){const desired=THREE.MathUtils.clamp(m.startScale*distance/m.twoDistance,.2,4);model.scale=THREE.MathUtils.lerp(model.scale,desired,Math.min(1,dt*14));let turn=angle-m.twoAngle;turn=Math.atan2(Math.sin(turn),Math.cos(turn));model.quaternion.rotateTowards(new THREE.Quaternion().setFromAxisAngle(normal,turn).multiply(m.startQ),Math.min(.12,dt*2.5));}
        }else{m.twoDistance=0;model.scale=THREE.MathUtils.clamp(m.startScale*Math.exp((m.startY-cursor.y)*2),.2,4);}
      }
    }
    if(!contact&&hand&&engine.debugInternals.gesture==='OPEN_PALM'){m.openSince||=performance.now();if(performance.now()-m.openSince>700){model.selected=false;model.emit();}}else m.openSince=0;
    if(engine.debugInternals.gesture==='FIST'){model.release();m.down=contact;}
    if(model.selected||model.hovered){if(!hint.current){hint.current=new THREE.BoxHelper(body.current,0x98bad4);hint.current.userData.excludeFromArtwork=true;root.current.add(hint.current);}hint.current.visible=true;hint.current.update();}else if(hint.current)hint.current.visible=false;
  });
  return <group ref={root}><group ref={body}><LoadedModel key={url} url={url}/></group><group userData={{excludeFromArtwork:true}} ref={axes} visible={false}>{[0,1,2].map(axis=><mesh key={axis} position={axis===0?[1.3,0,0]:axis===1?[0,1.3,0]:[0,0,1.3]}><boxGeometry args={axis===0?[.6,.012,.012]:axis===1?[.012,.6,.012]:[.012,.012,.6]}/><meshBasicMaterial color="#98bad4" transparent opacity={.5}/></mesh>)}</group><mesh position={[0,-3,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[3.2,64]}/><meshStandardMaterial color="#90a1b8" transparent opacity={.16}/><Edges color="#8193ab"/></mesh></group>;
}
