import { useState } from 'react';
import { GestureButton } from './GestureButton';
import { loadTrackingConfig, type TrackingConfig } from '../services/handTracking/workerProtocol';
import {MockRecognitionProvider,setRecognitionProvider} from '../recognition/provider';
import { loadContactProfile } from '../utils/gesture/PinchContactDetector';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';
const CONFIDENCE_LABELS: TextKey[] = ['tuning.detection', 'tuning.presence', 'tuning.tracking'];
export function TrackingTuning({configure,onCalibrate,onResetContact,developer=false}:{configure:(config:TrackingConfig)=>void;onCalibrate:()=>void;onResetContact:()=>void;developer?:boolean}){
 const text=useText();
 const [config,setConfig]=useState(loadTrackingConfig);const update=(next:TrackingConfig)=>{setConfig(next);configure(next);};
 const contact=loadContactProfile();
 const learned=typeof contact.calibratedAt==='string'?new Date(contact.calibratedAt):null;
 return <section className="ad-tracking-tuning"><h3>{text('tuning.title')}</h3><p className="ad-caption">{learned?text('settings.calibratedOn',{date:learned.toLocaleDateString()}):text('settings.calibrationGeneric')}</p><div className="ad-tool-grid">{(['AUTO','GPU','CPU'] as const).map(delegate=><GestureButton scope="settings" key={delegate} id={`delegate-${delegate}`} label={delegate} active={config.delegate===delegate} onActivate={()=>update({...config,delegate})}/>)}<GestureButton scope="settings" id="recalibrate" label={text('settings.recalibrate')} onActivate={onCalibrate}/><GestureButton scope="settings" id="contact-reset" label={text('settings.resetContact')} disabled={!learned} onActivate={onResetContact}/></div>
 {developer&&(['detection','presence','tracking'] as const).map((key,i)=><div key={key}><p>{text(CONFIDENCE_LABELS[i])} {config[key].toFixed(2)}</p><div className="ad-tool-grid"><GestureButton scope="settings" id={`${key}-lower`} label={text('tuning.lower')} disabled={config[key]<=.35} onActivate={()=>update({...config,[key]:Math.max(.3,config[key]-.05)})}/><GestureButton scope="settings" id={`${key}-higher`} label={text('tuning.higher')} disabled={config[key]>=.9} onActivate={()=>update({...config,[key]:Math.min(.95,config[key]+.05)})}/></div></div>)}
 {developer&&<div><p>{text('tuning.mockNote')}</p><div className="ad-tool-grid"><GestureButton scope="settings" id="recognition-mock" label="Mock Hello" onActivate={()=>setRecognitionProvider(new MockRecognitionProvider('Hello'))}/><GestureButton scope="settings" id="recognition-off" label={text('tuning.mockOff')} onActivate={()=>setRecognitionProvider(null)}/></div></div>}
 </section>;
}
