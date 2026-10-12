import {chromium} from 'playwright-core';
import {enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:480}}),results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};
await page.addInitScript(()=>{
 localStorage.setItem('airdraw-preferences-v1',JSON.stringify({tutorialDone:true,helloSeen:true,calibrationSkipped:true,reducedMotion:'on'}));localStorage.setItem('airdraw-tracking-config',JSON.stringify({delegate:'CPU',detection:.65,presence:.65,tracking:.65}));
 window.__requests=0;window.__activeWorkers=0;const open=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{if(++window.__requests===1)return Promise.reject(new DOMException('Test denial','NotAllowedError'));return open(...args);};
 const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.__lastWorker=this;window.__activeWorkers++;}terminate(){window.__activeWorkers--;super.terminate();}};
 window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;
});
try{
 // 摄像头是在选完功能入口之后才开的：先走 welcome → 大厅 → 三维绘画，注入的第一次 getUserMedia 才会被拒。
 await page.goto(process.env.APP_URL??'http://localhost:5176/');await enterApp(page);await page.waitForFunction(()=>window.__airdrawTracking?.cameraState==='ERROR');
 check('camera denial shows ERROR without worker',await page.evaluate(()=>window.__requests===1&&window.__activeWorkers===0));
 await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>window.__airdrawTracking.cameraState==='READY',null,{timeout:60000});
 check('permission retry warms camera',await page.evaluate(()=>window.__requests===2&&window.__activeWorkers===1));
 await page.evaluate(async()=>{const {cameraService}=await import('/src/services/handTracking/CameraService.ts');window.__camera=cameraService;window.__stream=cameraService.getSnapshot().stream;window.__lastWorker.onerror({message:'Synthetic worker failure'});});
 await page.waitForFunction(()=>window.__camera.getSnapshot().cameraState==='ERROR');await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>window.__camera.getSnapshot().cameraState==='READY',null,{timeout:60000});
 check('worker retry reuses live camera and never overlaps workers',await page.evaluate(()=>window.__requests===2&&window.__activeWorkers===1&&window.__camera.getSnapshot().stream===window.__stream));
 await page.evaluate(()=>window.__stream.getVideoTracks()[0].dispatchEvent(new Event('mute')));check('mute enters DEGRADED',await page.evaluate(()=>window.__camera.getSnapshot().cameraState==='DEGRADED'));
 await page.evaluate(()=>window.__stream.getVideoTracks()[0].dispatchEvent(new Event('unmute')));await page.waitForFunction(()=>window.__camera.getSnapshot().cameraState==='READY');
 check('unmute warms same stream',await page.evaluate(()=>window.__requests===2&&window.__camera.getSnapshot().stream===window.__stream));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.__camera.getSnapshot().cameraState==='READY');
 check('visibility resync does not request camera again',await page.evaluate(()=>window.__requests===2&&window.__activeWorkers===1));
 for(const command of [{type:'OPEN_HELP'},{type:'CLOSE_MENU'},{type:'OPEN_GALLERY'},{type:'CLOSE_MENU'},{type:'OPEN_PLAYLAB'},{type:'OPEN_TOY',toy:'orb'},{type:'HOME'}]){await page.evaluate(async command=>{const {appCommandBus}=await import('/src/app/AppCommandBus.ts');await appCommandBus.send(command);},command);await page.waitForTimeout(300);}
 // 「返回首页」落在大厅而不是 welcome，所以这里推的是大厅里的那扇门。
 await page.getByTestId('hub-SPATIAL_DRAW').click();await page.waitForFunction(()=>window.__airdrawApp().context==='studio');
 check('Help Gallery PlayLab toy Home preserve shared camera',await page.evaluate(()=>window.__requests===2&&window.__activeWorkers===1&&window.__camera.getSnapshot().stream===window.__stream));
 await page.getByRole('button',{name:'开启语音',exact:true}).click();check('unsupported speech leaves camera operational',await page.evaluate(async()=>{const {voiceAssistant}=await import('/src/voice/VoiceAssistantService.ts');return voiceAssistant.getSnapshot().state==='ERROR'&&window.__camera.getSnapshot().cameraState==='READY';}));
 await page.evaluate(()=>window.__camera.dispose());check('dispose releases tracks and worker',await page.evaluate(()=>window.__activeWorkers===0&&window.__stream.getTracks().every(t=>t.readyState==='ended')&&document.querySelectorAll('.ad-camera-source').length===0));
}catch(error){check('suite completes',false,String(error));}
check('no page exceptions',errors.length===0,errors);mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase8-lifecycle.json',JSON.stringify({at:new Date().toISOString(),scope:'Fake camera, real Worker; injected denial/worker failure/mute/visibility events, not physical unplug or browser permission dialog acceptance',results,errors},null,2));await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;

