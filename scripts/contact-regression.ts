import {PinchCalibrationSession} from '../src/utils/gesture/PinchCalibrationSession';
import {PinchContactDetector,DEFAULT_CONTACT,type ContactMetrics,loadContactProfile} from '../src/utils/gesture/PinchContactDetector';
import type {TrackedHand} from '../src/types/hand';
let checks=0;const assert=(name:string,value:boolean)=>{checks++;if(!value)throw new Error(name);console.log('PASS',name);};
const hand:TrackedHand={handedness:'Right',score:.99,landmarks:Array.from({length:21},()=>({x:.5,y:.5,z:0})),worldLandmarks:Array.from({length:21},()=>({x:0,y:0,z:0}))};
const measure=(d:number):ContactMetrics=>({state:'NEAR',d3Normalized:d,d2Normalized:d*.8,zGap:.02,palmScale:.075,approachSpeed:0,contactScore:0,stableFrames:0,radius:.16});
const calibration=new PinchCalibrationSession();let profile;
for(let cycle=0;cycle<3;cycle++){calibration.update(measure(.8),hand);for(let i=0;i<8;i++)calibration.update(measure(.27),hand);profile=calibration.update(measure(.8),hand);}
assert('contact endpoint above old .22 limit calibrates',!!profile);
assert('stores palm, physical distance and main hand',!!profile?.palmScale&&!!profile.contactDistance&&profile.dominantHand==='Right');
const detector=new PinchContactDetector(profile!);const pose=(d:number,z=0,projection=d*.7)=>{const h=structuredClone(hand),w=h.worldLandmarks!;w[5].x=-.0375;w[17].x=.0375;w[8]={x:0,y:-.05,z:0};w[7]={x:0,y:-.04,z:0};w[4]={x:Math.sqrt(Math.max(0,d*d-z*z))*.075,y:-.05,z:z*.075};w[3]={x:d*.075,y:-.04,z:0};h.landmarks=w.map(p=>({x:.5+p.x,y:.5+p.y,z:0}));h.landmarks[4].x=.5+projection*.075;return h;};
for(let i=0;i<7;i++)detector.update(pose(.27),100+i*33);
assert('personal contact not capped by distal estimate',detector.isActive);
assert('single opening sample retains latch',detector.update(pose(.8),500));for(let i=0;i<6;i++)detector.update(pose(.8),533+i*33);assert('sustained opening releases',!detector.isActive);
for(let i=0;i<8;i++)detector.update(pose(.6,0,.6),800+i*33);
assert('near outside personal contact remains inactive',!detector.isActive);
const defaultDetector=new PinchContactDetector({...DEFAULT_CONTACT});for(let i=0;i<8;i++)defaultDetector.update(pose(.27),100+i*33);
// The shipped default used to sit at .22, which a real pad-to-pad pinch cannot reach; it is now
// .30 precisely so that this sample counts. What must still be rejected is a distance beyond it.
assert('default gate reaches a real pad-touch',defaultDetector.isActive);
const beyond=new PinchContactDetector({...DEFAULT_CONTACT});for(let i=0;i<8;i++)beyond.update(pose(.42,0,.42),100+i*33);
assert('default gate still rejects 36 mm apart',!beyond.isActive);
const assisted=new PinchContactDetector({...DEFAULT_CONTACT});assisted.setAssist(1);for(let i=0;i<8;i++)assisted.update(pose(.42,0,.42),100+i*33);
assert('assist still rejects clearly separated projection',!assisted.isActive);
const assistedOpen=new PinchContactDetector({...DEFAULT_CONTACT});assistedOpen.setAssist(1);for(let i=0;i<8;i++)assistedOpen.update(pose(.62),100+i*33);
assert('even fully assisted rejects a clearly open hand',!assistedOpen.isActive);
const assistedDepth=new PinchContactDetector({...DEFAULT_CONTACT});assistedDepth.setAssist(1);for(let i=0;i<8;i++)assistedDepth.update(pose(.1,.45),100+i*33);
assert('assist never forgives a depth mismatch',!assistedDepth.isActive);
const lost=new PinchCalibrationSession();lost.update(measure(.8),hand);for(let i=0;i<8;i++)lost.update(measure(.27),hand);lost.update(measure(.8),null);
assert('lost hand cannot complete cycle',lost.samples.length===0);
const observed=new PinchCalibrationSession();let observedProfile;
for(let cycle=0;cycle<3;cycle++){observed.update({...measure(1),d2Normalized:1},hand);for(const d of [.45,.43,.42,.46,.4,.42,.43,.44])observed.update({...measure(d),d2Normalized:.17,zGap:.4,approachSpeed:.2},hand);observedProfile=observed.update({...measure(1),d2Normalized:1},hand);}
assert('observed depth discrepancy can complete personal calibration',!!observedProfile&&observedProfile.contact>.4&&observedProfile.z>.4);
const personal=new PinchContactDetector(observedProfile!);for(let i=0;i<8;i++)personal.update(pose(.43,.4,.17),100+i*33);
assert('learned contact passes world, projection and depth gates',personal.isActive);
for(let i=0;i<6;i++)personal.update(pose(1,.2,1),500+i*33);for(let i=0;i<8;i++)personal.update(pose(.8,.4,.65),800+i*33);
assert('near outside learned world contact never activates',!personal.isActive);
const untouched=new PinchContactDetector({...DEFAULT_CONTACT});for(let i=0;i<8;i++)untouched.update(pose(.43,.4,.17),100+i*33);
assert('uncalibrated defaults are not weakened',!untouched.isActive);
const storage=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>JSON.stringify(observedProfile)},configurable:true});
assert('learned range survives profile reload',loadContactProfile().contact===observedProfile!.contact);
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>JSON.stringify({...observedProfile,calibratedAt:undefined})},configurable:true});
assert('large threshold without calibration is rejected',loadContactProfile().contact===DEFAULT_CONTACT.contact);
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
console.log(`${checks}/${checks} checks passed`);

