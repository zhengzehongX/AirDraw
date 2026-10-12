import type { Landmark, TrackedHand } from '../../types/hand';

export type AdaptivePinchState = 'OPEN' | 'APPROACHING' | 'PINCHED' | 'HOLDING' | 'RELEASING';
export type ContactState = 'OPEN' | 'NEAR' | 'CONTACT' | 'HOLD' | 'RELEASE';
export type ContactProfile = { contact: number; release: number; projection: number; z: number; calibratedAt?: string; calibrationHand?:'Left'|'Right'; palmScale?: number; contactDistance?: number; releaseDistance?: number; dominantHand?: 'Left'|'Right'|'auto'; pointerSensitivity?:number; camera?:{deviceId?:string;width?:number;height?:number}; version?:number };
/**
 * Compatible profile shape for older storage. Uncalibrated entry uses a .24 image/palm
 * ratio and a 9mm world-distance seed below; calibrated measurements replace those seeds.
 */
export const DEFAULT_CONTACT: ContactProfile = { contact: .30, release: .60, projection: .30, z: .16 };

/** Entry score and preview gates. Release uses sustained separation, never one score dip. */
export const CONTACT_SCORE = { enter: .75, exit: .45, near: .35, confirmFrames: 2 };

export type ContactMetrics = {
  state: ContactState;
  pinchState?:AdaptivePinchState; tipDistance2D?:number; worldDistance?:number; enterThreshold?:number; releaseThreshold?:number; releaseFrames?:number;
  d2Normalized: number; d3Normalized: number; zGap: number;
  /** 0..1 evidence that the two fingers are together. `state` is derived from this. */
  contactScore: number;
  score2D: number; score3D: number; weight2D: number; weight3D: number;
  /** How much this frame's world depth can be believed (0 = pure noise). */
  depthTrust: number;
  distalReliability?:number;
  /** Depth says these two tips are not together, and the reading has held still long enough to trust. */
  depthVeto: boolean;
  enterScore: number; exitScore: number; radius: number;
  stableFrames: number; approachSpeed: number; palmScale?: number;
};

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** How far inside the [tight, loose] band a distance sits — 1 means "as close as it gets". */
const ramp = (value: number, tight: number, loose: number) => clamp01((loose - value) / Math.max(1e-4, loose - tight));

export function loadContactProfile(): ContactProfile {
  try {
    const p = JSON.parse(localStorage.getItem('airdraw-pinch-calibration') ?? 'null');
    const personal=typeof p?.calibratedAt==='string'&&Number.isFinite(Date.parse(p.calibratedAt));
    if (p && [p.contact,p.release,p.projection,p.z].every(Number.isFinite) && p.contact >= .06 && p.contact <= (personal?.7:.36) && p.release > p.contact && p.release <= (personal?1.05:.6) && p.projection>=.05 && p.projection<=.45 && p.z>=.02 && p.z<=(personal?.65:.25)) return p;
  } catch { /* Storage is optional; conservative defaults remain available. */ }
  return { ...DEFAULT_CONTACT };
}

/**
 * Is this hand pinching?
 *
 * **The 3D distance is no longer a veto.** A monocular camera infers depth, and the world
 * landmarks it returns for two fingertips that are actually touching routinely disagree by a
 * third of a palm width. The previous gate AND-ed `d3 ≤ threshold` with everything else, so a
 * real pinch could sit in "指尖接近" forever — the single most reported failure of this app.
 *
 * So the detector now weighs evidence into one score: the 2D image distance between the tips is
 * the primary signal, the 3D distance is auxiliary, and **how much the 3D term is trusted follows
 * how steady it has been** — when depth is thrashing, weight moves to 2D instead of blocking.
 * Two short rules cover the remaining cases: tips that overlap in the image while converging and
 * holding steady confirm even with a bad Z, and tips that merely overlap while clearly separated
 * in depth stay NEAR.
 *
 * Everything is normalised by the current palm width, so stepping towards or away from the camera
 * changes nothing. Entry is confirmed over a short window; release needs four separated
 * observations over at least 100ms. A latched pinch survives isolated depth/confidence noise.
 */
export class AdaptivePinchDetector {
 reason='请让整只手进入画面';
 metrics:ContactMetrics={state:'OPEN',pinchState:'OPEN',d2Normalized:Infinity,d3Normalized:Infinity,zGap:Infinity,contactScore:0,score2D:0,score3D:0,weight2D:.65,weight3D:.35,depthTrust:1,depthVeto:false,enterScore:CONTACT_SCORE.enter,exitScore:CONTACT_SCORE.exit,radius:0,stableFrames:0,approachSpeed:0};
 private active=false;private previous=Infinity;private lastAt=0;private validAt=0;private speed=0;
 private streak=0;private entryAt=0;private releases=0;private releaseAt=0;private assist=0;
 private identity:string|null=null;private lastZ=0;private filteredScore=0;
 constructor(public profile:ContactProfile=loadContactProfile(),private confirmFrames=CONTACT_SCORE.confirmFrames){}
 get isActive(){return this.active;}
 get value(){return Number.isFinite(this.metrics.d3Normalized)?this.metrics.d3Normalized:null;}
 get pinchStrength(){return this.metrics.contactScore;}
 setAssist(amount:number){const next=Number.isFinite(amount)?clamp01(amount):0;if(next!==this.assist){this.assist=next;this.reset();}}
 reset(){const held=this.active;this.active=false;this.streak=0;this.releases=0;this.previous=Infinity;this.lastAt=0;this.validAt=0;this.identity=null;this.filteredScore=0;this.speed=0;Object.assign(this.metrics,{state:held?'RELEASE':'OPEN',pinchState:held?'RELEASING':'OPEN',stableFrames:0,releaseFrames:0,contactScore:0});}
 update(hand:TrackedHand|null,at=performance.now(),aspect=16/9,identity=hand?.handedness??''):boolean{
  const m=this.metrics,n=hand?.landmarks,w=hand?.worldLandmarks;
  if(this.identity!==null&&hand&&this.identity!==identity){this.reset();this.identity=identity;this.reason='重新定位主手';return false;}
  const valid=!!hand&&!!n&&n.length===21&&n.every(p=>[p.x,p.y,p.z].every(Number.isFinite))&&hand.score>=.45;
  if(!valid){
   if(this.active&&at-this.validAt<=180){this.reason='已接触';return true;}
   this.reset();this.reason='请让主手进入画面';return false;
  }
  this.identity=identity;this.validAt=at;
  const palm2=Math.hypot((n[5].x-n[17].x)*aspect,n[5].y-n[17].y);
  if(palm2<.008){if(this.active&&at-this.lastAt<150)return true;this.reset();this.reason='让整只手正对摄像头';return false;}
  const world=!!w&&w.length===21&&w.every(p=>[p.x,p.y,p.z].every(Number.isFinite));
  const palm=world?distance(w[5],w[17]):0;
  const worldOK=world&&palm>=.005;
  const raw2=Math.hypot((n[4].x-n[8].x)*aspect,n[4].y-n[8].y);
  m.tipDistance2D=raw2;m.d2Normalized=raw2/palm2;
  m.worldDistance=worldOK?distance(w[4],w[8]):Infinity;m.palmScale=worldOK?palm:undefined;
  m.d3Normalized=worldOK?m.worldDistance/palm:Infinity;m.zGap=worldOK?Math.abs(w[4].z-w[8].z)/palm:Infinity;
  const dt=this.lastAt?Math.max(.001,(at-this.lastAt)/1000):.033;
  const instant=Number.isFinite(this.previous)?(this.previous-m.d2Normalized)/dt:0;
  this.speed=this.speed*.55+instant*.45;m.approachSpeed=this.speed;
  this.previous=m.d2Normalized;this.lastAt=at;
  const widen=1+this.assist*.35;
  const enter2=(this.profile.calibratedAt?this.profile.projection:.24)*widen;
  const release2=enter2*1.9;
  const enter3=(this.profile.calibratedAt?this.profile.contact:palm>.005?.009/palm:.15)*widen;
  const release3=Math.max(enter3*1.9,this.profile.calibratedAt?this.profile.release:0);
  m.enterThreshold=enter2;m.releaseThreshold=release2;m.radius=enter3;
  // IP/DIP endpoint geometry estimates whether the inferred world tips are credible.
  // It only adjusts evidence weight; a malformed distal estimate never hard-blocks 2D input.
  const thumbDistal=worldOK?distance(w[3],w[4])/palm:0,indexDistal=worldOK?distance(w[7],w[8])/palm:0;
  m.distalReliability=worldOK&&thumbDistal>.02&&thumbDistal<.85&&indexDistal>.02&&indexDistal<.85?1:.6;
  m.depthTrust=worldOK?clamp01(1-Math.abs(m.zGap-this.lastZ)/.25)*m.distalReliability:0;this.lastZ=m.zGap;
  m.score2D=ramp(m.d2Normalized,enter2,release2);m.score3D=worldOK?ramp(m.d3Normalized,enter3,release3):0;
  m.weight3D=worldOK?.35*m.depthTrust:0;m.weight2D=1-m.weight3D;
  const fused=m.weight2D*m.score2D+m.weight3D*m.score3D;
  // Either strong observation can confirm. Inferred depth cannot veto a latched stroke.
  const strong2=m.score2D*.9+m.score3D*.1,strong3=worldOK?m.score3D*.9+m.score2D*.1:0;
  let score=Math.max(fused,strong2,strong3);
  m.depthVeto=worldOK&&m.depthTrust>.8&&(m.worldDistance??0)>Math.max(.025,(this.profile.contactDistance??0)*1.6)&&m.zGap>Math.max(.30,this.profile.calibratedAt?this.profile.z*1.6:0)&&m.d2Normalized<.18;
  if(m.depthVeto&&!this.active)score=Math.min(score,.55);
  if(hand.score<.65&&!this.active)score*=.85;
  if(!this.active&&m.d2Normalized>.7)score=Math.min(score,.4);
  if(!this.active&&this.speed < -3&&m.d2Normalized>enter2&&m.d3Normalized>enter3)score=Math.min(score,.65);
  this.filteredScore=this.filteredScore*.35+score*.65;m.contactScore=this.filteredScore;
  if(this.active){
   const separated=m.d2Normalized>release2&&(!worldOK||m.d3Normalized>release3||m.d2Normalized>release2*1.35)
     ||worldOK&&m.d3Normalized>release3*1.5&&m.d2Normalized>enter2*1.2;
   if(separated){if(!this.releases)this.releaseAt=at;this.releases++;}
   else this.releases=0;
   m.releaseFrames=this.releases;
   if(this.releases>=4&&at-this.releaseAt>=100){this.active=false;this.streak=0;this.filteredScore=0;m.state='RELEASE';m.pinchState='RELEASING';this.reason='已松开';return false;}
   m.state='HOLD';m.pinchState='HOLDING';this.reason='已接触';return true;
  }
  if(m.contactScore>=CONTACT_SCORE.enter){if(!this.streak)this.entryAt=at;this.streak++;}else this.streak=0;
  m.stableFrames=this.streak;m.releaseFrames=0;
  if(this.streak>=this.confirmFrames&&at-this.entryAt>=Math.min(40,(this.confirmFrames-1)*33)){this.active=true;m.state='HOLD';m.pinchState='PINCHED';this.reason='已接触';return true;}
  m.state=this.streak?'CONTACT':m.contactScore>=CONTACT_SCORE.near?'NEAR':'OPEN';
  m.pinchState=m.state==='OPEN'?'OPEN':'APPROACHING';this.reason=m.state==='OPEN'?'拇指和食指张开':'指尖接近';
  return false;
 }
}
/** Compatibility name for the existing engine and historical profile API. */
export class PinchContactDetector extends AdaptivePinchDetector {}
