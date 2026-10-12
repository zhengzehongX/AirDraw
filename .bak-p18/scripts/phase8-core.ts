import {AdaptivePinchDetector,DEFAULT_CONTACT} from '../src/utils/gesture/PinchContactDetector';
import {parseVoiceCommand,stripWakePhrase} from '../src/voice/VoiceCommandRouter';
import {AppCommandBus,appCommandBus} from '../src/app/AppCommandBus';
import {voiceAssistant} from '../src/voice/VoiceAssistantService';
import {InputRouter,inputRouter} from '../src/interaction/InputRouter';
import {DrawEngine} from '../src/engine/DrawEngine';
import type {TrackedHand} from '../src/types/hand';
let checks=0;function check(name:string,condition:boolean){checks++;if(!condition)throw new Error(name);console.log('PASS',name);}
function pose(projection:number,worldGap=.006,scale=1,side:'Left'|'Right'='Right'):TrackedHand{
 const n=Array.from({length:21},()=>({x:.5,y:.5,z:0}));n[5].x=.5-.06*scale;n[17].x=.5+.06*scale;n[8].y=.4;n[4]={x:.5+projection*.12*scale,y:.4,z:0};
 const w=n.map(()=>({x:0,y:0,z:0}));w[5].x=-.0375;w[17].x=.0375;w[8].y=-.05;w[4]={x:worldGap,y:-.05,z:0};w[7].y=-.035;w[3]={x:worldGap,y:-.035,z:0};
 return {landmarks:n,worldLandmarks:w,handedness:side,score:.99};
}
for(const side of ['Left','Right'] as const)for(const scale of [.5,1,1.6]){
 const d=new AdaptivePinchDetector({...DEFAULT_CONTACT});let t=100;
 for(let cycle=0;cycle<30;cycle++){
  for(let i=0;i<6;i++)d.update(pose(.8,.055,scale,side),t+=33);
  for(let i=0;i<5;i++)d.update(pose(.18,.006,scale,side),t+=33);
  check(`confirmed pinch ${side}/${scale}/${cycle}`,d.isActive);
  for(let i=0;i<3;i++)d.update(pose(.65,.045,scale,side),t+=33);
  check('three noisy samples retain latch',d.isActive);
  d.update(pose(.18,.006,scale,side),t+=33);
  for(let i=0;i<6;i++)d.update(pose(.8,.055,scale,side),t+=33);
  check('sustained separation releases',!d.isActive);
  for(let i=0;i<6;i++)d.update(pose(.55,.04,scale,side),t+=33);
  check('clearly separated tips never activate',!d.isActive);
 }
}
const fallback=new AdaptivePinchDetector({...DEFAULT_CONTACT});const close=pose(.12);close.worldLandmarks=null;for(let i=0;i<6;i++)fallback.update(close,100+i*33);check('strong 2D can confirm without world landmarks',fallback.isActive);check('short loss retains',fallback.update(null,300));check('long loss cancels',!fallback.update(null,500));
const router=new InputRouter();router.set('CANVAS_DRAW','UI',true);router.set('CANVAS_DRAW','WORKSPACE',true);router.contact(false,'NEAR');check('a pinch held across a context switch does not unlock the pen',!router.mayDraw);router.contact(false,'OPEN');check('open unlocks context',router.mayDraw);const idle=new InputRouter();idle.set('CANVAS_DRAW','UI');idle.set('CANVAS_DRAW','WORKSPACE');check('a switch with nothing held leaves the pen ready',idle.mayDraw);
for(const text of ['撤销','undo','打开菜单','关闭菜单','打开平面画板','平面绘画','二维画板','打开画板','进入三维绘画','空间绘画','进入模型模式','打开玩具','打开光球','打开粒子','打开海洋','下一页','上一页','重做','保存作品','打开作品库','打开帮助','切换白天','切换夜间','笔刷大一点','笔刷小一点','返回首页','居中作品','清空画布','确认清空','取消'])check(`voice grammar: ${text}`,!!parseVoiceCommand(text));
// Colour words are the documented exception that needs a verb (docs/voice-commands.md
// 「选择红色」), so a bare colour must NOT parse: random speech saying 红色 used to
// repaint the brush. Both directions are asserted, or the rule reads as an accident.
for(const text of ['选择红色','换成蓝色','改成绿色','set it red'])check(`voice colour with verb: ${text}`,!!parseVoiceCommand(text));
for(const text of ['红色','蓝色'])check(`bare colour word is ignored: ${text}`,parseVoiceCommand(text)===null);
check('unmatched voice cannot guess an action',parseVoiceCommand('今天的天气')===null);check('wake phrase and command in one utterance',stripWakePhrase('你好，AirDraw，打开画板')==='打开画板');check('no wake stays asleep',stripWakePhrase('打开画板')===null);
const bus=new AppCommandBus();const events:string[]=[];bus.bind(c=>{events.push(c.type);});let drawing=true;bus.defer=()=>drawing;const queued=bus.send({type:'UNDO'});check('undo waits for stroke end',events.length===0);drawing=false;await bus.flush();await queued;check('queued undo executes once',events.join()==='UNDO');
const voiceEvents:string[]=[];appCommandBus.bind(command=>{voiceEvents.push(command.type);});
let failSpeech:(message:string)=>void=()=>{};
voiceAssistant.setProvider({start(_text,error,_end,_language,ready){failSpeech=error;ready?.();},stop(){}});
voiceAssistant.start();check('provider ready enters wake listening',voiceAssistant.getSnapshot().state==='WAKE_LISTENING');
await voiceAssistant.receive('撤销');check('unwoken command never executes',voiceEvents.length===0);
await voiceAssistant.receive('你好，AirDraw',false);
await voiceAssistant.receive('你好，AirDraw，撤销',true);
check('interim wake plus final full phrase executes once',voiceEvents.join()==='UNDO');
await voiceAssistant.receive('你好，AirDraw，打开画板');check('new wake interrupts success feedback',voiceEvents.at(-1)==='SWITCH_MODE');
voiceAssistant.stop();voiceAssistant.start();await voiceAssistant.receive('你好，AirDraw，清空画布');
check('clear enters confirmation',voiceAssistant.getSnapshot().state==='CONFIRMING');
await voiceAssistant.receive('打开画板');check('other commands blocked by confirmation',voiceEvents.at(-1)==='CLEAR_CANVAS');
await voiceAssistant.receive('取消');check('cancel exits confirmation',voiceEvents.at(-1)==='CANCEL');
voiceAssistant.stop();voiceAssistant.start();failSpeech('not-allowed');
check('microphone rejection is recoverable error',voiceAssistant.getSnapshot().state==='ERROR');
voiceAssistant.stop();appCommandBus.clear();
const realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout,realNow=Date.now;
let time=10000,timerId=0;const timers=new Map<number,{at:number;callback:()=>void}>();
globalThis.setTimeout=((callback:()=>void,delay=0)=>{const id=++timerId;timers.set(id,{at:time+Number(delay),callback});return id;}) as unknown as typeof setTimeout;
globalThis.clearTimeout=((id:number)=>{timers.delete(Number(id));}) as unknown as typeof clearTimeout;
Date.now=()=>time;
const advance=(ms:number)=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.callback();}};
let speechEnd=()=>{},starts=0;
appCommandBus.bind(command=>{voiceEvents.push(command.type);});
voiceAssistant.setProvider({start(_text,_error,end,_language,ready){speechEnd=end;starts++;ready?.();},stop(){}});
voiceAssistant.start();await voiceAssistant.receive('你好，AirDraw');advance(8000);
check('wake timeout returns to sleeping listener',voiceAssistant.getSnapshot().state==='WAKE_LISTENING');
await voiceAssistant.receive('你好，AirDraw，清空画布');advance(8000);await Promise.resolve();
check('confirmation timeout cancels dangerous action',voiceEvents.at(-1)==='CANCEL'&&voiceAssistant.getSnapshot().state==='WAKE_LISTENING');
for(let i=0;i<6;i++){speechEnd();advance(2600);}
speechEnd();check('restart storm stops after six attempts',voiceAssistant.getSnapshot().state==='ERROR'&&starts===7);
voiceAssistant.stop();appCommandBus.clear();globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;Date.now=realNow;
const realPerformance=globalThis.performance;let clock=1000;
Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});
const ink=new DrawEngine({getBrush:()=>({color:'#ffffff',width:8,material:'glossy'})});ink.setViewport(1280,720,1);ink.setDrawingAllowed(true);inputRouter.set('SPATIAL_DRAW','WORKSPACE');
const feed=(close:boolean,offset=0)=>{clock+=33;const hand=pose(close?.12:.8,close?.006:.055);hand.landmarks.forEach(p=>{p.x+=offset;});ink.handleResult({hands:[hand],timestamp:clock,inferenceMs:1,videoWidth:1280,videoHeight:720,source:'synthetic'});};
for(let i=0;i<8;i++)feed(false);for(let i=0;i<10;i++)feed(true);
check('full input pipeline starts ink',!!ink.activeStroke);
const inkId=ink.activeStroke?.id;
for(let i=0;i<910;i++){if(i%17===16){clock+=33;ink.handleResult(null);}else feed(true,.03*Math.sin(i/25));}
check('30 seconds replay with short dropouts retains one session',ink.activeStroke?.id===inkId&&ink.activeStroke?.segments.length===1);
for(let i=0;i<8;i++)feed(false);check('stable release commits one stroke',ink.strokeCount===1);
for(let i=0;i<10;i++)feed(true);const resumed=ink.activeStroke?.id;ink.handleResult(null);clock+=220;ink.handleResult(null);check('a dropout inside the 320ms grace keeps the same stroke',!!resumed&&ink.activeStroke?.id===resumed);clock+=400;ink.handleResult(null);check('long loss ends ink',!ink.activeStroke);
for(let i=0;i<10;i++)feed(true);check('held pinch after long loss cannot silently regrab',!ink.activeStroke);
for(let i=0;i<8;i++)feed(false);for(let i=0;i<10;i++)feed(true);check('explicit release then fresh pinch resumes drawing',!!ink.activeStroke);
globalThis.cancelAnimationFrame=()=>{};ink.dispose();Object.defineProperty(globalThis,'performance',{value:realPerformance,configurable:true});
console.log(`${checks}/${checks} phase8 checks passed`);


