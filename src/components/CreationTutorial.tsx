import {useEffect,useState,useSyncExternalStore} from 'react';
import {motion} from 'motion/react';
import {workspace} from '../project/workspace';
import {appMode} from '../app/AppMode';
import {GestureButton} from './GestureButton';
import {analyzeGeometry} from '../recognition/geometry';
import {useText} from '../i18n';
import type {TextKey} from '../i18n/zh';
/** Keys, not copy: a module-level translated array would freeze the language at import. */
const messages:TextKey[]=['creation.step1','creation.step2','creation.step3','creation.step4','creation.step5'];
/** Advances on actual object/gesture edits; never advances on an animation timer. */
export function CreationTutorial({hidden=false}:{hidden?:boolean}){
 useSyncExternalStore(workspace.subscribe,workspace.getSnapshot);const text=useText();const [step,setStep]=useState(0),[closed,setClosed]=useState(false),[source,setSource]=useState(''),[initialRotation,setInitialRotation]=useState('');
 useEffect(()=>{const objects=workspace.project.objects;
  if(step===0){const circle=objects.find(o=>o.type==='stroke2d'&&o.stroke&&analyzeGeometry(o.stroke.segments.flat())?.kind==='circle');if(circle){setSource(circle.id);setStep(1);}}
  if(step===1&&objects.find(o=>o.id===source)?.recognition==='geometry')setStep(2);
  if(step===2){const solid=objects.find(o=>o.conversion?.sourceId===source);if(solid){setInitialRotation(JSON.stringify(solid.transform.rotation));setStep(3);}}
  if(step===3){const solid=objects.find(o=>o.conversion?.sourceId===source);if(solid&&JSON.stringify(solid.transform.rotation)!==initialRotation){setStep(4);try{localStorage.setItem('airdraw-make3d-tutorial','done');}catch{/* Optional tutorial progress. */}}}
 },[workspace.revision,step,source,initialRotation]);
 if(closed||hidden)return null;
 return <div className="ad-creation-coach-position"><motion.aside className="ad-creation-coach ad-glass" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><small>Make 3D · {Math.min(4,step+1)} / 4</small><p>{text(messages[step])}</p>{step===0&&<GestureButton id="creation-canvas" label={text('creation.enterCanvas')} onActivate={()=>appMode.request('CANVAS_DRAW')}/>}<GestureButton id="creation-close" label={step===4?text('common.done'):text('creation.later')} onActivate={()=>setClosed(true)}/></motion.aside></div>;
}
