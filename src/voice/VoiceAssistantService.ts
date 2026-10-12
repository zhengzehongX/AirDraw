import {appCommandBus} from '../app/AppCommandBus';
import {parseVoiceCommand,stripWakePhrase,commandFeedback,normalizeVoice} from './VoiceCommandRouter';
export type VoiceState='OFF'|'REQUESTING_PERMISSION'|'SLEEPING'|'WAKE_LISTENING'|'ACTIVE_LISTENING'|'PROCESSING'|'CONFIRMING'|'SUCCESS'|'ERROR';
type RecognitionResult={isFinal:boolean;0:{transcript:string}};
interface Recognition extends EventTarget {lang:string;continuous:boolean;interimResults:boolean;start():void;stop():void;abort():void;onstart:(()=>void)|null;onresult:((e:{resultIndex:number;results:ArrayLike<RecognitionResult>})=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;}
export interface SpeechProvider{start(onText:(text:string,final:boolean)=>void,onError:(message:string)=>void,onEnd:()=>void,language:string,onReady?:()=>void):void;stop():void;}
export interface WakeWordProvider{matches(text:string,phrase:string):string|null;}
export class BrowserSpeechProvider implements SpeechProvider{
 private recognition:Recognition|null=null;
 static get supported(){return !!((window as unknown as {SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown}).SpeechRecognition||(window as unknown as {webkitSpeechRecognition?:unknown}).webkitSpeechRecognition);}
 start(onText:(text:string,final:boolean)=>void,onError:(error:string)=>void,onEnd:()=>void,language:string,onReady?:()=>void){
  const host=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
  const Constructor=host.SpeechRecognition??host.webkitSpeechRecognition;if(!Constructor)throw new Error('此浏览器不支持语音识别，可继续使用手势');
  const recognition=this.recognition=new Constructor();recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;
  recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)onText(e.results[i][0].transcript,e.results[i].isFinal);};
  recognition.onstart=()=>onReady?.();recognition.onerror=e=>onError(e.error);recognition.onend=onEnd;recognition.start();
 }
 stop(){if(this.recognition){this.recognition.onstart=null;this.recognition.onend=null;this.recognition.onresult=null;this.recognition.onerror=null;this.recognition.abort();this.recognition=null;}}
}
class VoiceAssistantService{
 private snapshot={state:'OFF' as VoiceState,text:'',message:''};private listeners=new Set<()=>void>();
 private provider:SpeechProvider=new BrowserSpeechProvider();private wake:WakeWordProvider={matches:stripWakePhrase};
 private enabled=false;private deadline=0;private timer:ReturnType<typeof setTimeout>|null=null;private restart:ReturnType<typeof setTimeout>|null=null;
 readonly diagnostics={speechRestarts:0,commandsHandled:0,unmatched:0};
 private restarts:number[]=[];private generation=0;wakePhrase='你好，AirDraw';language='zh-CN';feedback=false;volume=.35;
 /** Duplicate-final window and the self-listening mute, both per session. */
 private lastFinalText='';private lastFinalAt=0;private mutedUntil=0;
 getSnapshot=()=>this.snapshot;subscribe=(cb:()=>void)=>{this.listeners.add(cb);return()=>{this.listeners.delete(cb);};};
 private set(state:VoiceState,text='',message=''){this.snapshot={state,text,message};this.listeners.forEach(cb=>cb());}
 setProvider(provider:SpeechProvider){this.stop();this.provider=provider;}
 setWakeWordProvider(provider:WakeWordProvider){this.wake=provider;}
 configure(options:{wakePhrase:string;language:string;feedback:boolean;volume?:number}){const restart=this.enabled&&this.language!==options.language;this.wakePhrase=options.wakePhrase;this.language=options.language;this.feedback=options.feedback;if(typeof options.volume==='number')this.volume=Math.min(Math.max(options.volume,0),1);if(restart){this.stop();this.start();}}
 start=()=>{if(this.enabled)return;this.enabled=true;this.generation++;this.set('REQUESTING_PERMISSION');this.listen();};
 private listen(){if(!this.enabled)return;const generation=this.generation;
  if(this.restart)clearTimeout(this.restart);this.provider.stop();
  try{this.provider.start((text,final)=>{if(generation===this.generation)void this.receive(text,final);},error=>{
   if(generation!==this.generation)return;
   if(error==='no-speech'||error==='aborted')return;
   if(this.snapshot.state==='CONFIRMING')void appCommandBus.send({type:'CANCEL'}).catch(()=>{});this.enabled=false;this.generation++;if(this.timer)clearTimeout(this.timer);if(this.restart)clearTimeout(this.restart);this.provider.stop();this.set('ERROR','',error==='not-allowed'?'麦克风授权被拒绝，手势仍可使用':'语音不可用，请重试');
  },()=>{if(!this.enabled||generation!==this.generation)return;const now=Date.now();this.restarts=this.restarts.filter(t=>now-t<60000);
   if(this.restarts.length>=6){this.enabled=false;this.set('ERROR','','语音连接不稳定，请重试');return;}
   this.restarts.push(now);this.diagnostics.speechRestarts++;this.restart=setTimeout(()=>this.listen(),1000+this.restarts.length*250);
  },this.language,()=>{if(generation===this.generation&&this.snapshot.state==='REQUESTING_PERMISSION')this.set('WAKE_LISTENING');});}catch(error){this.enabled=false;this.set('ERROR','',String((error as Error).message));}
 }
 async receive(text:string,final=true){
  const state=this.snapshot.state;
  if(state==='OFF'||state==='ERROR')return;
  // Self-listening: the synthesiser answers out loud, and the microphone hears it.
  // A short mute after speaking keeps our own confirmation from becoming a command.
  if(Date.now()<this.mutedUntil)return;
  if(state==='WAKE_LISTENING'||state==='SLEEPING'||state==='REQUESTING_PERMISSION'||state==='SUCCESS'){
   const rest=this.wake.matches(text,this.wakePhrase);if(rest===null)return;
   this.deadline=Date.now()+8000;this.set('ACTIVE_LISTENING',rest,'正在听…');this.armTimeout();text=rest;
  }else if(state==='ACTIVE_LISTENING'||state==='CONFIRMING'){text=this.wake.matches(text,this.wakePhrase)??text;this.set(state,text,this.snapshot.message);}
  else return;
  if(!final||!text)return;
  // One utterance, one command: recognisers often hand back the same final result
  // twice at the tail of a phrase. A deliberate repeat comes after the window.
  const signature=normalizeVoice(text);
  if(signature===this.lastFinalText&&Date.now()-this.lastFinalAt<1500)return;
  this.lastFinalText=signature;this.lastFinalAt=Date.now();
  const command=parseVoiceCommand(text);
  if(!command){this.diagnostics.unmatched++;this.set(this.snapshot.state,text,'没有匹配指令，请再说一次');return;}
  if(this.snapshot.state==='CONFIRMING'&&command.type!=='CANCEL'&&!(command.type==='CLEAR_CANVAS'&&command.confirmed))return;
  if(command.type==='CLEAR_CANVAS'&&!command.confirmed){const generation=this.generation;this.set('PROCESSING',text);try{await appCommandBus.send(command);if(generation!==this.generation){void appCommandBus.send({type:'CANCEL'}).catch(()=>{});return;}this.set('CONFIRMING',text,'确认清空吗？');this.deadline=Date.now()+8000;this.armTimeout();}catch(error){this.set('ACTIVE_LISTENING',text,(error as Error).message);this.armTimeout();}return;}
  if(command.type==='CLEAR_CANVAS'&&command.confirmed&&this.snapshot.state!=='CONFIRMING')return;
  this.set('PROCESSING',text);
  if(this.timer)clearTimeout(this.timer);const generation=this.generation;
  try{await appCommandBus.send(command);this.diagnostics.commandsHandled++;if(generation===this.generation)this.success(commandFeedback(command,this.language==='zh-CN'?'zh':'en'));}
  catch(error){if(generation===this.generation){this.set('ACTIVE_LISTENING',text,(error as Error).message);this.deadline=Date.now()+8000;this.armTimeout();}}
 }
 success(message:string){this.set('SUCCESS','',message);if(this.feedback&&'speechSynthesis'in window){const speech=new SpeechSynthesisUtterance(message);speech.lang=this.language;speech.volume=this.volume;this.mutedUntil=Date.now()+1400;window.speechSynthesis.speak(speech);}if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.enabled)this.set('WAKE_LISTENING');},1500);}
 private armTimeout(){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.snapshot.state==='CONFIRMING')void appCommandBus.send({type:'CANCEL'}).catch(()=>{});if(this.enabled)this.set('WAKE_LISTENING');},Math.max(0,this.deadline-Date.now()));}
 stop=()=>{if(this.snapshot.state==='CONFIRMING')void appCommandBus.send({type:'CANCEL'}).catch(()=>{});this.enabled=false;this.generation++;this.provider.stop();if(this.timer)clearTimeout(this.timer);if(this.restart)clearTimeout(this.restart);this.restarts=[];this.set('OFF');};
}
export const voiceAssistant=new VoiceAssistantService();



