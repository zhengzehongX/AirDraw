import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const inputOnly=process.env.INPUT_ONLY==='1';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:inputOnly?['--disable-webgl']:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),results=[],errors=[];let replay;page.on('pageerror',error=>errors.push(error.message));
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};
/**
 * `--disable-webgl` puts the capability card over the whole page, so Playwright can never
 * land a real click on the welcome entry or on a hub door. Same three steps as `enterApp`,
 * dispatched straight at the elements instead of aimed through the overlay.
 */
const enterByDispatch=async(target='SPATIAL_DRAW')=>{
  await page.getByTestId('launch-begin').dispatchEvent('click');
  await page.waitForFunction(()=>!!document.querySelector('[data-testid="feature-hub"]'),null,{timeout:25000});
  await page.getByTestId(`hub-${target}`).dispatchEvent('click');
  await page.waitForFunction(()=>{const s=window.__airdrawApp?.();return !!s&&(s.context==='studio'||s.context==='tutorial'||s.context==='playlab');},null,{timeout:25000});
};
await page.addInitScript(()=>localStorage.setItem('airdraw-preferences-v1',JSON.stringify({tutorialDone:true,helloSeen:true,calibrationSkipped:true,reducedMotion:'on'})));
try{
 await page.goto((process.env.APP_URL??'http://localhost:5174/')+'?simulate=1');
 if(inputOnly)await enterByDispatch();else await enterApp(page);
 await page.waitForFunction(()=>window.__airdrawTracking?.cameraState==='READY');await page.evaluate(installGestureDriver);
 const report=await page.evaluate(async()=>{
  const engine=window.__airdraw,g=window.__gesture,sleep=ms=>new Promise(r=>setTimeout(r,ms));const failures=[];let confirmed=0,falseStarts=0,maxFrameGap=0,lastFrame=performance.now(),lateFrames=0;const gaps=()=>{const now=performance.now(),gap=now-lastFrame;maxFrameGap=Math.max(maxFrameGap,gap);if(gap>180)lateFrames++;lastFrame=now;};
  const originalInput=engine.handleResult.bind(engine);engine.handleResult=(...args)=>{gaps();return originalInput(...args);};
  let measuring=true,renderFrames=0,renderLast=performance.now(),maxRenderGap=0;const measuredAt=renderLast;
  const renderTick=now=>{if(!measuring)return;maxRenderGap=Math.max(maxRenderGap,now-renderLast);renderLast=now;renderFrames++;requestAnimationFrame(renderTick);};requestAnimationFrame(renderTick);
  await g.release();const before=engine.strokeCount;
  for(let cycle=0;cycle<30;cycle++){for(let i=0;i<7;i++){g.push(.45+i*.002,.55,'near');await sleep(34);}if(engine.activeStroke)falseStarts++;await g.release();}
  const afterNear=engine.strokeCount;
  for(let cycle=0;cycle<30;cycle++){for(let i=0;i<7;i++){g.push(.45+i*.004,.55+cycle*.001,'pinch');await sleep(34);}if(engine.activeStroke)confirmed++;else{const {recentFrames,...diagnostic}=engine.inputDiagnostic;failures.push({cycle,...diagnostic,recentFrames:recentFrames.slice(-12)});}await g.release();}
  await g.release();const countBefore=engine.strokeCount;const start=performance.now();let missing=0,frame=0;
  while(performance.now()-start<30000){const t=(performance.now()-start)/1000;if(frame++%17===16){engine.handleResult(null);missing++;}else g.push(.5+.10*Math.cos(t*2),.55+.08*Math.sin(t*2),'pinch');await sleep(34);}
  await g.release();const final=engine.getCommitted().at(-1);
  measuring=false;engine.handleResult=originalInput;
  return {confirmed,falseStarts,before,afterNear,continuousStrokeCount:engine.strokeCount-countBefore,segments:final?.segments.length,points:final?.segments.flat().length,missing,maxFrameGap,lateFrames,maxRenderGap,renderFPS:renderFrames*1000/(performance.now()-measuredAt),failures};
 });
 replay=report;
 check('30 clearly separated cycles make no ink',report.falseStarts===0&&report.before===report.afterNear,report.falseStarts);
 check('30 close pinch cycles start ink',report.confirmed>=29,report.confirmed);
 check('30s holding survives short dropouts with useful sampling',report.continuousStrokeCount===1&&report.segments===1&&report.points>=100,{strokes:report.continuousStrokeCount,segments:report.segments,points:report.points,missingFrames:report.missing,maxFrameGap:report.maxFrameGap,lateFrames:report.lateFrames});
 await page.screenshot({path:'docs/verification/phase8-ink.png'});
}catch(error){check('suite completes',false,String(error));}
check('no exceptions',errors.length===0,errors);mkdirSync('docs/verification',{recursive:true});writeFileSync(`docs/verification/phase8-ink-${inputOnly?'input':'e2e'}.json`,JSON.stringify({at:new Date().toISOString(),scope:inputOnly?'Synthetic landmark input/router/session with WebGL disabled; not render or human acceptance':'Synthetic 21-landmark replay, SwiftShader; not human distance/contact accuracy',results,errors,replay},null,2));await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;


