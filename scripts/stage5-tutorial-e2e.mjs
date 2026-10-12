import {chromium} from 'playwright-core';
import {installGestureDriver,enterApp} from './gestureDriver.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,detail??'');};
const gesture=(name,...args)=>page.evaluate(async([name,args])=>window.__gesture[name](...args),[name,args]);
const enter=async()=>{await enterApp(page);await page.evaluate(installGestureDriver);};
/** The welcome hands over to the hub, and the camera only starts after a door is chosen, so
 *  readiness is an observed state here: wait for the screen the app actually shows. */
const waitForCalibrationPanel=async(timeout=30000)=>{await page.waitForFunction(()=>!!document.querySelector('[aria-label="Pinch Calibration"]'),null,{timeout}).catch(()=>{});};
/**
 * 松开与下一次落笔之间不能有空窗：驱动一停手，引擎几百毫秒内就判丢手，而丢手会再次
 * InputRouter.suspend()，下一次「一上来就捏合」的横扫会被「先完全松开，再捏合落笔」挡掉。
 * 所以先喂一段连续的已松开帧，并等路由自己承认可以落笔，再开始画。
 */
const awaitPenReady=(budget=8000)=>page.evaluate(async([budget])=>{const sleep=(t)=>new Promise(r=>setTimeout(r,t)),e=window.__airdraw;
 for(let i=0;i*33<budget;i+=1){window.__gesture.push(.5,.5,'point');await sleep(33);const d=e.inputDiagnostic.router;if(d.context==='WORKSPACE'&&d.waitingForRelease===false&&d.mayDraw===true)return 'ready';}
 return 'timeout';},[budget]);
const centreOf=async(selector,{width,height}={width:1440,height:900})=>{const box=await page.locator(selector).boundingBox();return box&&{dx:Math.abs(box.x+box.width/2-width/2),dy:Math.abs(box.y+box.height/2-height/2),box};};
const centred=async(selector,size,tolerance=2)=>{const c=await centreOf(selector,size);return !!c&&c.dx<tolerance&&c.dy<tolerance&&c.box.x>=0&&c.box.y>=0;};

// ---- first run: no calibration wall in front of the tutorial -----------------
await page.goto((process.env.APP_URL??'http://localhost:5174/')+'?simulate=1');
await page.waitForFunction(()=>!!window.__airdraw,null,{timeout:30000});
await enter();
// 首次体验：welcome → 大厅 → 三维绘画 → tutorial。校准是一次「邀请」，App 不再替用户
// 自动开始三拍——以前它会自动打开面板，于是张掌、捏合与落笔全被吃掉，看上去就是「按钮按不动」。
await page.waitForTimeout(1500);
check('first run opens the tutorial without auto-starting calibration',
  await page.locator('[aria-label="Pinch Calibration"]').count()===0 && await page.locator('[data-testid="tutorial-coach"]').count()===1,
  await page.evaluate(()=>window.__airdrawApp()));
// 第一课（手进入画面）与第二课（光标跟随食指走）以前是靠 ?simulate=1 的脚本时间线自己走过去的；
// 驱动一接管那份时间线就静音（见 SyntheticHandProvider 的 test-drive 闸门），而现在进门前门多了一段
// 大厅，脚本手已经没有机会在课上跑够位移。所以这里由夹具真的把手喂进去：先定点，再横扫一次。
await gesture('release');await gesture('gesturePose','point',1200);await gesture('sweepCursor');
await page.waitForFunction(()=>Number(document.querySelector('[data-testid="tutorial-coach"]')?.getAttribute('data-step')??-1)>=2,null,{timeout:20000}).catch(()=>{});

for(const size of [{width:1440,height:900},{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(size);await page.waitForTimeout(300);
  const coach=await page.locator('[data-testid=tutorial-coach]').boundingBox();
  check(`tutorial coach visible and reachable ${size.width}x${size.height}`,!!coach&&coach.width>0&&coach.x>=0&&coach.y>=0,coach);
}
await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);

// ---- the tutorial is passed by actually doing it -----------------------------
const coach=page.locator('[data-testid=tutorial-coach]');
const box=await coach.boundingBox();
// The coach is anchored top-left on purpose: centred above the Dock it covered the
// colour popover, and a pinch aimed at a swatch hit the card. What still matters is
// that it is on screen and clear of the tool row it teaches.
const row=await page.locator('[data-testid="dock-zone"]').boundingBox().catch(()=>null);
const clearOfRow=!row||box.y+box.height<=row.y+2;
check('tutorial coach sits on screen, clear of the tool row',box.x>=0&&box.y>=0&&box.width>0&&clearOfRow,{...box,clearOfRow,row});
check('tutorial reaches confirmation step',await coach.getAttribute('data-step')==='2');
await gesture('click','[data-testid="tut-target"]');await page.waitForTimeout(500);
check('confirmation enables writing lesson',await coach.getAttribute('data-step')==='3');
await awaitPenReady();await gesture('drawSweep',1200);await gesture('release');await page.waitForTimeout(500);
check('uncalibrated defaults produce actual ink',await page.evaluate(()=>window.__airdraw.strokeCount>0),await page.evaluate(()=>window.__airdraw.inputDiagnostic.hint));
check('writing advances to lift lesson',await coach.getAttribute('data-step')==='4');
await awaitPenReady();await gesture('drawSweep',1000);await gesture('release');await page.waitForTimeout(500);
check('second stroke advances beyond writing',Number(await coach.getAttribute('data-step'))>=5);

// ---- the studio offers calibration, and the offer is honest -------------------
await page.locator('[data-testid="tutorial-skip"]').click().catch(()=>{});
await page.waitForTimeout(900);
check('skipping the tutorial lands in the studio',await page.locator('[data-testid=tutorial-coach]').count()===0);
check('studio offers calibration without blocking it',await page.locator('[aria-label="捏合校准邀请"]').count()===1);
for(const size of [{width:1440,height:900},{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(size);await page.waitForTimeout(300);
  check(`calibration offer centred ${size.width}x${size.height}`,await centred('[aria-label="捏合校准邀请"]',size),await centreOf('[aria-label="捏合校准邀请"]',size));
}
await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);

// The canvas stays live behind the offer: it is an invitation, not a modal.
await gesture('release');await awaitPenReady();await gesture('drawSweep',900);await gesture('release');
check('the offer does not swallow the pen',await page.evaluate(()=>window.__airdrawWorkspace.project.objects.filter(o=>o.type==='stroke3d'||o.type==='stroke2d').length)>1,
  await page.evaluate(()=>window.__airdrawWorkspace.project.objects.map(o=>o.type).join(',')));

await gesture('click','[data-gesture-id="calibration-later"]');await page.waitForTimeout(400);
check('以后再说 dismisses the offer',await page.locator('[aria-label="捏合校准邀请"]').count()===0&&await page.evaluate(()=>JSON.parse(localStorage.getItem('airdraw-preferences-v1')??'{}').calibrationSkipped===true));

// ---- starting calibration from the offer still centres and completes ---------
await page.evaluate(()=>{localStorage.removeItem('airdraw-pinch-calibration');localStorage.setItem('airdraw-preferences-v1',JSON.stringify({schema:1,tutorialDone:true,helloSeen:true,calibrationSkipped:false}));});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__airdraw,null,{timeout:30000});
await page.evaluate(installGestureDriver);
// A reload lands back on the launch screen, so walk in the way a returning user does: welcome → 大厅 → 三维绘画.
await enterApp(page);
// 追踪就绪后 App 会自己打开三拍面板；这一轮如果只出现邀请，就照旧点「开始校准」。
await page.waitForFunction(()=>!!document.querySelector('[aria-label="Pinch Calibration"]')||!!document.querySelector('[data-gesture-id="calibration-start"]'),null,{timeout:30000}).catch(()=>{});
if(await page.locator('[data-gesture-id=calibration-start]').count())await gesture('click','[data-gesture-id="calibration-start"]');await page.waitForTimeout(500);
await waitForCalibrationPanel(15000);
check('校准 opens the panel',await page.locator('[aria-label="Pinch Calibration"]').count()===1);
check('calibration panel centred',await centred('[aria-label="Pinch Calibration"]',{width:1440,height:900}),await centreOf('[aria-label="Pinch Calibration"]',{width:1440,height:900}));
for(let i=0;i<3;i++){await gesture('release');await gesture('gesturePose','pinch',700);await gesture('release');}
await page.waitForTimeout(800);
check('three cycles finish calibration',await page.locator('[aria-label="Pinch Calibration"]').count()===0&&!!await page.evaluate(()=>localStorage.getItem('airdraw-pinch-calibration')));
check('calibration writes a personal profile',await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('airdraw-pinch-calibration')??'{}');return Number.isFinite(p.contact)&&Number.isFinite(p.z)&&!!p.calibratedAt;}),await page.evaluate(()=>localStorage.getItem('airdraw-pinch-calibration')));
check('no runtime exceptions',errors.length===0,errors);
mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/stage5-tutorial-e2e.png'});
writeFileSync('docs/verification/stage5-tutorial-e2e.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));
await browser.close();process.exitCode=results.every(r=>r.pass)?0:1;
