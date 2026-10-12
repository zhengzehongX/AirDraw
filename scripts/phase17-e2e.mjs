import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
const url=process.env.APP_URL??'http://127.0.0.1:5174/';
const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`,detail??'');};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try {
 // A blank isolated same-origin page loads the REAL DrawingSurface and renderer,
 // rather than treating a mathematical docToInk result as pixel evidence.
 for(const dpr of [1,1.25,1.5,2]) {
  const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1440,height:900}});
  const p=await context.newPage();
  await p.route('**/__phase17_blank',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="root"></div></body></html>'}));
  await p.goto(url+'__phase17_blank');
  await p.evaluate(async()=>{
   const Refresh=(await import('/@react-refresh')).default;
   Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   const reactModule=await import('/node_modules/.vite/deps/react.js'),React=reactModule.default??reactModule;
   const dom=await import('/node_modules/.vite/deps/react-dom_client.js'),createRoot=dom.createRoot??dom.default.createRoot;
   const {DrawEngine}=await import('/src/engine/DrawEngine.ts');
   const {DrawingSurface}=await import('/src/components/DrawingSurface.tsx');
   const e=new DrawEngine({getBrush:()=>({color:'#ff0000',width:12,material:'plastic'})});
   e.setWorkspaceMode('CANVAS_DRAW');e.setViewport(innerWidth,innerHeight,devicePixelRatio);
   window.testEngine=e;window.root=createRoot(document.getElementById('root'));
   root.render(React.createElement(DrawingSurface,{engine:e,dotDensity:1}));
  });
  await p.waitForSelector('[data-testid="drawing-surface"] canvas');
  for(const [w,h] of [[1920,1080],[1440,900],[1366,768],[768,768]]) {
   await p.setViewportSize({width:w,height:h});await p.waitForTimeout(80);
   const evidence=await p.evaluate(async()=>{
    const e=testEngine;e.setViewport(innerWidth,innerHeight,devicePixelRatio);
    e.canvasNav.setBase({p00:{x:0,y:0},p10:{x:1600,y:0},p01:{x:0,y:900}});
    e.canvasNav.setView({zoom:1,offsetX:0,offsetY:0});
    const renderer=e.renderer;
    const stroke={id:701,mode:'canvas',tool:'pen',virtualPressure:false,color:'#ff0000',width:12,material:'plastic',lod:1,segments:[[{x:.15,y:.35,z:0},{x:.3,y:.35,z:0}]]};
    renderer.rebuild([stroke]);
    const canvas=document.querySelectorAll('[data-testid="drawing-surface"] canvas')[1],ctx=canvas.getContext('2d');
    const sample=(x,y)=>[...ctx.getImageData(Math.round(x*devicePixelRatio),Math.round(y*devicePixelRatio),1,1).data];
    const before=sample(320,315),matrix=ctx.getTransform();
    e.canvasNav.setView({zoom:2,offsetX:-100,offsetY:25});renderer.repaintHistory();
    const moved=sample(540,655),old=sample(320,315);
    renderer.beginStroke({...stroke,id:702,tool:'highlighter'},stroke.segments[0][0]);renderer.extendStroke(stroke.segments[0][1]);
    const live=document.querySelectorAll('[data-testid="drawing-surface"] canvas')[2].getContext('2d');
    const liveAlpha=live.getImageData(Math.round(540*devicePixelRatio),Math.round(655*devicePixelRatio),1,1).data[3];
    return {dpr:devicePixelRatio,transform:matrix.a,before,moved,old,liveAlpha,buffer:[canvas.width,canvas.height]};
   });
   check(`actual ink pixels DPR ${dpr} ${w}x${h}`,Math.abs(evidence.transform-dpr)<.001&&evidence.before[0]===255&&evidence.before[3]>240&&evidence.moved[3]>240&&evidence.old[3]===0&&evidence.liveAlpha>=80&&evidence.liveAlpha<=83,evidence);
  }
  if(dpr===1){
   const composition=await p.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {renderArtworkCanvas}=await import('/src/rendering/three/capture.ts');
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
    const scene=new THREE.Scene(),camera=new THREE.Camera();scene.background=new THREE.Color('white');
    const helper=new THREE.Object3D();helper.userData.excludeFromArtwork=true;scene.add(helper);
    let ratio=1,alpha=1;
    const gl={domElement:canvas,getSize:v=>v.set(80,60),getPixelRatio:()=>ratio,getClearAlpha:()=>alpha,setPixelRatio:v=>{ratio=v;},setClearAlpha:v=>{alpha=v;},setSize:(w,h)=>{canvas.width=w*ratio;canvas.height=h*ratio;},render:()=>{const ctx=canvas.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(5,5,10,10);}};
    const image=renderArtworkCanvas(gl,scene,camera,{scale:1,background:'theme'},{background:'white',paint:ctx=>{ctx.fillStyle='red';ctx.fillRect(40,30,10,10);}});
    const ctx=image.getContext('2d'),pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
    return {webgl:pixel(8,8),ink:pixel(44,34),paper:pixel(70,50),restored:helper.visible&&ratio===1&&alpha===1&&scene.background!==null};
   });
   check('mixed composition preserves WebGL and ink pixels and restores capture state',composition.webgl[2]===255&&composition.ink[0]===255&&composition.paper[0]===255&&composition.restored,composition);
  }
  await context.close();
 }
 const p=await browser.newPage({viewport:{width:1366,height:768}});
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true,developerMode:true}));
  localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.3,release:.6,projection:.3,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));
 });
 await p.goto(url+'?simulate=1&debug=1');await p.evaluate(installGestureDriver);await enterApp(p);
 await p.waitForTimeout(1200);
 const inputs=await p.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),e=__airdraw,trace=[];
  for(let cycle=0;cycle<3;cycle++){
   for(let i=0;i<16;i++){__gesture.push(.4,.45,'point');await sleep(40);}
   const before=e.strokeCount;
   for(let i=0;i<30;i++){
    __gesture.push(.4+i*.003,.45,'pinch');
    trace.push({cycle,i,...e.debugInternals,contact:{...e.contact},router:{...e.inputDiagnostic.router},hint:e.inputHint});await sleep(40);
   }
   for(let i=0;i<12;i++){__gesture.push(.49,.45,'point');await sleep(40);}
   trace.push({cycle,before,after:e.strokeCount});
  }
  return trace;
 });
 check('three deliberate pinch sessions commit 3D ink',inputs.filter(r=>'after'in r).every(r=>r.after>r.before),inputs.filter(r=>'after'in r));
 mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase17-input-trace.json',JSON.stringify(inputs,null,2));
 await p.evaluate(async()=>{const {appMode}=await import('/src/app/AppMode.ts');appMode.request('CANVAS_DRAW');});
 await p.waitForFunction(()=>__airdraw.workspaceMode==='CANVAS_DRAW');await p.waitForSelector('[data-testid="drawing-surface"]');
 const exported=await p.evaluate(async()=>{
  const e=__airdraw,sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<12;i++){__gesture.push(.4,.45,'point');await sleep(40);}
  for(let i=0;i<30;i++){__gesture.push(.4+i*.003,.45,'pinch');await sleep(40);}
  for(let i=0;i<12;i++){__gesture.push(.49,.45,'point');await sleep(40);}
  const moduleUrl=path=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===path).at(-1)?.name??path;
  const captureModule=await import(moduleUrl('/src/rendering/three/capture.ts'));const {captureArtworkCanvas,captureFrame}=captureModule;
  const {workspaceRecorder}=await import(moduleUrl('/src/project/export.ts'));
  const opaque=captureArtworkCanvas({scale:2,background:'theme'}),transparent=captureArtworkCanvas({scale:2,background:'none'});
  if(!opaque||!transparent)throw new Error('capture failed: '+captureModule.lastCaptureError);
  const c=transparent.getContext('2d'),data=c.getImageData(0,0,transparent.width,transparent.height).data;
  let painted=0;for(let i=3;i<data.length;i+=4)if(data[i])painted++;
  const capture=captureFrame({scale:1,background:'theme'});
  window.__phase17ExportEvidence={strokes:e.strokesFor('CANVAS_DRAW').length,painted,alpha:data[3],opaque:[opaque.width,opaque.height],png:capture.dataUrl.length,visibility:document.visibilityState};
  // Decode the actual WebM blob; writing a nonempty container alone is insufficient.
  let blob=null;const create=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return create(b);};
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){};
  try{workspaceRecorder.start(document.querySelector('canvas[data-airdraw-canvas]'));await sleep(3000);window.__phase17ExportEvidence.record={state:workspaceRecorder.recorder?.state,chunks:workspaceRecorder.chunks.map(c=>c.size),track:workspaceRecorder.stream?.getVideoTracks()[0]?.muted};await workspaceRecorder.stop('isolated phase17');}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  const video=document.createElement('video');video.muted=true;video.src=create(blob);
  const head=[...new Uint8Array(await blob.arrayBuffer()).slice(0,16)];
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('WebM decode '+JSON.stringify({bytes:blob.size,type:blob.type,head,media:video.error?.message})));setTimeout(()=>reject(new Error('WebM decode timeout')),5000);});
  // loadeddata does not promise that Chrome's decoded video texture has been presented.
  const presented=new Promise((resolve,reject)=>{video.requestVideoFrameCallback(resolve);setTimeout(()=>reject(new Error('WebM presentation timeout')),5000);});
  await video.play();await presented;video.pause();
  const output=document.createElement('canvas');output.width=video.videoWidth;output.height=video.videoHeight;output.getContext('2d').drawImage(video,0,0);
  const image=output.getContext('2d').getImageData(0,0,output.width,output.height).data;let dark=0,white=0,colored=0;
  for(let i=0;i<image.length;i+=4){if(image[i]<230||image[i+1]<230||image[i+2]<230)dark++;if(image[i]>245&&image[i+1]>245&&image[i+2]>245)white++;if(Math.max(image[i],image[i+1],image[i+2])-Math.min(image[i],image[i+1],image[i+2])>35)colored++;}
  URL.revokeObjectURL(video.src);video.removeAttribute('src');video.load();
  window.__phase17ExportEvidence.video={white,colored,dark,corner:[...image.slice(0,4)]};
  window.__phase17VideoFrame=output.toDataURL();
  return {strokes:e.strokesFor('CANVAS_DRAW').length,painted,alpha:data[3],opaque:[opaque.width,opaque.height],png:capture.dataUrl.length,webmBytes:blob.size,webmPixels:colored,webmWhite:white,recorderStopped:!workspaceRecorder.active};
 });
 check('Canvas PNG contains vector-painted ink and transparent background',exported.strokes>0&&exported.painted>0&&exported.alpha===0&&exported.png>1000,exported);
 check('WebM decodes into artwork pixels and stops cleanly',exported.webmBytes>1000&&exported.webmPixels>100&&exported.webmWhite>10000&&exported.recorderStopped,exported);
 writeFileSync('docs/verification/phase17-webm-frame.png',Buffer.from((await p.evaluate(()=>window.__phase17VideoFrame)).split(',')[1],'base64'));
 check('no runtime page errors',errors.length===0,errors);
 mkdirSync('docs/verification',{recursive:true});
 await p.screenshot({path:'docs/verification/phase17-canvas.png'});
 writeFileSync('docs/verification/phase17-input-trace.json',JSON.stringify(inputs,null,2));
} catch(error){check('suite completed',false,String(error.stack??error));for(const page of browser.contexts().flatMap(c=>c.pages())){try{console.log('EXPORT DIAGNOSTIC',await page.evaluate(()=>window.__phase17ExportEvidence));}catch{}}}
finally{await browser.close();mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/phase17-e2e.json',JSON.stringify({input:'isolated synthetic hands / SwiftShader, no hardware camera',results,errors},null,2));}
if(results.some(r=>!r.pass))process.exitCode=1;
