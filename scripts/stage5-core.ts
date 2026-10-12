import { PinchContactDetector, DEFAULT_CONTACT } from '../src/utils/gesture/PinchContactDetector';
import { InputRouter } from '../src/interaction/InputRouter';
import { StrokeStore } from '../src/engine/StrokeStore';
import type { TrackedHand } from '../src/types/hand';
import { outline } from '../src/rendering/canvas2d/freehand';
let failures=0,checks=0;function check(name:string,ok:boolean){checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);}
function hand(gap:number,scale=1,z=0,side:'Left'|'Right'='Right'):TrackedHand{
 const w=Array.from({length:21},()=>({x:0,y:0,z:0}));w[5]={x:-.035*scale,y:0,z:0};w[17]={x:.035*scale,y:0,z:0};w[8]={x:0,y:-.06*scale,z:0};w[7]={x:0,y:-.035*scale,z:0};w[4]={x:gap*.07*scale,y:-.06*scale,z:z*.07*scale};w[3]={x:.025*scale,y:-.04*scale,z:0};
 return {worldLandmarks:w,landmarks:w.map(p=>({x:.5+p.x/scale,y:.5+p.y/scale,z:p.z})),handedness:side,score:.99};
}
for(const scale of [.55,1,1.7])for(const side of ['Left','Right'] as const){const detector=new PinchContactDetector({...DEFAULT_CONTACT});let t=0;
 for(let cycle=0;cycle<30;cycle++){for(let open=0;open<6;open++)detector.update(hand(.8,scale,0,side),t+=33);let fired=false;for(let i=0;i<10;i++)fired||=detector.update(hand(.32,scale,0,side),t+=33);check(`near does not contact scale ${scale} ${side} #${cycle+1}`,!fired);}
 // The regression this fixture exists to guard: fingertip pads touching measures ≈0.2 of palm
 // width, and the old default of 0.16 made that read as "near" — so nobody could draw.
 for(let cycle=0;cycle<30;cycle++){for(let open=0;open<6;open++)detector.update(hand(.8,scale,0,side),t+=33);let touched=false;for(let i=0;i<10;i++)touched||=detector.update(hand(.2,scale,0,side),t+=33);check(`pads touching contact scale ${scale} ${side} #${cycle+1}`,touched);}
 for(let cycle=0;cycle<30;cycle++){for(let open=0;open<6;open++)detector.update(hand(.8,scale,0,side),t+=33);let fired=false;for(let i=0;i<7;i++)fired=detector.update(hand(.1,scale,0,side),t+=33)||fired;check(`contact stable scale ${scale} ${side} #${cycle+1}`,fired);check('single noisy frame retains pinch',detector.update(hand(.4,scale,0,side),t+=33));for(let open=0;open<6;open++)detector.update(hand(.8,scale,0,side),t+=33);check('sustained opening releases',!detector.isActive);}
}
const d=new PinchContactDetector({...DEFAULT_CONTACT});for(let i=0;i<8;i++)d.update(hand(.1),i*33);check('hand loss cancels',!d.update(null,500));for(let i=0;i<8;i++)d.update(hand(.1),400+i*33);check('identity change cancels',!d.update(hand(.1,1,0,'Left'),800));
const projection=hand(.4);projection.landmarks[4]={...projection.landmarks[8]};for(let i=0;i<10;i++)d.update(projection,900+i*33);check('strong 2D evidence can overcome uncertain world distance',d.isActive);d.reset();
for(let i=0;i<10;i++)d.update(hand(.05,1,.45),1400+i*33);check('Z separation cannot contact',!d.isActive);
const low=hand(.1);low.score=.4;check('inactive low confidence cannot activate',!d.update(low,1800));const missing=hand(.1);missing.worldLandmarks=null;for(let i=0;i<5;i++)d.update(missing,1900+i*33);check('strong 2D works without world landmarks',d.isActive);
const router=new InputRouter();router.set('CANVAS_DRAW','WORKSPACE');check('canvas owns draw',router.mayDraw&&!router.mayTransform);router.set('MODEL_CONTROL','WORKSPACE');check('model owns transform',!router.mayDraw&&router.mayTransform);router.set('TRANSITION','WORKSPACE');check('transition blocks ink and grab',!router.mayDraw&&!router.mayTransform);router.set('SPATIAL_DRAW','UI');check('UI excludes ink',!router.mayDraw);
const store=new StrokeStore();store.begin('#000',8,'candy',{x:.2,y:.2,z:0});store.commit();store.undo();store.clear();check('clear discards redo',!store.canRedo);
const stroke={id:1,color:'#000',width:8,material:'candy' as const,segments:[[{x:.1,y:.1,z:0},{x:.4,y:.2,z:0},{x:.5,y:.4,z:0}]],lod:1};check('freehand produces finite rounded outline',outline(stroke.segments[0],stroke).length>6&&outline(stroke.segments[0],stroke).flat().every(Number.isFinite));
// Real anthropometry, not the fixture above: palm (index↔pinky MCP) ≈ 85 mm,
// index distal phalanx ≈ 20 mm, thumb distal ≈ 25 mm. Those proportions make the
// anatomical pad estimate ≈0.159 of palm width, which is *below* what a genuine
// pad-to-pad pinch measures (≈0.19) — the reason the uncalibrated path let the
// synthetic fixture draw while a real hand only ever read "指尖接近".
function realHand(gapPalms:number,zGapPalms=0):TrackedHand{
  const w=Array.from({length:21},()=>({x:0,y:0,z:0}));
  w[5]={x:-.0425,y:0,z:0};w[17]={x:.0425,y:0,z:0};                 // palm width 85 mm
  w[8]={x:-.02,y:.09,z:0};w[7]={x:-.02,y:.07,z:0};                 // index tip / DIP: 20 mm
  w[4]={x:-.02+gapPalms*.085,y:.09,z:zGapPalms*.085};
  w[3]={x:-.02+gapPalms*.085-.004,y:.09-.0248,z:zGapPalms*.085};   // thumb IP → tip: 25 mm
  return {worldLandmarks:w,landmarks:w.map(p=>({x:.5+p.x/.12,y:.5-p.y/.12,z:p.z})),handedness:'Right',score:.99};
}
for(const [gap,label] of [[.13,'pressed hard'],[.19,'pads touching'],[.21,'pads touching, far from the lens']] as const){
  const detector=new PinchContactDetector({...DEFAULT_CONTACT});let t=0,fired=false;
  for(let cycle=0;cycle<10;cycle++){detector.update(realHand(.9),t+=33);for(let i=0;i<10;i++)fired||=detector.update(realHand(gap),t+=33);check(`real hand ${label} contacts #${cycle+1}`,fired);}
  check(`real hand keeps the measured default, not the anatomical estimate`,detector.metrics.radius>=.009/.085-.001,`radius=${detector.metrics.radius.toFixed(3)}`);
}
for(const [gap,z,label] of [[.36,0,'about 31 mm apart'],[.5,0,'clearly open'],[.15,.35,'one fingertip behind the other']] as const){
  const detector=new PinchContactDetector({...DEFAULT_CONTACT});let t=0,fired=false;
  for(let cycle=0;cycle<10;cycle++){detector.update(realHand(.9),t+=33);for(let i=0;i<10;i++)fired||=detector.update(realHand(gap,z),t+=33);check(`real hand ${label} does not contact #${cycle+1}`,!fired);}
}
// 捏合辅助只放宽「两指可以离多远」，不放宽深度、投影与确认帧 —— 否则它就是一个误触开关。
for(const assist of [0,.5,1] as const){
  const widen=new PinchContactDetector({...DEFAULT_CONTACT},4);widen.setAssist(assist);let t=0,fired=false;
  widen.update(realHand(.9),t+=33);for(let i=0;i<10;i++)fired||=widen.update(realHand(.29),t+=33);
  check(`assist ${assist} ${assist>0?'lets 25 mm apart pinch':'keeps 25 mm apart as near'}`,fired===assist>0);
  const depth=new PinchContactDetector({...DEFAULT_CONTACT},4);depth.setAssist(assist);let t2=0,deep=false;
  depth.update(realHand(.9),t2+=33);for(let i=0;i<10;i++)deep||=depth.update(realHand(.15,.35),t2+=33);
  check(`assist ${assist} never forgives a depth mismatch`,!deep);
  const open=new PinchContactDetector({...DEFAULT_CONTACT},4);open.setAssist(assist);let t3=0,wide=false;
  open.update(realHand(.9),t3+=33);for(let i=0;i<10;i++)wide||=open.update(realHand(.62),t3+=33);
  check(`assist ${assist} still rejects a clearly open hand`,!wide);
  check(`assist ${assist} reports the widened gate`,widen.metrics.radius>=.009/.085*(1+assist*.35)-.001,`radius=${widen.metrics.radius.toFixed(3)}`);
}
console.log(`${checks-failures}/${checks} checks passed`);process.exitCode=failures?1:0;


