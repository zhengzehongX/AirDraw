import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {modelController as model} from '../model/modelController';
import {GestureButton} from './GestureButton';
import {useInteractive} from '../interaction/useInteractive';
import {workspace} from '../project/workspace';
import {identityTransform} from '../project/types';
import {ensureBuiltinModel} from '../project/builtin';
import {MODEL_LIBRARY,addLibraryModel} from '../model/modelLibrary';
import {useText} from '../i18n';
import {isEditable} from '../project/objectGraph';
import styles from './ModelDock.module.css';
export function ModelDock({onImport}:{onImport:(files:FileList)=>Promise<void>}){
 const text=useText();
 useSyncExternalStore(model.subscribe,model.getSnapshot);useSyncExternalStore(workspace.subscribe,workspace.getSnapshot);
 const selected=workspace.project.objects.find(o=>workspace.selection.includes(o.id)&&isEditable(o,workspace.project.objects));
 const input=useRef<HTMLInputElement>(null),task=useRef<AbortController|null>(null);
 const [tab,setTab]=useState<'object'|'library'>('object'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[scaleValue,setScaleValue]=useState(1);
 const selectedRef=useRef(selected);selectedRef.current=selected;const scaleValueRef=useRef(1);
 useEffect(()=>{const value=selected?.transform.scale[0]??model.scale;scaleValueRef.current=value;setScaleValue(value);},[selected,model.scale]);
 useEffect(()=>()=>{task.current?.abort();model.scalePreview=null;},[]);
 const zone=useInteractive({id:'model-tools-zone',onDrag:(_p,d)=>{if(zone.ref.current)zone.ref.current.scrollTop-=d.y;}});
 const preview=(value:number)=>{value=Math.max(.2,Math.min(4,value));scaleValueRef.current=value;setScaleValue(value);const item=selectedRef.current;if(item)model.scalePreview={id:item.id,value};else{model.scale=value;model.emit();}};
 const commit=(cancelled=false)=>{const item=selectedRef.current,preview=model.scalePreview;model.scalePreview=null;if(!cancelled&&item&&preview?.id===item.id){const ratio=preview.value/item.transform.scale[0];workspace.patch(item.id,{transform:{...item.transform,scale:item.transform.scale.map(n=>n*ratio) as [number,number,number]}},'对象缩放');}};
 const slider=useInteractive({id:'model-scale-slider',isDisabled:()=>!selected,onDrag:(_p,d)=>preview(scaleValueRef.current*Math.exp(d.x*.005)),onPressEnd:commit});
 const load=async(work:(signal:AbortSignal)=>Promise<void>)=>{if(task.current)return;const controller=new AbortController();task.current=controller;setBusy(true);setError('');try{await work(controller.signal);}catch(e){if(!controller.signal.aborted)setError(String(e));}finally{if(task.current===controller){task.current=null;if(!controller.signal.aborted)setBusy(false);}}};
 const chooseTab=(next:typeof tab)=>{commit(true);setTab(next);};
 return <aside ref={zone.ref as React.RefObject<HTMLElement>} className={`ad-context-dock ${styles.panel}`} aria-label={text('model.aria')}>
  <header className={styles.intro}><span>{text('model.studio')}</span><h2>{selected?.name??text('model.selectObject')}</h2><p>{text(model.worldActive?'model.worldActive':'model.sessionHint')}</p></header>
  <nav className={styles.tabs} aria-label={text('model.scope')}>{(['object','library'] as const).map(key=><GestureButton key={key} id={`model-tab-${key}`} label={text(key==='object'?'model.objectTab':'model.libraryTab')} active={tab===key} onActivate={()=>chooseTab(key)}/>)}</nav>
  <div className={styles.body}>
  {tab==='object'&&<>
   <section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.oneHand')}</h3><div className={styles.transform}>{(['Move','Rotate','Scale'] as const).map(tool=><GestureButton key={tool} id={`model-${tool}`} label={text(tool==='Move'?'model.move':tool==='Rotate'?'model.rotate':'model.scale')} active={model.tool===tool} onActivate={()=>{commit(true);model.setTool(tool);}}/>)}</div>
    <p className={styles.note}>{text(model.tool==='Move'?'model.moveHint':model.tool==='Rotate'?'model.rotateHint':'model.scaleHint')} {text('model.toolCycle')}</p>
    <label className={styles.scale} ref={slider.ref as React.RefObject<HTMLLabelElement>}><span>{text('model.scale')}<output>{scaleValue.toFixed(2)}×</output></span><input type="range" min=".2" max="4" step=".01" disabled={!selected} aria-label={text('model.scaleAria')} value={scaleValue} onChange={e=>preview(Number(e.target.value))} onPointerUp={()=>commit()} onKeyUp={()=>commit()} onBlur={()=>commit()}/></label>
    <div className="ad-tool-grid"><GestureButton id="model-reset" label={text('common.reset')} disabled={!selected} onActivate={()=>{if(selected)workspace.patch(selected.id,{transform:identityTransform()},'重置对象');}}/><GestureButton id="model-group" label={text('model.group')} disabled={workspace.selection.length<2} onActivate={()=>workspace.group()}/></div>
   </section>
   <section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.objects')}</h3><div className={styles.objects}>{workspace.project.objects.filter(o=>!o.parentId&&!['camera','light','background'].includes(o.type)).map(o=><GestureButton key={o.id} id={`model-object-${o.id}`} label={o.name} active={workspace.selection.includes(o.id)} disabled={!isEditable(o,workspace.project.objects)} onActivate={()=>workspace.select(o.id)}/>)}</div></section>
   <GestureButton id="model-fit-selection" label={text('model.frameSelected')} disabled={!selected} onActivate={()=>model.frameWorld('selection')}/>
   <section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.snap')}</h3><div className="ad-tool-grid">{(['off','grid','angle','center'] as const).map(snap=><GestureButton key={snap} id={`snap-${snap}`} label={snap==='off'?text('model.snapOff'):snap==='grid'?text('model.snapGrid'):snap==='angle'?'15°':text('model.snapCenter')} active={model.snap===snap} onActivate={()=>{model.snap=snap;model.emit();}}/>)}</div></section>
   <section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.twoHands')}</h3><p className={styles.note}>{text('model.worldHint')}</p><div className="ad-tool-grid"><GestureButton id="world-fit-all" label={text('model.frameAll')} onActivate={()=>model.frameWorld('all')}/><GestureButton id="world-reset" label={text('model.resetView')} onActivate={()=>model.resetWorld()}/></div><p className={styles.note}>{text('model.worldSafe')}</p></section>
   <section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.waterTitle')}</h3><p className={styles.note}>{text('model.waterHint')}</p></section>
   <div className={styles.delete}><GestureButton id="model-delete" label={text('model.remove')} holdMs={1200} disabled={!selected} onActivate={()=>{if(selected)workspace.remove(selected.id);}}/></div>
  </>}
  {tab==='library'&&<section className="ad-railGroup"><h3 className="ad-railGroupTitle">{text('model.assets')}</h3><GestureButton id="model-import" label={text('model.import')} disabled={busy} onActivate={()=>input.current?.click()}/><p className={styles.note}>{text('model.importNote')}</p><div className={styles.library}>
   {MODEL_LIBRARY.map(asset=><div className={styles.asset} key={asset.id}><GestureButton id={`model-sample-${asset.id}`} label={text(asset.title)} disabled={busy} onActivate={()=>void load(signal=>addLibraryModel(asset.file,signal))}><svg aria-hidden="true" viewBox="0 0 160 100" className={styles.preview}>{asset.id==='avocado'?<><path d="M80 12C65 12 42 43 42 65a38 28 0 0 0 76 0c0-22-23-53-38-53Z" fill="#568668"/><path d="M80 20c-12 0-28 28-28 43a28 21 0 0 0 56 0c0-15-16-43-28-43Z" fill="#d2df9a"/><circle cx="80" cy="65" r="15" fill="#936644"/></>:<><path d="M27 62h105l-10-23H66L52 51H30Z" fill="#aeb7cb"/><path d="M68 42h20v16H58Zm25 0h25l6 16H93Z" fill="#eef3fa"/><circle cx="52" cy="67" r="11" fill="#384151"/><circle cx="111" cy="67" r="11" fill="#384151"/><circle cx="52" cy="67" r="5" fill="#dae0e8"/><circle cx="111" cy="67" r="5" fill="#dae0e8"/></>}</svg></GestureButton><p>{text(asset.description)}</p><small>{asset.credit}</small></div>)}
   <GestureButton id="model-example" label={text('model.example')} disabled={busy} onActivate={()=>void load(()=>ensureBuiltinModel(true))}/>
  </div><a href="https://github.com/KhronosGroup/glTF-Sample-Assets" target="_blank" rel="noreferrer">{text('model.source')}</a></section>}
  <input ref={input} type="file" multiple accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp" hidden onChange={e=>{const files=e.target.files;if(files)void load(()=>onImport(files));e.target.value='';}}/>
  {busy&&<p role="status">{text('model.loading')}</p>}{error&&<p role="alert">{error}</p>}
  </div>
 </aside>;
}
