import {chromium} from 'playwright-core';
import {enterApp,installGestureDriver} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
const check=(name,pass,evidence)=>{results.push({name,pass,evidence});console.log(pass?'PASS':'FAIL',name,JSON.stringify(evidence??''));};
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{if(!localStorage.getItem('airdraw-preferences-v1'))localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true,theme:'night'}));localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.3,release:.37,projection:.3,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));});
try{
 await page.goto((process.env.APP_URL??'http://127.0.0.1:5174/')+'?simulate=1');
 await page.locator('[data-testid="launch-begin"]').click();
 await page.waitForSelector('[data-testid="launch-screen"][data-stage="hello"]');
 await page.waitForTimeout(3000);
 check('Hello holds until explicit confirmation',await page.locator('[data-testid="launch-screen"][data-stage="hello"]').count()===1&&await page.locator('[data-testid="feature-hub"]').count()===0);
 await page.locator('[data-testid="launch-begin"]').click();await page.waitForSelector('[data-testid="feature-hub"]');await page.locator('[data-testid="hub-CANVAS_DRAW"]').click();await page.waitForTimeout(1300);await page.evaluate(installGestureDriver);
 check('no visible theme switch',await page.locator('[data-gesture-id="theme-toggle"]').count()===0);
 const day=await page.evaluate(async()=>{const {themeController}=await import('/src/theme/themeController.ts');themeController.setMode('night');return themeController.mode;});check('legacy theme request stays day',day==='day',day);
 const sample=await page.evaluate(async()=>{
  const e=window.__airdraw,g=window.__gesture,sleep=ms=>new Promise(r=>setTimeout(r,ms)),out=[];
  for(const zoom of [.5,1,2,4]){
   await g.release();e.restoreCanvasView({zoom,offsetX:90,offsetY:-40});
   for(let i=0;i<20;i++){g.push(.55,.42,'point');await sleep(33);}
   for(let i=0;i<25;i++){g.push(.55,.42,'pinch');await sleep(33);}
   const active=e.canvasStore.activeStroke,last=active?.segments.at(-1)?.at(-1),cursor=e.cursor,screen=last?e.canvasNav.docToScreen(last):null;
   const count=e.canvasStore.activePointCount;
   for(let i=0;i<30;i++){g.push(.55,.42,'pinch');await sleep(33);}
   out.push({zoom,penDown:e.debugInternals.penDown,count,after:e.canvasStore.activePointCount,error:screen?Math.hypot(screen.x-cursor.x,screen.y-cursor.y):null});await g.release();
  }return out;
 });
 for(const s of sample){check(`stationary cursor equals ink at zoom ${s.zoom}`,s.penDown&&s.error!==null&&s.error<2.1,s);check(`static hold adds no points at zoom ${s.zoom}`,s.count===s.after&&s.count>0,s);}
 const roundtrip=await page.evaluate(async()=>{
  const e=window.__airdraw,w=window.__airdrawWorkspace,{saveProject,openProject}=await import('/src/project/storage.ts'),{sessionSnapshot}=await import('/src/project/sessionSnapshot.ts'),{newProject}=await import('/src/project/types.ts');
  e.restoreCanvasView({zoom:2.4,offsetX:137,offsetY:-83});const snapshot=sessionSnapshot(e);await saveProject(snapshot);w.open(newProject('Isolated blank'));const reset=e.canvasNav.state();w.open(await openProject(snapshot.id));return {reset,restored:e.canvasNav.state(),expected:snapshot.canvasView,strokes:e.rawStrokesFor('CANVAS_DRAW').length};
 });check('new project resets and saved view restores',roundtrip.reset.zoom===1&&JSON.stringify(roundtrip.restored)===JSON.stringify(roundtrip.expected)&&roundtrip.strokes>0,roundtrip);
 for(const size of [[1920,1080],[1440,900],[1366,768],[768,768]]){
  await page.setViewportSize({width:size[0],height:size[1]});await page.waitForTimeout(450);
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvases:document.querySelectorAll('canvas[data-airdraw-canvas]').length}));check(`workspace fits ${size.join('x')}`,layout.scroll<=layout.width&&layout.canvases===1,layout);
 }
 check('no page errors',errors.length===0,errors);
}catch(error){check('suite completed',false,String(error.stack??error));}
finally{mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/phase18-workspace.png'}).catch(()=>{});writeFileSync('docs/verification/phase18-e2e.json',JSON.stringify({scope:'Isolated synthetic hands and SwiftShader; no physical tracking acceptance',results,errors},null,2));await browser.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
