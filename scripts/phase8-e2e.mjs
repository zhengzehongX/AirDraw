import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const results=[],errors=[];const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};
const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 localStorage.setItem('airdraw-preferences-v1',JSON.stringify({tutorialDone:true,helloSeen:true,calibrationSkipped:true}));
 localStorage.setItem('airdraw-tracking-config',JSON.stringify({delegate:'CPU',detection:.65,presence:.65,tracking:.65}));
 window.__cameraRequests=0;window.__workerCount=0;const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=(...args)=>{window.__cameraRequests++;return original(...args);};
 const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.__workerCount++;}};
 window.SpeechRecognition=class{start(){window.__speech=this;this.onstart?.();}abort(){}stop(){} };
});
try{
 await page.goto(process.env.APP_URL??'http://localhost:5174/');
 check('no camera request before explicit Enter',await page.evaluate(()=>window.__cameraRequests===0));
 // The camera is only asked for once a creation door is chosen: welcome → 大厅 → 三维绘画.
 await enterApp(page);
 await page.waitForFunction(()=>window.__airdrawTracking?.cameraState==='READY',null,{timeout:60000});
 check('camera warms up to READY',true,await page.evaluate(()=>window.__airdrawTracking.cameraState));
 await page.evaluate(async()=>{const {cameraService}=await import('/src/services/handTracking/CameraService.ts');window.__cameraService=cameraService;window.__stream=cameraService.getSnapshot().stream;window.__canvas=document.querySelector('canvas[data-airdraw-canvas]');});
 check('one camera and one worker',await page.evaluate(()=>window.__cameraRequests===1&&window.__workerCount===1));
 check('six valid frames before ready',await page.evaluate(()=>window.__cameraService.diagnostics.warmupFrames>=6));
 for(let i=0;i<30;i++){await page.getByRole('button',{name:['Canvas Draw','Model Control','Spatial Draw'][i%3],exact:true}).click();await page.waitForTimeout(850);}
 check('30 mode switches preserve shared stream/worker/canvas',await page.evaluate(()=>window.__cameraRequests===1&&window.__workerCount===1&&window.__cameraService.getSnapshot().stream===window.__stream&&document.querySelector('canvas[data-airdraw-canvas]')===window.__canvas));
 check('worker inference returns frames',await page.evaluate(()=>new Promise(resolve=>{const off=window.__airdrawTracking.subscribe(r=>{off();resolve(r.inferenceMs>0);});setTimeout(()=>{off();resolve(false);},8000);})));
 await page.evaluate(()=>window.__stream.getVideoTracks()[0].dispatchEvent(new Event('ended')));
 await page.waitForFunction(()=>window.__cameraService.diagnostics.recoveries===1&&window.__airdrawTracking.cameraState==='READY',null,{timeout:30000});
 check('interrupted camera recovers using same worker',await page.evaluate(()=>window.__cameraRequests===2&&window.__workerCount===1&&window.__cameraService.getSnapshot().stream!==window.__stream));
 await page.getByRole('button',{name:'开启语音',exact:true}).click();
 await page.evaluate(async()=>{const {voiceAssistant}=await import('/src/voice/VoiceAssistantService.ts');window.__voiceAssistant=voiceAssistant;});
 const utterance=async text=>{await page.evaluate(text=>window.__speech.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:text}}]}),text);await page.waitForTimeout(1600);};
 await utterance('打开画板');check('without wake no command executes',await page.evaluate(()=>window.__airdrawMode.getSnapshot().target==='SPATIAL_DRAW'));
 for(let i=0;i<30;i++)await utterance('你好，AirDraw，'+['打开画板','进入三维绘画','切换白天','切换夜间','红色','蓝色'][i%6]);
 check('30 grammar-driven voice commands complete',await page.evaluate(()=>window.__voiceAssistant.diagnostics.commandsHandled===30&&window.__airdrawMode.getSnapshot().target==='SPATIAL_DRAW'&&window.__airdrawApp().context==='studio'),await page.evaluate(()=>window.__voiceAssistant.diagnostics));
 await page.evaluate(()=>{window.__speech.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'你好，AirDraw'}}]});window.__speech.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'你好，AirDraw，打开画板'}}]});});
 await page.waitForTimeout(1600);
 check('interim wake and final full phrase execute once',await page.evaluate(()=>window.__voiceAssistant.diagnostics.commandsHandled===31&&window.__airdrawMode.getSnapshot().target==='CANVAS_DRAW'));
 await utterance('你好，AirDraw，清空画布');check('dangerous command requires confirmation',await page.evaluate(()=>window.__airdrawApp().confirmClear));
 await utterance('取消');check('cancel closes confirmation',await page.evaluate(()=>!window.__airdrawApp().confirmClear));
 await page.evaluate(()=>window.__speech.onend());await page.waitForTimeout(1600);
 check('speech restarts are delayed and counted',await page.evaluate(()=>window.__voiceAssistant.diagnostics.speechRestarts===1));
 await page.evaluate(()=>window.__speech.onerror({error:'not-allowed'}));
 check('microphone denial leaves camera ready',await page.evaluate(()=>window.__voiceAssistant.getSnapshot().state==='ERROR'&&window.__airdrawTracking.cameraState==='READY'));
 await page.screenshot({path:'docs/verification/phase8-workspace.png'});
}catch(error){check('suite completes',false,String(error));}
check('no browser exceptions',errors.length===0,errors);mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase8-e2e.json',JSON.stringify({at:new Date().toISOString(),scope:'Fake camera + real CPU MediaPipe Worker; mocked SpeechRecognition transcript events, not real microphone recognition',results,errors},null,2));await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;
