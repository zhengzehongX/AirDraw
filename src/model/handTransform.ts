import * as THREE from 'three';
import type {TrackedHand as HandSample} from '../types/hand';

export function palmOrientation(hand:HandSample){
 const p=hand.worldLandmarks;if(!p)return null;
 const wrist=new THREE.Vector3(p[0].x,-p[0].y,-p[0].z),a=new THREE.Vector3(p[5].x,-p[5].y,-p[5].z),b=new THREE.Vector3(p[17].x,-p[17].y,-p[17].z);
 const x=b.clone().sub(a).normalize(),y=a.clone().add(b).multiplyScalar(.5).sub(wrist).normalize(),z=x.clone().cross(y).normalize();
 if(z.lengthSq()<.5)return null;y.copy(z).cross(x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
/** Unwrap every sample, reject jumps/crossing, and require a new grab on loss. */
export class BimanualTransform {
 private distance=0;private previousAngle=0;private turn=0;private filteredTurn=0;
 private wrists:THREE.Vector2[]=[];private labels:string[]=[];frozen=false;
 reset(){this.distance=0;this.turn=0;this.filteredTurn=0;this.wrists=[];this.labels=[];this.frozen=false;}
 update(a:HandSample,b:HandSample,aspect:number,dt:number){
  if(this.frozen)return null;
  const wrists=[a,b].map(h=>new THREE.Vector2(h.landmarks[0].x,h.landmarks[0].y)),labels=[a.handedness,b.handedness];
  const x=(a.landmarks[8].x-b.landmarks[8].x)*aspect,y=a.landmarks[8].y-b.landmarks[8].y,d=Math.hypot(x,y),angle=Math.atan2(y,x);
  if(d<.06||(this.labels.length&&labels.some((l,i)=>l!==this.labels[i]||wrists[i].distanceTo(this.wrists[i])>.18))){this.frozen=true;return null;}
  if(!this.distance){this.distance=d;this.previousAngle=angle;this.labels=labels;this.wrists=wrists;return {scale:1,turn:0};}
  const delta=Math.atan2(Math.sin(angle-this.previousAngle),Math.cos(angle-this.previousAngle));
  if(Math.abs(delta)>.65){this.frozen=true;return null;}
  this.turn+=delta;this.previousAngle=angle;this.wrists=wrists;
  const desired=Math.abs(this.turn)<.04?0:this.turn,blend=1-Math.exp(-12*Math.min(dt,.05));
  this.filteredTurn+=THREE.MathUtils.clamp((desired-this.filteredTurn)*blend,-2*dt,2*dt);
  return {scale:THREE.MathUtils.clamp(d/this.distance,.2,4),turn:this.filteredTurn};
 }
}
