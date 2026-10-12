import {useEffect} from 'react';
import * as THREE from 'three';
import type {DrawEngine} from '../engine/DrawEngine';
import type {Stroke} from '../types/drawing';
import type {Project,SceneObject} from './types';
import {workspace} from './workspace';
import {saveProject} from './storage';
import {themeController} from '../theme/themeController';
import {inspectController} from '../rendering/three/inspectController';
import {isEditable,isVisible,worldMatrix} from './objectGraph';
import {sessionSnapshot} from './sessionSnapshot';
const renderCache=new WeakMap<SceneObject,{objects:readonly SceneObject[];stroke:Stroke}>();
export function renderedStroke(o:SceneObject):Stroke {
  const cached=renderCache.get(o);if(cached?.objects===workspace.project.objects)return cached.stroke;
  const source=o.stroke!,t=o.transform;
  const matrix=worldMatrix(o,workspace.project.objects);
  const stroke={...source,color:o.material.color,material:o.material.preset,width:source.width*(t.scale[0]+t.scale[1])/2,segments:source.segments.map(segment=>segment.map(p=>{const v=new THREE.Vector3((p.x-.5)*16,(.5-p.y)*9,p.z*.35).applyMatrix4(matrix);return{x:v.x/16+.5,y:.5-v.y/9,z:v.z/.35};}))};renderCache.set(o,{objects:workspace.project.objects,stroke});return stroke;
}
export function useProjectBridge(engine:DrawEngine){
 useEffect(()=>{
  let syncing=false,timer:ReturnType<typeof setTimeout>|undefined,disposed=false,lastId=workspace.project.id,lastEnvironment=JSON.stringify([workspace.project.theme,workspace.project.paper,workspace.project.camera]);
  // One stroke→object lookup per workspace emit: a flat per-stroke `objects.find`
  // used to make every paper repaint O(N²) on a full canvas.
  let index=new Map<Stroke,SceneObject>();
  const rebuildIndex=()=>{index=new Map();for(const o of workspace.project.objects)if(o.stroke)index.set(o.stroke,o);};
  const beforeOpen=()=>{syncing=true;try{engine.cancelInput();}finally{syncing=false;}};workspace.beforeOpen=beforeOpen;
  engine.projectHistory={undo:()=>{const changed=workspace.history.undo();workspace.emit();return changed;},redo:()=>{const changed=workspace.history.redo();workspace.emit();return changed;},canUndo:()=>workspace.history.canUndo,canRedo:()=>workspace.history.canRedo};
  engine.projectRender=strokes=>strokes.flatMap(s=>{const o=index.get(s);return o?(isVisible(o,workspace.project.objects)?[renderedStroke(o)]:[]):[s];});
  engine.projectEditable=s=>{const o=index.get(s);return !o||isEditable(o,workspace.project.objects);};
  const unengine=engine.onHistoryChange(()=>{if(syncing||engine.projectCapturePaused)return;syncing=true;workspace.captureStrokes(engine.rawStrokesFor('CANVAS_DRAW'),'CANVAS_DRAW');workspace.captureStrokes(engine.rawStrokesFor('SPATIAL_DRAW'),'SPATIAL_DRAW');syncing=false;});
  const commit=async(snapshot:Project)=>{
    clearTimeout(timer);
    try{await saveProject(snapshot);if(!disposed&&workspace.project.id===snapshot.id&&workspace.project.updatedAt===snapshot.updatedAt){workspace.project=snapshot;workspace.mark('saved');workspace.emit();}}
    catch{if(!disposed&&workspace.project.id===snapshot.id){workspace.mark('error');workspace.emit();}}
  };
  // The debounced autosave is the only copy the user has; a tab closed inside the
  // debounce window must still try to write it.
  const flush=()=>{if(workspace.saveState!=='dirty')return;void commit(sessionSnapshot(engine));};
  const unworkspace=workspace.subscribe(()=>{
    rebuildIndex();
    if(lastId!==workspace.project.id){
      clearTimeout(timer);
      lastId=workspace.project.id;themeController.setMode(workspace.project.theme);engine.canvasBackground=workspace.project.paper;
      const c=workspace.project.camera;inspectController.set(c.yaw,c.pitch,c.distance);
      // The piece carries its own light; that is not the user's global theme, and
      // rewriting the preference here silently undid whatever Settings said.
    }
    const environment=JSON.stringify([workspace.project.theme,workspace.project.paper,workspace.project.camera]);if(environment!==lastEnvironment){lastEnvironment=environment;themeController.setMode(workspace.project.theme);engine.canvasBackground=workspace.project.paper;const c=workspace.project.camera;inspectController.set(c.yaw,c.pitch,c.distance);}
    if(!syncing&&!engine.projectCapturePaused){syncing=true;const objects=workspace.project.objects;engine.replaceProjectStrokes(objects.flatMap(o=>o.type==='stroke2d'&&o.stroke?[o.stroke]:[]),objects.flatMap(o=>o.type==='stroke3d'&&o.stroke?[o.stroke]:[]));syncing=false;}
    if(workspace.saveState!=='dirty')return;
    clearTimeout(timer);const snapshot=sessionSnapshot(engine);timer=setTimeout(()=>void commit(snapshot),1800);
  });
  addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',flush);
  rebuildIndex();
  return()=>{disposed=true;clearTimeout(timer);removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush);unengine();unworkspace();if(workspace.beforeOpen===beforeOpen)workspace.beforeOpen=null;engine.projectHistory=null;engine.projectRender=null;engine.projectEditable=null;};
 },[engine]);
}
