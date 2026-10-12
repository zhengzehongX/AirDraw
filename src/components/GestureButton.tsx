import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../design/motion';
import { useInteractive } from '../interaction/useInteractive';

/**
 * Every tool button draws its own glyph from its id, in this order — first match wins,
 * because `model-remove` must not be caught by a looser rule and `snap-center` must not
 * read as `dock-center`. The list used to be one 40-branch ternary inside the JSX, which
 * made "give these buttons real icons" an edit nobody could review; a falling back to a
 * plus is now visible as exactly that: an id nobody gave a glyph.
 */
const ICONS: { match: RegExp; path: string }[] = [
  {match:/world-Orbit/,path:'M12 4a8 8 0 1 0 8 8M12 2v4M20 8v4h-4'},
  {match:/world-Pan/,path:'M12 3v18M3 12h18M8 7l4-4 4 4M7 16l-4-4 4-4'},
  {match:/world-Zoom/,path:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14 14l6 6M7 10h6M10 7v6'},
  {match:/model-tab-world/,path:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18'},
  {match:/model-tab-library/,path:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'},
  {match:/model-tab-object|model-object-/,path:'M12 3l8 5v8l-8 5-8-5V8zM4 8l8 5 8-5M12 13v8'},
  {match:/creation-canvas/,path:'M4 4h16v16H4zM8 16l8-8M13 8h3v3'},
  {match:/creation-close/,path:'M6 6l12 12M18 6 6 18'},
  { match: /layers/, path: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
  { match: /make3d|make-confirm/, path: 'M12 3l9 5v9l-9 5-9-5V8l9-5zM3 8l9 5 9-5M12 13v9' },
  { match: /close/, path: 'M6 6l12 12M6 18 18 6' },
  { match: /save|json|glb|export/, path: 'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4' },
  { match: /copy|duplicate/, path: 'M8 8h12v12H8zM4 16V4h12' },
  { match: /lock/, path: 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3' },
  { match: /visibility/, path: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6' },
  { match: /workspace-back|lab-back|lab-leave/, path: 'M15 5l-7 7 7 7' },
  { match: /dock-toggle/, path: 'M4 6h16M4 12h10M4 18h16' },
  { match: /gesture-pause/, path: 'M8 5v14M16 5v14' },
  { match: /lab-retry/, path: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4' },
  { match: /projects/, path: 'M4 6h7l2 2h7v10H4z' },
  { match: /gallery/, path: 'M4 6h16v12H4zM4 15l4.5-4 3.5 3 3-2.5L20 15' },
  { match: /guide|help/, path: 'M12 5c-2-1.4-4.5-1.4-6.5 0v13c2-1.4 4.5-1.4 6.5 0 2-1.4 4.5-1.4 6.5 0V5c-2-1.4-4.5-1.4-6.5 0Zm0 0v13' },
  { match: /settings/, path: 'M4 8h10m4 0h2M4 16h4m4 0h8M16 5.5v5M8 13.5v5' },
  { match: /theme/, path: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0-3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4' },
  { match: /voice/, path: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5ZM6 10v1a6 6 0 0 0 12 0v-1M12 17v4M9 21h6' },
  { match: /recognition/, path: 'M5 12l4 4L19 6' },
  { match: /pen|marker|highlight/, path: 'M5 19l3-1L19 7l-3-3L5 15v4zM13 7l3 3' },
  { match: /paper/, path: 'M5 3h14v18H5z' },
  { match: /Move/, path: 'M12 3v18M3 12h18m-4-3 3 3-3 3M9 6l3-3 3 3' },
  { match: /Rotate/, path: 'M5 8a8 8 0 1 1-1 7M5 3v5h5' },
  { match: /Scale/, path: 'M4 14v6h6M14 4h6v6M4 20 20 4' },
  { match: /reset/, path: 'M5 8a8 8 0 1 1-1 7M5 3v5h5' },
  { match: /delete|remove/, path: 'M5 7h14M8 7v13h8V7M9 4h6' },
  { match: /png|svg/, path: 'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4' },
  { match: /^surface-wood$/, path: 'M4 8c4-2.5 12-2.5 16 0M4 12.5c4-2.5 12-2.5 16 0M4 17c4-2.5 12-2.5 16 0' },
  { match: /^surface-metal$/, path: 'M12 3a9 9 0 1 0 .01 18 9 9 0 0 0-.01-18zM7.5 15.5 15 8M10 17.5 17 10.5' },
  { match: /^surface-stone$/, path: 'M12 3a9 9 0 1 0 .01 18 9 9 0 0 0-.01-18zM9 9.5h.01M14.5 9h.01M11 14h.01M15 14.5h.01' },
  { match: /^surface-/, path: 'M12 3a9 9 0 1 0 .01 18 9 9 0 0 0-.01-18z' },
  // Below these sit the additions of the workspace pass: the ids that used to fall
  // through to a plus. Nothing above them matches these strings.
  { match: /^snap-off$/, path: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM6 18 18 6' },
  { match: /^snap-grid$/, path: 'M4 9h16M4 15h16M9 4v16M15 4v16' },
  { match: /^snap-angle$/, path: 'M5 19h14M5 19 14 6M10 19a6 6 0 0 0-1.6-4' },
  { match: /center/, path: 'M4 4h4M16 4h4M4 20h4M16 20h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z' },
  { match: /import/, path: 'M12 4v9m-4-4 4 4 4-4M4 16v4h16v-4' },
  { match: /group/, path: 'M8 4H4v16h4M16 4h4v16h-4M10 12h4' },
  { match: /example|sample/, path: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5 12 12l8-4.5M12 12v9' },
  { match: /dock-color/, path: 'M12 3a9 9 0 1 0 0 18 3 3 0 0 0 3-3 2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 9 9 0 0 0-10-10zM7.5 12h.01M10 8.5h.01M14 8h.01' },
  { match: /material/, path: 'M12 3a9 9 0 1 0 .01 18 9 9 0 0 0-.01-18zM7.5 14.5a5 5 0 0 1 5-5' },
  { match: /size|width/, path: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4' },
  { match: /erase/, path: 'M7 17h10M5 14 12 7l5 5-7 7H7z' },
  { match: /undo/, path: 'M9 14 5 10l4-4M5 10h9a5 5 0 0 1 0 10H9' },
  { match: /redo/, path: 'M15 14l4-4-4-4M19 10h-9a5 5 0 0 0 0 10h5' },
  { match: /pressure/, path: 'M5 18a8 8 0 1 1 14 0M12 14l3.5-3.5' },
  { match: /fit/, path: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
  { match: /percent/, path: 'M6 18 18 6M8 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM19 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z' },
];

const FALLBACK_ICON = 'M5 12h14M12 5v14';

function iconFor(id: string): string {
  for (const icon of ICONS) if (icon.match.test(id)) return icon.path;
  return FALLBACK_ICON;
}

export function GestureButton({id,label,children,onActivate,active=false,disabled=false,holdMs,scope}:{id:string;label:string;children?:React.ReactNode;onActivate:()=>void;active?:boolean;disabled?:boolean;holdMs?:number;scope?:string}) {
  const systemReduced=useReducedMotion();
  const reduced=systemReduced||document.documentElement.dataset.reducedMotion==='on';
  const {ref,scale,glow,hold}=useInteractive({id,scope,onActivate:holdMs?undefined:onActivate,onHoldComplete:holdMs?onActivate:undefined,holdMs,magnet:6,isDisabled:()=>disabled});
  // A hold-only button must stay reachable without a hand: pointer and keyboard
  // run the same confirmation, with the same ring.
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const stop=()=>{if(!timer.current)return;clearTimeout(timer.current);timer.current=null;ref.current?.removeAttribute('data-pointer-hold');};
  const start=()=>{if(holdMs===undefined||disabled||timer.current)return;ref.current?.setAttribute('data-pointer-hold','');ref.current?.style.setProperty('--hold-ms',`${holdMs}ms`);timer.current=setTimeout(()=>{timer.current=null;ref.current?.removeAttribute('data-pointer-hold');onActivate();},holdMs);};
  useEffect(()=>stop,[]);
  const press=holdMs===undefined?{}:{onPointerDown:start,onPointerUp:stop,onPointerLeave:stop,onPointerCancel:stop,onBlur:stop,onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==='Enter'||event.key===' ')start();},onKeyUp:stop};
  // The pointer's give-way comes from `ad-press` (the CSS `scale` property) rather than
  // a Motion `whileTap`: `style.scale` belongs to the gesture magnet's MotionValue, and
  // Motion will not animate a value that style already owns.
  return <motion.button ref={ref as React.RefObject<HTMLButtonElement>} className="ad-tool-button ad-press" data-gesture-id={id} data-dock-item={id} data-testid={id} style={{scale,'--glow':glow,'--hold':hold} as unknown as React.CSSProperties} whileHover={reduced?undefined:{y:-1}} transition={reduced?{duration:0}:motionTokens.hover} onClick={holdMs?undefined:onActivate} data-active={active} disabled={disabled} aria-label={label} title={label} {...press}>
    {holdMs&&<svg className="ad-hold-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" pathLength="1" strokeDasharray="1" style={{strokeDashoffset:'calc(1 - var(--hold))'}}/></svg>}
    {children??<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d={iconFor(id)} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}<span>{label}</span>
  </motion.button>;
}
