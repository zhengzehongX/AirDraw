import * as THREE from 'three';
import type {DrawEngine} from '../engine/DrawEngine';
import {inputRouter} from '../interaction/InputRouter';
import {modelController as model} from './modelController';
import {BimanualTransform} from './handTransform';
import {workspace} from '../project/workspace';

/** Camera-only two-hand sessions: no document/object matrices are written. */
export class WorldNavigation {
  view={yaw:0,pitch:.3,distance:13.5,center:new THREE.Vector3()};
  private base={yaw:0,pitch:0,distance:13.5,center:new THREE.Vector3(),mid:new THREE.Vector2(),rotation:new THREE.Quaternion(),span:10};
  private pair=new BimanualTransform();
  private active=false;private blocked=false;private epoch=-1;private inputEpoch=-1;private revision=-1;private resetRevision=-1;private projectId='';
  end(){if(this.active&&this.projectId===workspace.project.id)workspace.modelView({yaw:this.view.yaw,pitch:this.view.pitch,distance:this.view.distance,center:this.view.center.toArray() as [number,number,number]});this.active=false;this.pair.reset();model.setWorldActive(false);}
  focus(center:THREE.Vector3,distance:number){this.end();this.view.center.copy(center);this.view.distance=THREE.MathUtils.clamp(distance,4,35);workspace.modelView({...this.view,center:this.view.center.toArray() as [number,number,number]});}
  update(engine:DrawEngine,camera:THREE.PerspectiveCamera,dt:number,enabled:boolean){
    const a=engine.tracking.primary,b=engine.tracking.secondary;
    const primaryDown=engine.contact.state==='HOLD',secondDown=engine.tracking.secondaryContact;
    const both=primaryDown&&secondDown&&!!a&&!!b;
    if(this.projectId!==workspace.project.id){this.end();this.projectId=workspace.project.id;const saved=workspace.project.modelView;this.view={yaw:saved?.yaw??0,pitch:saved?.pitch??.3,distance:saved?.distance??13.5,center:new THREE.Vector3(...(saved?.center??[0,0,0]))};}
    if(this.revision!==model.worldRevision){this.end();this.blocked=primaryDown||secondDown;this.revision=model.worldRevision;}
    if(this.resetRevision!==model.worldResetRevision){if(this.resetRevision>=0){this.view={yaw:0,pitch:.3,distance:13.5,center:new THREE.Vector3()};workspace.modelView({...this.view,center:[0,0,0]});}this.resetRevision=model.worldResetRevision;}
    if(this.epoch!==engine.tracking.epoch||this.inputEpoch!==inputRouter.epoch){this.end();this.blocked=primaryDown||secondDown;this.epoch=engine.tracking.epoch;this.inputEpoch=inputRouter.epoch;}
    if(!primaryDown&&!secondDown)this.blocked=false;
    if(!enabled||!inputRouter.mayTransform||engine.debugInternals.locked||document.hidden||performance.now()-engine.frame.at>220){if(this.active)this.blocked=true;this.end();return this.view;}
    if(!both){if(this.active){this.end();this.blocked=true;}return this.view;}
    if(this.blocked)return this.view;
    const rawX=(a.landmarks[8].x+b.landmarks[8].x)/2;
    const mid=new THREE.Vector2(engine.mirrored?1-rawX:rawX,1-(a.landmarks[8].y+b.landmarks[8].y)/2);
    if(!this.active){this.pair.reset();this.base={...this.view,center:this.view.center.clone(),mid:mid.clone(),rotation:camera.quaternion.clone(),span:2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.distanceTo(this.view.center)};this.active=true;model.release();model.setWorldActive(true);}
    const result=this.pair.update(a,b,camera.aspect,Math.min(dt,.05));
    if(!result){this.end();this.blocked=true;return this.view;}
    const delta=mid.sub(this.base.mid);
    if(Math.abs(delta.x)<.003)delta.x=0;if(Math.abs(delta.y)<.003)delta.y=0;
    const blend=1-Math.exp(-16*Math.min(dt,.05));
    const ratio=Math.abs(result.scale-1)<.025?1:result.scale;
    const targetDistance=THREE.MathUtils.clamp(this.base.distance/ratio,4,35);
    this.view.distance=THREE.MathUtils.lerp(this.view.distance,targetDistance,blend);
    // Two hands directly express the whole viewport transform: separating or
    // bringing them together zooms, translating the pair pans, and rotating the
    // line between them orbits. No secondary tool selection steals a hand session.
    const displayedTurn=engine.mirrored?-result.turn:result.turn;
    const yaw=THREE.MathUtils.clamp(this.base.yaw-displayedTurn,-Math.PI*2,Math.PI*2);
    const pitch=THREE.MathUtils.clamp(this.base.pitch+delta.y*Math.PI,-1.25,1.25);
    this.view.yaw+=THREE.MathUtils.clamp((yaw-this.view.yaw)*blend,-dt*2.5,dt*2.5);
    this.view.pitch+=THREE.MathUtils.clamp((pitch-this.view.pitch)*blend,-dt*2.5,dt*2.5);
    const span=this.base.span;
    const offset=new THREE.Vector3(-delta.x*span*camera.aspect,0,0).applyQuaternion(this.base.rotation);
    this.view.center.lerp(this.base.center.clone().add(offset).clampLength(0,50),blend);
    return this.view;
  }
}
