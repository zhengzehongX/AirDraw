import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const duration=Number(process.env.SOAK_MS??1800000),url=process.env.APP_URL??'http://localhost:5176/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--enable-precise-memory-info']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],samples=[];let switches=0;
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true}));localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.30,release:.37,projection:.30,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));});
await page.goto(url+'?simulate=1');await page.evaluate(installGestureDriver);await enterApp(page);
await page.evaluate(async()=>{
 const engine=window.__airdraw;
 for(let i=0;i<8;i++){await window.__gesture.release();await window.__gesture.drawSweep(700);await window.__gesture.release();}
 const original=engine.rawStrokesFor('SPATIAL_DRAW')[0];if(!original)throw new Error('No contact-generated stroke fixture');
 engine.loadArtwork(Array.from({length:100},(_,i)=>({...original,id:i+1,segments:original.segments.map(segment=>segment.map(p=>({...p,x:p.x+(i%10-5)*.007,y:p.y+(Math.floor(i/10)-5)*.007})))})));
 // Add two independent, self-contained GLB model references to the project.
 const response=await fetch('/models/airdraw-orb.glb'),bytes=new Uint8Array(await response.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const w=window.__airdrawWorkspace,base=await import('/src/project/types.ts');
 w.project={...w.project,assets:{fixture:{name:'orb.glb',data:'data:model/gltf-binary;base64,'+btoa(data)}}};
 const objects=[-3,3].map((x,i)=>({id:'soak-model-'+i,type:'model',name:'Soak model '+i,visible:true,locked:false,transform:{...base.identityTransform(),position:[x,0,0]},material:{preset:'candy',color:'#ffffff'},createdAt:Date.now(),updatedAt:Date.now(),modeSource:'MODEL_CONTROL',assetId:'fixture'}));w.change('Soak models',[...w.project.objects,...objects]);
 window.__soakStrokeCount=engine.rawStrokesFor('SPATIAL_DRAW').length;
 window.__soakCanvas=document.querySelector('canvas[data-airdraw-canvas]');window.__contextLoss=0;window.__soakCanvas.addEventListener('webglcontextlost',()=>window.__contextLoss++);
});
const started=Date.now();console.log('SOAK START',new Date(started).toISOString(),'strokes',await page.evaluate(()=>window.__soakStrokeCount));
while(Date.now()-started<duration){
 const mode=['CANVAS_DRAW','MODEL_CONTROL','SPATIAL_DRAW'][switches%3];
 await page.evaluate(async m=>{const {appMode}=await import('/src/app/AppMode.ts');appMode.request(m);},mode);switches++;
 await page.waitForTimeout(1000);
 const sample=await page.evaluate(()=>({objects:window.__airdrawWorkspace.project.objects.length,strokes:window.__soakStrokeCount,heap:performance.memory?.usedJSHeapSize??null,canvasSame:document.querySelector('canvas[data-airdraw-canvas]')===window.__soakCanvas,webglCanvases:document.querySelectorAll('canvas[data-airdraw-canvas]').length,contextLoss:window.__contextLoss,resources:window.__airdrawThree?{geometries:window.__airdrawThree.gl.info.memory.geometries,textures:window.__airdrawThree.gl.info.memory.textures,drawCalls:window.__airdrawThree.gl.info.render.calls}:null}));
 sample.elapsedMs=Date.now()-started;samples.push(sample);
 if(switches%30===0){console.log('SOAK',Math.round(sample.elapsedMs/1000)+'s',switches,'switches',JSON.stringify(sample));await page.evaluate(async()=>{const {saveProject,openProject}=await import('/src/project/storage.ts');const w=window.__airdrawWorkspace;await saveProject(w.project);const restored=await openProject(w.project.id);if(restored.objects.length!==w.project.objects.length)throw new Error('Save round trip lost objects');});}
 await page.waitForTimeout(Math.min(9000,Math.max(0,duration-(Date.now()-started))));
}
const report={started:new Date(started).toISOString(),elapsedMs:Date.now()-started,switches,scope:'100 stroke fixtures derived from contact-generated ink, synthetic gesture input, SwiftShader; real camera/inference and human contact accuracy require separate checks',samples,errors,pass:errors.length===0&&samples.every(s=>s.canvasSame&&s.webglCanvases===1&&s.contextLoss===0)&&samples[0]?.strokes>=100};
mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase8-soak.json',JSON.stringify(report,null,2));console.log('SOAK COMPLETE',report.pass,report.elapsedMs,switches);await browser.close();process.exitCode=report.pass?0:1;

