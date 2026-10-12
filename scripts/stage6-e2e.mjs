import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true}));localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.30,release:.37,projection:.30,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));window.__exports=[];HTMLAnchorElement.prototype.click=function(){if(this.download)window.__exports.push({name:this.download,url:this.href});};});
await page.goto((process.env.APP_URL??'http://localhost:5174/')+'?simulate=1');await page.evaluate(installGestureDriver);await enterApp(page);
const gesture=(name,...args)=>page.evaluate(async([name,args])=>window.__gesture[name](...args),[name,args]);
// The preview toggle lives inside the device menu now (phase 15), so the suite opens
// the menu the way a person does instead of reaching for a control that is not shown.
await page.getByTestId('device-status').click();await page.waitForTimeout(350);
await page.getByTestId('camera-dot').click();await page.waitForTimeout(200);
check('preview skeleton visible and text layer unmirrored',await page.evaluate(()=>{const canvas=document.querySelector('[data-testid=camera-preview] canvas');return !!canvas&&getComputedStyle(canvas).transform==='none';}));
await gesture('release');await gesture('drawSweep',1000);await gesture('release');
check('stroke is a SceneObject',await page.evaluate(()=>window.__airdrawWorkspace.project.objects.some(o=>o.type==='stroke3d'&&o.stroke)));
await page.evaluate(()=>{const w=window.__airdrawWorkspace;window.__strokeId=w.project.objects[0].id;w.patch(window.__strokeId,{locked:true});w.remove(window.__strokeId);});
check('locked object cannot be deleted',await page.evaluate(()=>window.__airdrawWorkspace.project.objects.some(o=>o.id===window.__strokeId)));
await page.evaluate(()=>{const w=window.__airdrawWorkspace;w.patch(window.__strokeId,{locked:false});w.duplicate(window.__strokeId);});
check('duplicate command is undoable',await page.evaluate(()=>{const w=window.__airdrawWorkspace,n=w.project.objects.length;window.__airdraw.undo();return w.project.objects.length===n-1;}));
check('duplicate command is redoable',await page.evaluate(()=>{const w=window.__airdrawWorkspace,n=w.project.objects.length;window.__airdraw.redo();return w.project.objects.length===n+1;}));
await page.evaluate(async()=>{const storage=await import('/src/project/storage.ts');await storage.saveProject(window.__airdrawWorkspace.project);window.__savedProject=await storage.openProject(window.__airdrawWorkspace.project.id);});
check('IndexedDB round trip keeps objects',await page.evaluate(()=>window.__savedProject.objects.length===window.__airdrawWorkspace.project.objects.length));
await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await page.waitForTimeout(1000);await gesture('release');await gesture('drawSweep',1000);await gesture('release');
check('2D and 3D coexist in one project',await page.evaluate(()=>{const types=window.__airdrawWorkspace.project.objects.map(o=>o.type);return types.includes('stroke2d')&&types.includes('stroke3d');}));
await page.evaluate(async()=>{const storage=await import('/src/project/storage.ts');const p=storage.migrateProject({title:'Legacy',strokes:window.__airdraw.getCommitted()});window.__migration=p;});
check('legacy stroke artwork migrates',await page.evaluate(()=>window.__migration.schemaVersion===2&&window.__migration.objects.length>0));
await page.evaluate(async()=>{const exp=await import('/src/project/export.ts');const bytes=await exp.exportGLB(window.__airdrawWorkspace.project);window.__glbHeader=new Uint32Array(bytes.slice(0,12));exp.exportProject(window.__airdrawWorkspace.project);});
check('GLB has valid magic/version',await page.evaluate(()=>window.__glbHeader[0]===0x46546c67&&window.__glbHeader[1]===2));
check('JSON project package exported',await page.evaluate(()=>window.__exports.some(e=>e.name.endsWith('.airdraw.json'))));
await page.evaluate(async()=>{const exp=await import('/src/project/export.ts');const r=new exp.CanvasRecorder();r.start(document.querySelector('canvas[data-airdraw-canvas]'));await new Promise(resolve=>setTimeout(resolve,1600));await r.stop('Test');});
check('WebM exported without raw camera',await page.evaluate(()=>window.__exports.some(e=>e.name==='Test.webm')));
await gesture('poseUntil','point','POINT',200);await gesture('poseUntil','open','OPEN_PALM',900);await page.waitForTimeout(250);
// Layers is reached through the bar's project menu now (phase 15): the old
// `workspace-layers` pill is gone, so the suite opens the menu and picks the entry.
await gesture('click','[data-gesture-id="workspace-projects"]');await page.waitForTimeout(350);
await gesture('click','[data-gesture-id="project-panel"]');await page.waitForTimeout(450);
check('Layers opens through real gesture UI',await page.locator('[aria-label="Project Workspace"]').count()===1);
const before=await page.evaluate(()=>window.__airdrawWorkspace.project.objects.length);await gesture('drawSweep',800);await gesture('release');check('object panel excludes drawing input',await page.evaluate(()=>window.__airdrawWorkspace.project.objects.length)===before);
await gesture('click','[data-gesture-id="workspace-close"]');
check('no runtime exceptions',errors.length===0,errors);
mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/stage6-workspace.png'});writeFileSync('docs/verification/stage6-e2e.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));
await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;
