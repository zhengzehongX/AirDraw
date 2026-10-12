import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true}));localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.30,release:.37,projection:.30,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));});
await page.goto((process.env.APP_URL??'http://localhost:5174/')+'?simulate=1');await page.evaluate(installGestureDriver);await enterApp(page,{target:'CANVAS_DRAW'});
const gesture=(name,...args)=>page.evaluate(async([name,args])=>window.__gesture[name](...args),[name,args]);
/** A gesture activation patches the project through React state, so the next microtask is too
 *  early to read it. Poll for the outcome instead of sampling it, with a small budget. */
const settles=async(expr,timeout=2000)=>{try{await page.waitForFunction(expr,null,{timeout});return true;}catch{return false;}};
await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await page.waitForTimeout(1200);
await page.evaluate(()=>{const e=window.__airdraw;const points=Array.from({length:65},(_,i)=>({x:.44+.10*Math.cos(i*Math.PI/32),y:.52+.10*16/9*Math.sin(i*Math.PI/32),z:0}));e.loadArtwork([{id:1,color:'#22d3ee',width:10,material:'candy',lod:1,mode:'canvas',tool:'pen',segments:[points]}]);});
await page.locator('[data-gesture-id="recognition-confirm"]').waitFor({state:'visible',timeout:8000});check('idle geometry suggestion appears',await page.locator('[data-gesture-id="recognition-confirm"]').count()===1);
await gesture('click','[data-gesture-id="recognition-confirm"]');check('suggestion confirmation marks object',await settles(`window.__airdrawWorkspace.project.objects.some(o=>o.recognition==='geometry')`),`activated=${await page.evaluate(()=>window.__airdrawInteraction.lastActivatedId)} `+JSON.stringify(await page.evaluate(()=>window.__airdrawWorkspace.project.objects.map(o=>({t:o.type,r:o.recognition,l:!!o.locked})))));
await page.evaluate(()=>window.__airdraw.undo());check('recognition undo restores raw object',await page.evaluate(()=>!window.__airdrawWorkspace.project.objects[0].recognition));await page.evaluate(()=>window.__airdraw.redo());
await gesture('click','[data-gesture-id="canvas-make3d"]');await page.waitForTimeout(400);
check('Make 3D panel stays within viewport',await page.locator('[aria-label="Project Workspace"]').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
check('preview contains finite geometry',await page.evaluate(()=>{const scene=window.__airdrawThree.scene;let found=false,finite=true;scene.traverse(o=>{if(o.userData?.sceneObjectId==='make3d-preview'){found=true;o.traverse(c=>{const p=c.geometry?.attributes?.position;if(p)for(const n of p.array)if(!Number.isFinite(n))finite=false;});}});return found&&finite;}));
await gesture('click','[data-gesture-id="make-confirm"]');await page.waitForTimeout(1400);
check('Make 3D creates a solid and locks original',await settles(`(()=>{const w=window.__airdrawWorkspace;return w.project.objects.some(o=>o.type==='solid')&&w.project.objects.find(o=>o.type==='stroke2d')?.locked===true;})()`));
check('Make 3D enters Model Control',await page.evaluate(()=>window.__airdrawMode.getSnapshot().mode==='MODEL_CONTROL'));
check('creation coach reads real converted object',await settles(`document.querySelector('.ad-creation-coach')?.innerText.includes('Rotate')`));
await page.evaluate(()=>window.__airdraw.undo());check('Make 3D undo removes solid and unlocks original',await page.evaluate(()=>{const w=window.__airdrawWorkspace;return !w.project.objects.some(o=>o.type==='solid')&&!w.project.objects[0].locked;}));await page.evaluate(()=>window.__airdraw.redo());
await page.evaluate(async()=>{
 const w=window.__airdrawWorkspace,storage=await import('/src/project/storage.ts');const id=w.project.id;
 await storage.saveProject({...w.project,name:'Valid snapshot',theme:'night',paper:'dark',camera:{yaw:.2,pitch:.1,distance:11}});
 await storage.saveProject({...w.project,name:'Latest'});
 const database=await new Promise(resolve=>{const r=indexedDB.open('airdraw-projects',1);r.onsuccess=()=>resolve(r.result);});
 await new Promise((resolve,reject)=>{const t=database.transaction('projects','readwrite');t.objectStore('projects').put({id,schemaVersion:99});t.oncomplete=resolve;t.onerror=reject;});
 window.__recovered=await storage.openProject(id,true);w.open(window.__recovered);database.close();
});await page.waitForTimeout(300);
check('recovery keeps previous valid snapshot',await page.evaluate(()=>window.__recovered.name==='Valid snapshot'));
check('project opening restores paper and camera',await page.evaluate(()=>window.__airdraw.canvasBackground==='dark'&&window.__airdrawWorkspace.project.camera.distance===11));
await page.evaluate(async()=>{const {textShapes}=await import('/src/project/textShapes.ts');window.__textShapes=textShapes('Hello');const {buildObject,disposeObject}=await import('/src/project/geometry.ts');const w=window.__airdrawWorkspace,solid=w.project.objects.find(o=>o.type==='solid'),object=await buildObject({...solid,text:'Hello'},w.project);window.__textMesh=object.children.length>0;disposeObject(object);});
check('system font produces legal text shapes and mesh',await page.evaluate(()=>window.__textShapes.length>0&&window.__textMesh));
// 清空画布不能把 Make 3D 的原稿一起带走
await gesture('click','[data-gesture-id="mode-CANVAS_DRAW"]');await page.waitForTimeout(1100);
const inkBefore=await page.evaluate(()=>window.__airdrawWorkspace.project.objects.filter(o=>o.type==='stroke2d').length);
await page.evaluate(()=>window.__airdraw.clear());await page.waitForTimeout(600);
check('clearing the canvas keeps the locked original',await page.evaluate(()=>{const w=window.__airdrawWorkspace;return w.project.objects.some(o=>o.type==='stroke2d'&&o.locked)&&w.project.objects.some(o=>o.type==='solid');}),`ink ${inkBefore}`);
// 只是转一下视角，不该被当成一次可撤销的内容编辑
check('orbiting the view stays out of the undo stack',await page.evaluate(()=>{const w=window.__airdrawWorkspace;w.history.clear();w.camera({yaw:.4});return !w.history.canUndo&&w.status==='待保存';}));
// 长按确认必须在鼠标上也走得通
const victim=await page.evaluate(()=>window.__airdrawWorkspace.project.objects.find(o=>!o.locked&&o.type==='solid')?.id??'');
await gesture('click','[data-gesture-id="canvas-layers"]');await page.waitForTimeout(600);
await gesture('click',`[data-gesture-id="layer-${victim}"]`);
check('a layer row selects its object',await page.evaluate(id=>window.__airdrawWorkspace.selection.includes(id),victim));
check('the same row lets go, and a third tap picks it back up',await page.evaluate(id=>{const w=window.__airdrawWorkspace;w.toggleSelection(id);const off=!w.selection.includes(id);w.toggleSelection(id);return off&&w.selection.includes(id);},victim));
const deleteBox=await page.locator('[data-gesture-id="layer-delete"]').boundingBox();
await page.mouse.move(deleteBox.x+deleteBox.width/2,deleteBox.y+deleteBox.height/2);await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
check('a short mouse press does not delete',await page.evaluate(id=>window.__airdrawWorkspace.project.objects.some(o=>o.id===id),victim));
await page.mouse.down();await page.waitForTimeout(1500);await page.mouse.up();
check('a mouse hold completes the delete confirmation',await page.evaluate(id=>!window.__airdrawWorkspace.project.objects.some(o=>o.id===id),victim));
check('the deselect control goes idle once nothing is selected',await page.evaluate(()=>{const b=document.querySelector('[data-gesture-id="layer-deselect"]');return !!b&&b.disabled===true;}));
check('no runtime exceptions',errors.length===0,errors);
mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/stage6-creation.png'});writeFileSync('docs/verification/stage6-creation-e2e.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;
