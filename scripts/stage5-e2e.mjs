import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const url=process.env.APP_URL??'http://localhost:5174/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const results=[];const errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`,detail??'');};
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true}));localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.30,release:.37,projection:.30,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));window.__exports=[];HTMLAnchorElement.prototype.click=function(){if(this.download)window.__exports.push({name:this.download,href:this.href});};});
await page.goto(url+'?simulate=1');await page.evaluate(installGestureDriver);await enterApp(page);
await page.evaluate(()=>{window.__canvas=document.querySelector('canvas');window.__gl=window.__airdrawThree.gl;});
const gesture=(name,...args)=>page.evaluate(async([name,args])=>window.__gesture[name](...args),[name,args]);
const count=()=>page.evaluate(()=>window.__airdraw.strokeCount);
/**
 * 松开一次并不等于闸门开了：模式切换的 TRANSITION 在定时器真正跑完那一刻才落到目标模式，而那次
 * React effect 会再 cancelInput()→InputRouter.suspend() 一次；SwiftShader 把主线程拖住时，这个
 * 定时器完全可能迟到人的松手之后。所以先持续喂「已松开」的帧，再等路由自己承认可以落笔。
 */
const awaitPenReady=(budget=8000)=>page.evaluate(async([budget])=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t)),e=window.__airdraw;
 for(let i=0;i*33<budget;i+=1){window.__gesture.push(.5,.5,'point');await sleep(33);const d=e.inputDiagnostic.router;if(d.context==='WORKSPACE'&&d.waitingForRelease===false&&d.mayDraw===true)return 'ready';}
 return 'timeout';},[budget]);
await gesture('release');const initial=await count();for(let i=0;i<30;i++){await gesture('gesturePose','near',180);await gesture('release');}check('30 near cycles produce no spatial stroke',await count()===initial);
await gesture('drawSweep',1200);await gesture('release');check('real contact draws spatial stroke',await count()>initial,await page.evaluate(()=>window.__airdraw.debugInternals));
const spatialCount=await count();
await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await page.waitForTimeout(1000);check('gesture switches Canvas mode',await page.evaluate(()=>window.__airdraw.workspaceMode==='CANVAS_DRAW'));
// 换模式的那次捏合本身会触发 InputRouter.suspend()（「先完全松开，再捏合落笔」），
// 所以落笔前要先松开并等闸门开；stage6-e2e 走的是同一步。
await awaitPenReady();await gesture('drawSweep',1400);await gesture('release');check('Canvas stroke is flat',await page.evaluate(()=>{const strokes=window.__airdraw.getCommitted();return strokes.length>0&&strokes.every(s=>s.mode==='canvas'&&s.segments.flat().every(p=>p.z===0));}),await page.evaluate(()=>{const d=window.__airdraw.inputDiagnostic;return {hint:d.hint,contact:d.contact.state,router:d.router,committed:window.__airdraw.getCommitted().map(s=>s.mode),canvasStrokes:window.__airdraw.rawStrokesFor('CANVAS_DRAW').length,spatialStrokes:window.__airdraw.rawStrokesFor('SPATIAL_DRAW').length};}));
const canvasCount=await count();
/**
 * 导出 PNG/SVG 不再是工具行的一部分，而是项目菜单里的「导出」：菜单项只在菜单打开时存在，
 * 所以套件也按人的路径走——先开菜单，选格式，菜单选完自己关上，再为第二个格式开一次。
 */
await gesture('click','[data-gesture-id="workspace-projects"]');await page.waitForTimeout(600);
await gesture('click','[data-gesture-id="canvas-png"]');check('PNG exported',await page.evaluate(()=>window.__exports.some(e=>e.name==='AirDraw-canvas.png'&&e.href.startsWith('data:image/png'))));
await page.waitForTimeout(600);
await gesture('click','[data-gesture-id="workspace-projects"]');await page.waitForTimeout(600);
await gesture('click','[data-gesture-id="canvas-svg"]');check('SVG exported',await page.evaluate(()=>window.__exports.some(e=>e.name==='AirDraw-canvas.svg')));
await page.waitForTimeout(600);
await gesture('click','[data-gesture-id="mode-MODEL_CONTROL"]');await page.waitForTimeout(1000);await page.evaluate(async()=>{const {ensureBuiltinModel}=await import('/src/project/builtin.ts');await ensureBuiltinModel(true);});await page.waitForTimeout(900);await gesture('release');await gesture('gesturePose','point',600);
/**
 * 合成的手只在驱动喂帧时存在：pose 一结束，几百毫秒内引擎就判丢手并 bump router.epoch，
 * ProjectStage 立刻取消抓取（ModelStage/ProjectStage 的 `!hand → cancel`）。
 * 所以“抓到了没有”必须边捏合边读，而不是等 round-trip 回来再读。
 */
const grab=await page.evaluate(async()=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t));for(let i=0;i<24;i+=1){window.__gesture.push(.5,.5,'pinch');await sleep(33);}
 const modelController=window.__airdrawModel;const t=window.__airdrawThree;const ray=new t.raycaster.constructor();ray.setFromCamera(t.pointer.clone().set(0,0),t.camera);const {recentFrames,...input}=window.__airdraw.inputDiagnostic;
 return {target:modelController.targetId,controller:modelController.diagnostic,input,models:window.__airdrawWorkspace.project.objects.map(o=>({id:o.id,type:o.type})),hits:ray.intersectObject(t.scene,true).slice(0,8).map(h=>({name:h.object.name,visible:h.object.visible,point:h.point.toArray(),data:h.object.userData}))};});
check('project model contact grabs',!!grab.target,grab);await gesture('release');check('project model release stops grab',await page.evaluate(async()=>{const modelController=window.__airdrawModel;return modelController.targetId===null;}));
for(let i=0;i<20;i++){const mode=['SPATIAL_DRAW','CANVAS_DRAW','MODEL_CONTROL'][i%3];await gesture('click',`[data-gesture-id="mode-${mode}"]`);await page.waitForTimeout(850);}
check('same Canvas and renderer after 20 switches',await page.evaluate(()=>document.querySelectorAll('canvas[data-airdraw-canvas]').length===1&&document.querySelector('canvas')===window.__canvas&&window.__airdrawThree.gl===window.__gl));
await gesture('click','[data-gesture-id="mode-SPATIAL_DRAW"]');await page.waitForTimeout(900);check('Spatial history survives',await count()===spatialCount);
await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await page.waitForTimeout(900);check('Canvas history survives',await count()===canvasCount);
await gesture('click','[data-gesture-id="mode-MODEL_CONTROL"]');await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await gesture('click','[data-gesture-id="mode-SPATIAL_DRAW"]');await page.waitForTimeout(900);check('rapid reversal settles one mode',await page.evaluate(async()=>{const appMode=window.__airdrawMode;return appMode.getSnapshot().mode==='SPATIAL_DRAW'&&document.querySelectorAll('canvas[data-airdraw-canvas]').length===1;}));
check('no runtime exceptions',errors.length===0,errors);
mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/stage5-spatial.png'});writeFileSync('docs/verification/stage5-e2e.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;
