import {chromium} from 'playwright-core';
import {enterApp,installGestureDriver} from './gestureDriver.mjs';
import {writeFileSync} from 'node:fs';
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1280,height:800}}),results=[],errors=[];
const check=(name,pass,evidence)=>{results.push({name,pass,evidence});console.log(pass?'PASS':'FAIL',name,JSON.stringify(evidence));};p.on('pageerror',e=>errors.push(e.message));
try{
 await p.addInitScript(()=>{localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true,calibrationSkipped:true,devMode:true}));});
 await p.goto('http://127.0.0.1:5174/?simulate=1&debug=1');await enterApp(p);await p.evaluate(installGestureDriver);
 const fist=await p.evaluate(async()=>{
  const g=window.__gesture,e=window.__airdraw;await g.release();await g.settle(.31,.47,'point');const initial=e.strokeCount;
  await g.drawSweep(1600);const down=e.debugInternals.penDown;await g.poseUntil('fist','FIST',500);const locked=e.debugInternals.locked,afterFist=e.strokeCount;
  await g.poseUntil('point','POINT',500);await g.release();await g.settle(.31,.47,'point');
  const before=e.inputDiagnostic;await g.drawSweep(1600);const resumed=e.debugInternals.penDown;await g.release();return{initial,down,locked,afterFist,resumed,after:e.strokeCount,before:before.router,final:e.debugInternals};
 });check('FIST finishes ink and explicit released re-anchor resumes',fist.down&&fist.locked&&fist.afterFist>fist.initial&&fist.resumed&&fist.after>fist.afterFist,fist);
 const history=await p.evaluate(async()=>{
  const e=window.__airdraw,path='/src/app/AppCommandBus.ts',url=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname===path).at(-1)?.name??path;
  const {appCommandBus}=await import(url);const before=e.strokeCount;
  appCommandBus.send({type:'UNDO'});await new Promise(r=>setTimeout(r,200));const undone=e.strokeCount;
  appCommandBus.send({type:'REDO'});await new Promise(r=>setTimeout(r,200));return{before,undone,redone:e.strokeCount};
 });check('shared command history undoes and redoes committed ink',history.undone===history.before-1&&history.redone===history.before,history);
 await p.evaluate(async()=>{await window.__gesture.release();await (await import('/src/app/AppCommandBus.ts')).appCommandBus.send({type:'OPEN_SETTINGS'});});await p.waitForSelector('[data-testid="settings"]');
 const body=p.locator('[data-testid="settings-body"]');await body.focus();await p.keyboard.press('End');await p.waitForTimeout(200);
 for(let i=0;i<30;i++){
  const visible=await p.evaluate(()=>{const el=document.querySelector('[data-testid="settings-dev"]'),r=el.getBoundingClientRect(),v=document.querySelector('[data-testid="settings-body"]').getBoundingClientRect();return{ok:r.top>=v.top+8&&r.bottom<=v.bottom-8,up:r.top<v.top+8};});if(visible.ok)break;await body.focus();await p.keyboard.press(visible.up?'ArrowUp':'ArrowDown');await p.waitForTimeout(80);
 }
 const action=await p.evaluate(async()=>window.__gesture.click('[data-testid="settings-dev"]'));await p.waitForTimeout(250);
 const dev=await p.evaluate(()=>({stored:JSON.parse(localStorage.getItem('airdraw-preferences-v1')).devMode,panel:!!document.querySelector('[data-testid="debug-panel"]')}));check('visible Developer switch toggles through gesture',action==='ok'&&dev.stored===false&&!dev.panel,{action,...dev});
 check('no page errors',errors.length===0,errors);
}catch(error){check('suite completed',false,String(error.stack??error));}
finally{writeFileSync('docs/verification/phase18-recovery-e2e.json',JSON.stringify({scope:'Synthetic input; explicit release and visible-control preconditions, no physical hand acceptance',results,errors},null,2));await b.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
