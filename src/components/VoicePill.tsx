import {useSyncExternalStore} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {voiceAssistant} from '../voice/VoiceAssistantService';
import {useText} from '../i18n';
import {GestureButton} from './GestureButton';
import {motionTokens} from '../design/motion';
export type VoicePanelAnchor = { top?: number | string };
/**
 * The listening read-out on its own, so the workspace bar can host it next to the
 * voice button instead of hanging a second floating control off the viewport.
 */
export function VoiceStatusPanel({anchor={}}: { anchor?: VoicePanelAnchor } = {}){
 const voice=useSyncExternalStore(voiceAssistant.subscribe,voiceAssistant.getSnapshot);
 const text=useText();
 const expanded=['ACTIVE_LISTENING','PROCESSING','CONFIRMING','SUCCESS','ERROR'].includes(voice.state);
 return <AnimatePresence>{expanded&&<motion.div className="ad-glass" role="status" initial={{opacity:0,scale:.96,y:-8,filter:'blur(4px)'}} animate={{opacity:1,scale:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,scale:.96}} transition={motionTokens.panel} style={{position:'absolute',right:0,top:anchor.top??72,minWidth:200,maxWidth:320,padding:24,borderRadius:28}}>
  {voice.state==='ACTIVE_LISTENING'&&<div className="ad-voice-wave" aria-hidden="true">{[0,1,2,3,4].map(i=><motion.i key={i} animate={{scaleY:[.5,1,.5]}} transition={{duration:.8,repeat:Infinity,delay:i*.08}}/>)}</div>}
  <div>{voice.message||text('voice.listening')}</div><small>{voice.text.slice(0,32)}</small>
  {voice.state==='CONFIRMING'&&<GestureButton id="voice-confirm-clear" label={text('voice.confirmClear')} onActivate={()=>void voiceAssistant.receive('确认清空')}/>}
  {voice.state==='CONFIRMING'&&<GestureButton id="voice-cancel" label={text('common.cancel')} onActivate={()=>void voiceAssistant.receive('取消')}/>}
  {voice.state==='ACTIVE_LISTENING'&&<small data-testid="voice-wake-hint">{text('voice.wakeHint',{phrase:voiceAssistant.wakePhrase})}</small>}
 </motion.div>}</AnimatePresence>;
}
export function VoicePill(){
 const voice=useSyncExternalStore(voiceAssistant.subscribe,voiceAssistant.getSnapshot);
 const text=useText();
 return <div className="ad-voice-control" style={{position:'absolute',top:8,right:88,zIndex:80}}>
  <GestureButton id="voice-toggle" label={voice.state==='OFF'?text('voice.enable'):text('voice.idle')} onActivate={()=>voice.state==='OFF'||voice.state==='ERROR'?voiceAssistant.start():voiceAssistant.stop()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5zM6 10v1a6 6 0 0 0 12 0v-1M12 17v4M9 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></GestureButton>
  <VoiceStatusPanel/>
 </div>;
}
