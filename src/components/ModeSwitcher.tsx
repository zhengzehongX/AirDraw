import { useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { appMode, type WorkspaceMode } from '../app/AppMode';
import { GestureButton } from './GestureButton';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';
const modes:{id:WorkspaceMode;label:TextKey;path:string}[]=[
  {id:'SPATIAL_DRAW',label:'mode.spatial',path:'M4 16c4-12 10 9 15-8M4 20h16'},
  {id:'CANVAS_DRAW',label:'mode.canvas',path:'M4 4h16v16H4zM8 16l8-8M13 8h3v3'},
  {id:'MODEL_CONTROL',label:'mode.model',path:'m12 3 8 5v8l-8 5-8-5V8zM4 8l8 5 8-5M12 13v8'},
];
export function ModeSwitcher({onMode,layout=true}:{onMode?:(mode:WorkspaceMode)=>void;layout?:boolean}){const text=useText();const s=useSyncExternalStore(appMode.subscribe,appMode.getSnapshot);
  // Inside the workspace bar the row decides where this sits, so motion must not
  // project a transform over it: the layout animation leaves the buttons floating
  // above the bar with the container measured at zero size.
  return <motion.nav layout={layout} className="ad-mode-switcher ad-glass" aria-label={text('mode.aria')}>
    {modes.map(m=><GestureButton key={m.id} id={`mode-${m.id}`} label={text(m.label)} active={s.target===m.id} onActivate={()=>onMode?onMode(m.id):appMode.request(m.id)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d={m.path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></GestureButton>)}
  </motion.nav>;
}
