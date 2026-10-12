import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {buildProject,disposeObject} from './geometry';
import type {Project} from './types';
import * as THREE from 'three';
import {captureArtworkCanvas} from '../rendering/three/capture';
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
export async function exportGLB(project:Project){await new Promise(requestAnimationFrame);const group=await buildProject(project);try{
 const downgraded=new Map<THREE.Material,THREE.MeshStandardMaterial>();
 group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const convert=(material:THREE.Material)=>{if(material instanceof THREE.MeshStandardMaterial&&!(material instanceof THREE.MeshPhysicalMaterial))return material;if(downgraded.has(material))return downgraded.get(material)!;const m=material as THREE.MeshPhysicalMaterial;const standard=new THREE.MeshStandardMaterial({color:m.color??'#ffffff',map:m.map??null,normalMap:m.normalMap??null,roughness:Number.isFinite(m.roughness)?m.roughness:.45,metalness:Number.isFinite(m.metalness)?m.metalness:0,emissive:m.emissive??'#000000',opacity:m.transmission>0?.42:m.opacity,transparent:m.transmission>0||m.transparent,side:m.side});downgraded.set(material,standard);return standard;};object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});downgraded.forEach((_replacement,old)=>old.dispose());
 group.updateMatrixWorld(true);const bytes=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});if(!(bytes instanceof ArrayBuffer))throw new Error('GLB 导出失败');downloadBlob(new Blob([bytes],{type:'model/gltf-binary'}),project.name+'.glb');return bytes;}finally{disposeObject(group);}}
export function exportProject(project:Project){downloadBlob(new Blob([JSON.stringify(project)],{type:'application/json'}),project.name+'.airdraw.json');}
export class CanvasRecorder {
 private raf=0;private lastFrame=0;private recordingError:Error|null=null;
 private recorder:MediaRecorder|null=null;private stream:MediaStream|null=null;private chunks:Blob[]=[];started=0;
 get active(){return this.recorder?.state==='recording';}
 start(canvas:HTMLCanvasElement){
  if(this.active)return;
  if(typeof MediaRecorder==='undefined'||!canvas.captureStream)throw new Error('浏览器不支持 WebM 录制');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(MediaRecorder.isTypeSupported);
  if(!mime)throw new Error('没有可用的 WebM 编码器');
  const first=captureArtworkCanvas({scale:1,background:'theme'});
  if(!first)throw new Error('作品画面尚未就绪');
  const output=document.createElement('canvas');output.width=first.width;output.height=first.height;
  const ctx=output.getContext('2d');if(!ctx)throw new Error('录制画布不可用');ctx.drawImage(first,0,0);
  this.chunks=[];this.recordingError=null;this.stream=output.captureStream(0);
  if(typeof (this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame!=='function'){
   this.stream.getTracks().forEach(track=>track.stop());this.stream=output.captureStream(30);
  }
  try{this.recorder=new MediaRecorder(this.stream,{mimeType:mime});this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};this.recorder.onerror=()=>{this.recordingError=new Error('录制失败，请重试');};this.recorder.start(1000);}catch(error){this.dispose();throw error;}
  const videoTrack=this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const publishFrame=()=>videoTrack.requestFrame?.();
  ctx.drawImage(first,0,0);
  publishFrame();
  this.started=Date.now();this.lastFrame=0;
  const draw=(now:number)=>{
   if(!this.active)return;
   this.raf=requestAnimationFrame(draw);
   if(now-this.lastFrame<1000/30)return;this.lastFrame=now;
   try{const picture=captureArtworkCanvas({scale:1,background:'theme'});if(!picture)throw new Error('作品画面暂时不可用');ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(picture,0,0,output.width,output.height);publishFrame();}catch(error){this.recordingError=error instanceof Error?error:new Error(String(error));cancelAnimationFrame(this.raf);}
  };this.raf=requestAnimationFrame(draw);
 }
 stop(name:string){cancelAnimationFrame(this.raf);return new Promise<void>((resolve,reject)=>{const recorder=this.recorder;if(!recorder){reject(new Error('录制尚未开始'));return;}recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:recorder.mimeType});const failure=this.recordingError??(blob.size===0?new Error('没有录到有效画面，请重试'):null);if(!failure)downloadBlob(blob,name+'.webm');this.dispose();failure?reject(failure):resolve();};if(recorder.state==='inactive')recorder.dispatchEvent(new Event('stop'));else recorder.stop();});}
 dispose(){cancelAnimationFrame(this.raf);if(this.recorder){this.recorder.onstop=null;this.recorder.onerror=null;this.recorder.ondataavailable=null;if(this.recorder.state!=='inactive')this.recorder.stop();}this.stream?.getTracks().forEach(t=>t.stop());this.recorder=null;this.stream=null;this.chunks=[];}
}
export const workspaceRecorder=new CanvasRecorder();
