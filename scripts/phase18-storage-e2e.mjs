import {chromium} from 'playwright-core';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');
 const evidence=await page.evaluate(async()=>{
  const storage=await import('/src/project/storage.ts'),{newProject}=await import('/src/project/types.ts');
  const first={...newProject('Isolated recovery'),canvasView:{zoom:2,offsetX:61,offsetY:-42}};
  await storage.saveProject(first);await storage.saveProject({...first,name:'Second revision'});
  const current=await storage.openProject(first.id),previous=await storage.openProject(first.id,true);
  await new Promise((resolve,reject)=>{const req=indexedDB.open('airdraw-projects',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:first.id,schemaVersion:999});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
  let corruptRejected=false;try{await storage.openProject(first.id);}catch{corruptRejected=true;}
  const restored=await storage.openProject(first.id,true);await storage.saveProject(restored);const reopened=await storage.openProject(first.id);
  const legacy=storage.migrateProject({id:'isolated-legacy',name:'Legacy',theme:'night',objects:[]});
  await storage.deleteProject(first.id);const listed=await storage.listProjects();
  return{current:current.name,previous:previous.name,corruptRejected,restored:restored.name,reopened:reopened.name,view:reopened.canvasView,legacy:legacy.canvasView,legacyTheme:legacy.theme,deleted:!listed.some(p=>p.id===first.id)};
 });
 for(const [name,pass] of Object.entries({latestRevision:evidence.current==='Second revision',previousValidSnapshot:evidence.previous==='Isolated recovery',corruptionRejected:evidence.corruptRejected,recoveryAndResave:evidence.restored==='Isolated recovery'&&evidence.reopened===evidence.restored,viewRecovered:evidence.view.zoom===2&&evidence.view.offsetX===61&&evidence.view.offsetY===-42,legacyDefault:evidence.legacy.zoom===1&&evidence.legacy.offsetX===0&&evidence.legacyTheme==='night',isolatedDelete:evidence.deleted})){results.push({name,pass});console.log(pass?'PASS':'FAIL',name);}
 writeFileSync('docs/verification/phase18-storage-e2e.json',JSON.stringify({scope:'Isolated browser IndexedDB service transactions and recovery; not recovery modal UX',results,evidence},null,2));
}finally{await browser.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
