import {StrokeStore} from '../src/engine/StrokeStore';
import {ViewportController} from '../src/rendering/canvas2d/viewport';
import {WorkerHandProvider} from '../src/services/handTracking/WorkerHandProvider';
import {PlaygroundStateMachine} from '../src/playlab/state';
import {PalmSwipeDetector} from '../src/utils/gesture/PalmSwipeDetector';
import type {HandFrame} from '../src/hands/handFrame';
import {migrateProject} from '../src/project/storage';
import {newProject} from '../src/project/types';
import {mkdirSync,writeFileSync} from 'node:fs';
const results:{name:string;pass:boolean}[]=[];
function check(name:string,pass:boolean){results.push({name,pass});console.log(pass?'PASS':'FAIL',name);}
for(const zoom of [.2,.5,1,2,8]){
 const viewport=new ViewportController();viewport.setBase({p00:{x:0,y:0},p10:{x:1000,y:0},p01:{x:0,y:1000}});viewport.setView({zoom,offsetX:70,offsetY:90});
 const store=new StrokeStore();const start=viewport.screenToDoc({x:400,y:300});store.begin('#000000',1,'glossy',{...start,z:0});
 check(`CSS sampling rejects noise at zoom ${zoom}`,!store.append({...viewport.screenToDoc({x:401,y:300}),z:0},1,1.35));
 check(`CSS sampling accepts movement at zoom ${zoom}`,store.append({...viewport.screenToDoc({x:402,y:300}),z:0},2,1.35));
 const anchor={x:700,y:500},doc=viewport.screenToDoc(anchor);viewport.zoomAt(anchor,1.2);const mapped=viewport.docToScreen(doc);
 check(`zoom anchor stays fixed at zoom ${zoom}`,Math.hypot(mapped.x-anchor.x,mapped.y-anchor.y)<1e-8);
}
const legacy=migrateProject({...newProject(),theme:'night'});
check('legacy night metadata remains readable',legacy.theme==='night');
check('legacy canvas view gets identity default',legacy.canvasView?.zoom===1&&legacy.canvasView.offsetX===0);
const saved=migrateProject({...newProject(),canvasView:{zoom:2,offsetX:120,offsetY:-80}});
check('canvas view survives migration',saved.canvasView?.zoom===2&&saved.canvasView.offsetY===-80);
let invalid=false;try{migrateProject({...newProject(),canvasView:{zoom:NaN,offsetX:0,offsetY:0}});}catch{invalid=true;}
check('invalid canvas view is rejected',invalid);
const machine=new PlaygroundStateMachine();machine.request('orb',0);machine.tick(2000);check('active toy accepts input',machine.interactive);machine.toHub(2000);check('exiting toy cannot accept input',!machine.interactive);machine.request('galaxy',2050);machine.request('ocean',2100);machine.tick(4000);check('interrupted switch keeps only final target',machine.snapshot.toy==='ocean');
for(const direction of [-1,1]){
 const detector=new PalmSwipeDetector(),commits:string[]=[];
 const frame=(x:number)=>({palmCenter:{x,y:.5,z:0},palmWidth:.12,openness:1,facing:1,isStable:true,pinchState:'OPEN'} as HandFrame);
 for(let at=1;at<3000;at+=33){const commit=detector.update(frame(.5),at,true);if(commit)commits.push(commit);}
 check('stationary open palm never pages '+direction,commits.length===0&&detector.snapshot.state==='TRACKING');
 for(let i=0;i<12;i++){const commit=detector.update(frame(.5+direction*.028*i),3000+i*33,true);if(commit)commits.push(commit);}
 check('swipe after long hold commits once '+direction,commits.length===1&&commits[0]===(direction===1?'right':'left'));
}
class FakeWorker{
 static instances:FakeWorker[]=[];onmessage:((event:unknown)=>void)|null=null;onerror:((event:unknown)=>void)|null=null;terminated=false;
 constructor(){FakeWorker.instances.push(this);}postMessage(){}terminate(){this.terminated=true;}
}
Object.assign(globalThis,{Worker:FakeWorker,cancelAnimationFrame:()=>{}});
const provider=new WorkerHandProvider({cancelVideoFrameCallback:()=>{}} as unknown as HTMLVideoElement,{delegate:'CPU',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
const first=provider.start(()=>{}),second=provider.start(()=>{});check('concurrent start shares one promise and Worker',first===second&&FakeWorker.instances.length===1);
const caught=first.catch(error=>error);provider.dispose();const error=await caught;
check('dispose cancels pending initialization immediately',error?.name==='AbortError');
check('disposed worker is terminated and handlers removed',FakeWorker.instances[0].terminated&&FakeWorker.instances[0].onmessage===null&&FakeWorker.instances[0].onerror===null);
mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase18-core.json',JSON.stringify({scope:'Pure logic and fake Worker lifecycle; not physical camera acceptance',results},null,2));
if(results.some(r=>!r.pass))process.exitCode=1;
