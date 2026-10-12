import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DrawEngine } from '../../engine/DrawEngine';
import { appMode } from '../../app/AppMode';
import { paintPaper, PAPER_HEIGHT, PAPER_WIDTH } from '../canvas2d/freehand';
export function CanvasPlane({engine}:{engine:DrawEngine}){
  const group=useRef<THREE.Group>(null),material=useRef<THREE.MeshBasicMaterial>(null);
  const resources=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=PAPER_WIDTH;canvas.height=PAPER_HEIGHT;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return{canvas,texture};},[]);
  const dirty=useRef(true),last=useRef('');
  useEffect(()=>engine.onHistoryChange(()=>{dirty.current=true;}),[engine]);
  useEffect(()=>()=>resources.texture.dispose(),[resources]);
  useFrame(()=>{
    // The infinite board draws the 2D ink in its own DOM layer; the textured plane
    // would paint the same strokes a second time, one pixel off and one zoom behind.
    if(engine.hasDomRenderer){if(group.current)group.current.visible=false;return;}
    const weights=appMode.weights();
    const weight=weights.CANVAS_DRAW,model=weights.MODEL_CONTROL;
    const strokes=engine.strokesFor('CANVAS_DRAW');
    const boardVisible=strokes.length>0;
    if(group.current){group.current.visible=weight>.001||boardVisible;group.current.scale.setScalar(.65+.35*weight);group.current.rotation.x=(1-weight)*-.55;group.current.position.z=-3*(1-weight);}
    // In Model Control each project object is already its own mesh, so the paper's
    // copy of the same ink fades out instead of drawing the stroke twice.
    if(material.current)material.current.opacity=(weight+(1-weight)*.2)*(1-model);
    if((weight<.001&&!boardVisible)||model>.999)return;
    const active=engine.workspaceMode==='CANVAS_DRAW'?engine.activeStroke:null;
    const signature=`${active?.id}:${active?.segments.map(s=>s.length).join(',')}:${engine.canvasBackground}:${active?.tool}`;
    if(dirty.current||last.current!==signature){last.current=signature;dirty.current=false;paintPaper(resources.canvas,active?[...strokes,active]:strokes,engine.canvasBackground==='white'?'#ffffff':engine.canvasBackground==='dark'?'#242b36':'transparent');resources.texture.needsUpdate=true;}
  });
  return <group ref={group}><mesh position={[0,0,-.02]}><planeGeometry args={[16.15,9.15]}/><meshPhysicalMaterial color="#cedaea" transparent opacity={.18} roughness={.3}/></mesh><mesh><planeGeometry args={[16,9]}/><meshBasicMaterial ref={material} map={resources.texture} transparent depthWrite={false} toneMapped={false}/></mesh></group>;
}
