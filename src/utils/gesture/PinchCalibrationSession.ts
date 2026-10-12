import type {ContactMetrics,ContactProfile} from './PinchContactDetector';
import type {TrackedHand} from '../../types/hand';
type Sample={d:number;p:number;z:number;palm:number;open:number;hand:'Left'|'Right'};
const median=(a:number[])=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
/** Measures guided, stable close/open cycles independently of the drawing gate. */
export class PinchCalibrationSession {
  samples:Sample[]=[];
  private opened=false;
  private openDistance=0;
  private window:Sample[]=[];
  private endpoint:Sample|null=null;
  private identity='';
  message='张开拇指和食指';
  update(m:ContactMetrics,hand:TrackedHand|null):ContactProfile|null {
    if(!hand||hand.score<.65||!m.palmScale||![m.d3Normalized,m.d2Normalized,m.zGap].every(Number.isFinite)){
      this.opened=false;this.window=[];this.endpoint=null;this.message='让整只手回到画面';return null;
    }
    if(this.identity&&this.identity!==hand.handedness){this.opened=false;this.window=[];this.endpoint=null;this.samples=[];this.openDistance=0;}
    this.identity=hand.handedness;
    if(m.d3Normalized>.5&&m.d2Normalized>.6){
      if(this.opened&&this.endpoint){this.samples.push(this.endpoint);this.endpoint=null;}
      this.opened=true;this.openDistance=Math.max(this.openDistance,m.d3Normalized);this.window=[];this.message='指尖靠近约半厘米或轻触';
    }else if(this.opened){
      // Learn the observed endpoint rather than requiring the default contact
      // detector to have already succeeded. Monocular world depth is estimated.
      // A tight projection, separated open phase, stable window and three cycles
      // remain mandatory; defaults used for drawing are never weakened here.
      const valid=m.d3Normalized<1.1&&m.d3Normalized<this.openDistance*.85&&m.d2Normalized<.3&&Math.abs(m.approachSpeed)<2.5;
      if(!valid){this.window=[];this.message=m.zGap>=.6?'掌心正对镜头，重新捏合':Math.abs(m.approachSpeed)>=2.5?'减慢捏合，接触后保持片刻':'让指尖真正接触，保持片刻';}
      else {
        this.window.push({d:m.d3Normalized,p:m.d2Normalized,z:m.zGap,palm:m.palmScale,open:this.openDistance,hand:hand.handedness});
        this.window=this.window.slice(-5);
        const center=median(this.window.map(s=>s.d));
        if(this.window.length===5&&median(this.window.map(s=>Math.abs(s.d-center)))<.12&&median(this.window.map(s=>Math.abs(s.p-median(this.window.map(x=>x.p)))))<.025){
          const s={...this.window[2],d:center,p:median(this.window.map(s=>s.p)),z:median(this.window.map(s=>s.z))};if(!this.endpoint||s.d<this.endpoint.d)this.endpoint=s;
          this.message='保持接触，然后完全松开';
        }
      }
    }
    if(this.samples.length<3)return null;
    if(Math.max(...this.samples.map(s=>s.d))-Math.min(...this.samples.map(s=>s.d))>.18){this.samples=[];this.endpoint=null;this.window=[];this.message='三次接触差异较大，请保持掌心朝前重试';return null;}
    const contact=Math.max(.06,Math.min(.7,median(this.samples.map(s=>s.d))*1.08+.008));
    const release=Math.min(1.05,Math.max(contact+.07,contact*1.9));
    const palmScale=median(this.samples.map(s=>s.palm));
    return {contact,release,projection:Math.max(.08,Math.min(.36,median(this.samples.map(s=>s.p))*1.12+.02)),z:Math.max(.04,Math.min(.65,median(this.samples.map(s=>s.z))*1.12+.03)),palmScale,contactDistance:contact*palmScale,releaseDistance:release*palmScale,calibrationHand:this.samples[2].hand,dominantHand:this.samples[2].hand,calibratedAt:new Date().toISOString()};
  }
}
