import {useState} from 'react';
import type {DrawEngine} from '../engine/DrawEngine';
import {GestureButton} from './GestureButton';
import {useInteractive} from '../interaction/useInteractive';
import {useText} from '../i18n';
import type {TextKey} from '../i18n/zh';
const SURFACE_LABELS: TextKey[] = ['surface.smooth', 'surface.wood', 'surface.metal', 'surface.stone'];
export function SurfaceDock({engine,focus}:{engine:DrawEngine;focus:boolean}){const [,refresh]=useState(0);const text=useText();const zone=useInteractive({id:'surface-zone'});return <aside ref={zone.ref as React.RefObject<HTMLElement>} className="ad-surface-dock ad-glass" data-focus={focus} aria-label={text('surface.aria')}><div className="ad-tool-grid">{([undefined,'wood','metal','stone'] as const).map((surface,i)=><GestureButton key={i} id={`surface-${surface??'smooth'}`} label={text(SURFACE_LABELS[i])} active={engine.surface===surface} onActivate={()=>{engine.surface=surface;refresh(n=>n+1);}}/>)}</div></aside>;}
