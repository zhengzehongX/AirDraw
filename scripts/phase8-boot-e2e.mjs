import {chromium} from 'playwright-core';
import {enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const samples=[],errors=[];
try{
 for(let i=0;i<20;i++){
  const context=await browser.newContext({viewport:{width:640,height:480}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(returning=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({tutorialDone:true,helloSeen:returning,calibrationSkipped:true}));localStorage.setItem('airdraw-tracking-config',JSON.stringify({delegate:'CPU',detection:.65,presence:.65,tracking:.65}));window.__cameraRequests=0;window.__workers=0;const camera=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{window.__cameraRequests++;return camera(...args);};const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.__workers++;}};},i>=10);
  const start=Date.now();await page.goto(process.env.APP_URL??'http://localhost:5176/');
  // 开场动画现在停在 floating：「Hello」是按下入口之后才聚出来的，所以“开场就绪”的可观察定义
  // 从「stage 自己走到 hello」改成「入口已经可以按下」——同样是 goto 到第一个可交互状态。
  await page.waitForFunction(()=>{const b=document.querySelector('[data-testid="launch-begin"]');return !!b&&b.disabled===false;},null,{timeout:60000});
  const introMs=Date.now()-start,before=await page.evaluate(()=>window.__cameraRequests);
  // welcome → 大厅 → 三维绘画：只有门被推开之后才申请摄像头，enterMs 记录这段交接的耗时。
  const beganAt=Date.now();await enterApp(page);const enterMs=Date.now()-beganAt;
  await page.waitForFunction(()=>window.__airdrawTracking?.cameraState==='READY',null,{timeout:60000});
  const sample=await page.evaluate(()=>({cameraRequests:window.__cameraRequests,workers:window.__workers,phase:document.querySelector('[data-boot-phase]')?.dataset.bootPhase,canvasCount:document.querySelectorAll('canvas[data-airdraw-canvas]').length}));samples.push({...sample,index:i,returning:i>=10,introMs,enterMs,before});console.log('BOOT',i+1,JSON.stringify(samples.at(-1)));await context.close();
 }
}catch(error){errors.push(String(error));}
const pass=samples.length===20&&errors.length===0&&samples.every(s=>s.before===0&&s.cameraRequests===1&&s.workers===1&&s.canvasCount===1);
mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase8-boot.json',JSON.stringify({at:new Date().toISOString(),scope:'20 independent contexts: fake camera, real CPU Worker, first/returning brand stages; permission denied/real calibration require separate acceptance',samples,errors,pass},null,2));console.log('BOOT COMPLETE',pass);await browser.close();process.exitCode=pass?0:1;
