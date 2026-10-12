import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { DrawEngine } from '../engine/DrawEngine';
import { DEFAULT_CONTACT } from '../utils/gesture/PinchContactDetector';
import { GestureButton } from './GestureButton';
import { PinchCalibrationSession } from '../utils/gesture/PinchCalibrationSession';
import { readPreferences,updatePreferences } from '../app/preferences';
import {cameraService} from '../services/handTracking/CameraService';
import { useText } from '../i18n';
/** Each natural close/open cycle records its stable minimum. No mouse-labelled contact samples. */
/**
 * Calibration is an offer, not a gate. The defaults already reach a real pinch, and a
 * visitor who cannot finish the three cycles must still be able to draw.
 */
export function CalibrationOffer({onStart,onSkip}:{onStart:()=>void;onSkip:()=>void}){
  const text=useText();
  return <div className="ad-calibration-position">
    <section className="ad-calibration ad-calibration-offer ad-glass" aria-label={text('calibration.offerAria')}>
      <h2>{text('calibration.title')}</h2>
      <p>{text('calibration.offerBody')}</p>
      <div className="ad-calibration-actions">
        <GestureButton id="calibration-start" label={text('calibration.start')} onActivate={onStart}/>
        <GestureButton id="calibration-later" label={text('calibration.later')} onActivate={onSkip}/>
      </div>
    </section>
  </div>;
}

export function PinchCalibration({engine,onDone}:{engine:DrawEngine;onDone:()=>void}){
  const text=useText();
  const [count,setCount]=useState(0);const [message,setMessage]=useState<string|null>(null);const cycle=useRef(new PinchCalibrationSession());
  const completed=useRef(false);
  useEffect(()=>engine.onCursor(()=>{
    if(completed.current)return;
    const c=cycle.current,profile=c.update(engine.contact,engine.tracking.primary);
    setCount(c.samples.length);setMessage(c.message);
    if(profile){
      completed.current=true;
      profile.pointerSensitivity=readPreferences().pointerSensitivity;
      profile.dominantHand=readPreferences().dominantHand;
      const settings=cameraService.getSnapshot().stream?.getVideoTracks()[0]?.getSettings();
      profile.camera={deviceId:settings?.deviceId,width:settings?.width,height:settings?.height};profile.version=2;
      try{localStorage.setItem('airdraw-pinch-calibration',JSON.stringify(profile));}catch{/* Session profile still works. */}
      engine.setContactProfile(profile);onDone();
      updatePreferences({dominantHand:profile.dominantHand});
    }
  }),[engine,onDone]);
  return <div className="ad-calibration-position"><motion.section className="ad-calibration ad-glass" initial={{opacity:0,scale:.98}} animate={{opacity:1,scale:1}} aria-label="Pinch Calibration">
    <h2>{text('calibration.title')}</h2><p>{text('calibration.steps')}</p><div className="ad-calibration-ring">{count} / 3</div><p aria-live="polite">{message ?? text('calibration.openFingers')}</p>
    <GestureButton scope="calibration" id="calibration-default" label={text('calibration.useDefault')} onActivate={()=>{engine.setContactProfile({...DEFAULT_CONTACT});onDone();}}/>
  </motion.section></div>;
}
