import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';

/**
 * PlayLab browser regression: the card rail, the palm swipe, and the GPU ledger.
 *
 * The swipe cases matter most — a page that turns on its own makes every other
 * gesture untrustworthy — and so does the resource check, because five toys that
 * each leak a render target is the failure a 30-minute soak would otherwise
 * discover the hard way.
 */
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
  localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true}));
  localStorage.setItem('airdraw-pinch-calibration',JSON.stringify({contact:.30,release:.37,projection:.30,z:.16,calibratedAt:'2026-10-05T00:00:00Z'}));
});
await page.goto((process.env.APP_URL??'http://localhost:5174/')+'?simulate=1');
await page.evaluate(()=>{const anyWindow=window;anyWindow.__pref=(key)=>JSON.parse(anyWindow.localStorage.getItem('airdraw-preferences-v1')??'{}')[key];});
// 入口走真实前门：welcome → 大厅 → 三维绘画（studio）。
// 之所以不在大厅直接点 hub-PLAYLAB：本套件的第一条断言要的就是「捏合打开实验室」，
// 那扇门必须由下面的 mode-PLAYLAB 手势来开，否则断言就没有被测对象了。
await enterApp(page);
await page.evaluate(installGestureDriver);
const gesture=(name,...args)=>page.evaluate(async([name,args])=>window.__gesture[name](...args),[name,args]);
const lab=()=>page.evaluate(()=>({phase:window.__airdrawLab.state.phase,index:window.__airdrawLab.state.index,toy:window.__airdrawLab.state.toy,swipe:window.__airdrawLab.state.swipe,swipeState:window.__airdrawLab.state.swipeState}));
const memory=()=>page.evaluate(()=>{const gl=window.__airdrawThree.gl;return {geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,canvases:document.querySelectorAll('canvas[data-airdraw-canvas]').length};});

/**
 * Sweep the open palm across the frame, then wait for the commit to land rather
 * than a wall clock: the engine needs a few frames to re-anchor after the hand
 * jumps, and a swipe that is asserted before it settles is a flake, not a test.
 */
async function palmSwipe(from,to,ms=330,hold=900){
  // Frames must arrive at a real camera cadence: a synchronous burst makes every
  // swipe measure an unphysical speed (dt = loop time, not 33 ms) and get rejected,
  // so the suite used to pass only when the machine happened to be slow enough.
  await page.evaluate(async([from,to,ms,hold])=>{
    const sleep=(t)=>new Promise(r=>setTimeout(r,t));
    for(let t=0;t<=hold;t+=33){window.__gesture.push(from,0.5,'open');await sleep(33);}
    for(let t=0;t<=ms;t+=33){window.__gesture.push(from+(to-from)*(t/ms),0.5,'open');await sleep(33);}
    for(let t=0;t<200;t+=33){window.__gesture.push(to,0.5,'open');await sleep(33);}
  },[from,to,ms,hold]);
}
/** Returns the rail index once it stops moving, or the last value on timeout. */
async function settleIndex(previous,timeout=1800){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const {index}=await lab();
    if(index!==previous) return index;
    await page.waitForTimeout(60);
  }
  return (await lab()).index;
}

await gesture('click','[data-gesture-id="mode-PLAYLAB"]');
await page.waitForTimeout(1200);
const opened=await lab();
check('playlab opens by pinch',opened.phase==='HUB'&&opened.index===0,JSON.stringify(opened));
check('the rail shows five cards with one centred',await page.locator('[data-testid^="lab-card-"]').count()===5&&await page.locator('[data-testid="lab-hub"]').locator('[data-selected="true"]').count()===1);
check('the pen is lifted inside the lab',await page.evaluate(()=>window.__airdraw.debugInternals.drawingAllowed===false));
const before=await memory();
check('the ink scene steps aside without a second canvas',before.canvases===1,JSON.stringify(before));

// A real palm swipe, measured in the hand's own palm widths.
// Prime at the swipe's *start* column: the hand appears here, so the first swipe
// begins where the previous frame was. Priming at centre and then pushing from
// 0.72 teleports the synthetic hand 0.37 across the frame, which the detector
// correctly rejects as a reversal/over-speed rather than a swipe.
await page.evaluate(async()=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t));for(let t=0;t<400;t+=33){window.__gesture.push(0.72,0.5,'open');await sleep(33);}});
// 读的是「这一帧的手掌有多宽」，而合成手只在驱动喂帧时存在：SwiftShader 下labs一卡，
// 200ms 的空窗就足够让引擎判丢手（frame.primary 变空）。所以边喂边读。
const width=await page.evaluate(async()=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t));for(let i=0;i<40;i+=1){window.__gesture.push(0.72,0.5,'open');await sleep(33);const w=window.__airdraw.frame.primary?.palmWidth??0;if(w>0.02)return w;}return window.__airdraw.frame.primary?.palmWidth??0;});
check('the lab reads the shared hand frame',width>0.02,`palmWidth=${width.toFixed(3)}`);
await palmSwipe(0.72,0.28);
check('a left swipe advances one card',await settleIndex(0)===1,JSON.stringify(await lab()));
await palmSwipe(0.28,0.72);
const backIndex=(await lab()).index;
check('a right swipe goes back one card',backIndex===0,`index=`);
const base=(await lab()).index;
// Negative cases run at real camera cadence too: a synchronous burst makes every
// motion read as unphysically fast, so "does not move" would pass for the wrong
// reason and prove nothing about the distance/reversal gates.
await page.evaluate(async()=>{
  const sleep=(t)=>new Promise(r=>setTimeout(r,t));
  // Hold still long enough to clear the cooldown and re-arm, then drift 0.10 —
  // less than the commit distance — so what is under test is the distance gate.
  for(let t=0;t<=900;t+=33){window.__gesture.push(0.62,0.5,'open');await sleep(33);}
  for(let t=0;t<=320;t+=33){window.__gesture.push(0.62-0.10*(t/320),0.5,'open');await sleep(33);}
});
await page.waitForTimeout(900);
check("a short shuffle does not move the rail",(await lab()).index===base);
await page.evaluate(async()=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t));for(let t=0;t<=1500;t+=33){window.__gesture.push(0.7-t*0.00028,0.5,'open');await sleep(33);}});
await page.waitForTimeout(900);
check("a slow drift does not move the rail",(await lab()).index===base,JSON.stringify(await lab()));
await page.evaluate(async()=>{
  const sleep=(t)=>new Promise(r=>setTimeout(r,t));
  // Four legs of 0.12 — each shorter than the commit distance, so what must reject
  // this is the reversal rule rather than a distance the wave happens to miss.
  for(let t=0;t<=900;t+=33){window.__gesture.push(0.62,0.5,'open');await sleep(33);}
  for(let leg=0;leg<4;leg+=1){
    const from=leg%2?0.50:0.62,to=leg%2?0.62:0.50;
    for(let t=0;t<=300;t+=33){window.__gesture.push(from+(to-from)*(t/300),0.5,'open');await sleep(33);}
  }
});
await page.waitForTimeout(900);
check("waving back and forth does not move the rail",(await lab()).index===base,JSON.stringify(await lab()));

// Thirty deliberate swipes must step one card at a time and never skip.
{
  const seen=[];
  for(let i=0;i<30;i+=1){
    const previous=(await lab()).index;
    const from=i%2?0.28:0.72,to=i%2?0.72:0.28;
    await palmSwipe(from,to);
    seen.push(await settleIndex(previous,1500));
    await page.waitForTimeout(250);
  }
  const steps=seen.slice(1).map((value,i)=>Math.abs(value-seen[i]));
  check('30 swipes never skip more than one card',steps.every(step=>step<=1),`max step ${Math.max(...steps)}`);
  check('30 swipes stay inside the rail',seen.every(value=>value>=0&&value<=4)&&seen.at(-1)>=0,JSON.stringify(seen.slice(-4)));
}

// Enter each toy, then return, and read the GPU ledger every time. A toy mount
// is ENTERING (switchMs) + dynamic import + module init — a fixed wall clock
// misses it whenever Vite has to transform the module on demand, so wait for
// the *observed* loaded flag instead.
const toyLoaded=async(timeout=6000)=>{
  try{await page.waitForFunction(()=>window.__airdrawLab.state.loaded===true,null,{timeout});return true;}catch{return false;}
};
await page.evaluate(()=>{window.__airdrawLab.back();});
for(const id of ['orb','galaxy','fluid','ocean','fireworks']){
  await page.waitForTimeout(400);
  const index=await page.evaluate(i=>['orb','galaxy','fluid','ocean','fireworks'].indexOf(i),id);
  await page.evaluate(target=>{window.__airdrawLab.request(target);},id);
  await toyLoaded();
  const state=await lab();
  const mounted=await page.evaluate(()=>{const g=window.__airdrawLab.group;let objects=0;g.traverse(()=>objects++);return objects;});
  check(`${id}: entering mounts an active toy`,state.phase==='ACTIVE'&&state.toy===id&&state.index===index,JSON.stringify(state));
  check(`${id}: the toy puts real geometry on screen`,mounted>2,`${mounted} nodes`);
  await page.evaluate(()=>window.__airdrawLab.back());
  await page.waitForTimeout(1200);
  const after=await memory();
  check(`${id}: leaving releases it again`,after.geometries<=before.geometries+2&&after.canvases===1,JSON.stringify(after));
}

// Twenty cycles of the heaviest toy must not creep.
{
  for(let i=0;i<20;i+=1){
    await page.evaluate(()=>window.__airdrawLab.request('fluid'));
    await page.waitForTimeout(700);
    await page.evaluate(()=>window.__airdrawLab.back());
    await page.waitForTimeout(500);
  }
  const after=await memory();
  check('20 fluid cycles leave the ledger flat',Math.abs(after.geometries-before.geometries)<=3&&Math.abs(after.textures-before.textures)<=2,`${before.geometries}/${before.textures} → ${after.geometries}/${after.textures}`);
}

// The lab must not eat the drawing state on the way out. Inside a toy the chrome offers
// 回到大厅 and 返回画布 — `lab-leave` belongs to the rail — so the suite walks the same two
// steps a person does: back to the rail, then leave the lab.
await gesture('click','[data-gesture-id="lab-back"]');
await page.waitForFunction(()=>window.__airdrawLab.state.phase==='HUB',null,{timeout:8000}).catch(()=>{});
await page.waitForTimeout(600);
await gesture('click','[data-gesture-id="lab-leave"]');
await page.waitForTimeout(1200);
check('leaving the lab returns to the canvas',await page.evaluate(()=>({context:window.__airdrawApp().context,drawingAllowed:window.__airdraw.debugInternals.drawingAllowed})).then(v=>v.context==='studio'&&v.drawingAllowed===true),JSON.stringify(await page.evaluate(()=>window.__airdrawApp().context)));
check('still exactly one WebGL canvas',await page.locator('canvas[data-airdraw-canvas]').count()===1);
check('no runtime exceptions',errors.length===0,errors.slice(0,3).join(' | '));

mkdirSync('docs/verification',{recursive:true});
await page.screenshot({path:'docs/verification/playlab.png'});
writeFileSync('docs/verification/playlab-e2e.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));
await browser.close();
process.exitCode=results.every(r=>r.pass)?0:1;
