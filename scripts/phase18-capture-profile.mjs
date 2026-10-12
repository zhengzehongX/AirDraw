import {chromium} from 'playwright-core';
import {enterApp,installGestureDriver} from './gestureDriver.mjs';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true,calibrationSkipped:true}));});
 await page.goto('http://127.0.0.1:5174/?simulate=1');await enterApp(page,{target:'CANVAS_DRAW'});await page.evaluate(installGestureDriver);
 await page.evaluate(async()=>{await window.__gesture.release();await window.__gesture.drawSweep(800);await window.__gesture.release();});
 const result=await page.evaluate(async()=>{
  const path='/src/rendering/three/capture.ts';
  const moduleUrl=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===path).at(-1)?.name??path;
  const {captureArtworkCanvas}=await import(moduleUrl);const times=[],sizes=[];let allocations=0;
  const original=document.createElement.bind(document);document.createElement=function(tag,...args){if(tag==='canvas')allocations++;return original(tag,...args);};
  try{for(let i=0;i<20;i++){const start=performance.now(),canvas=captureArtworkCanvas({scale:1,background:'theme'});times.push(performance.now()-start);if(!canvas)throw new Error('Capture unavailable');sizes.push([canvas.width,canvas.height]);await new Promise(r=>requestAnimationFrame(r));}}finally{document.createElement=original;}
  times.sort((a,b)=>a-b);return{samples:times.length,canvasAllocations:allocations,medianMs:times[10],p95Ms:times[18],maxMs:times[19],sizes};
 });
 const report={scope:'1280x800 headless SwiftShader synchronous composition; includes render/readback and ink painting, not hardware GPU timing or physical FPS',...result};writeFileSync('docs/verification/phase18-capture-profile.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
