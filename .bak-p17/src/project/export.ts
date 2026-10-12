import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {buildProject,disposeObject} from './geometry';
import type {Project} from './types';
import * as THREE from 'three';
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
export async function exportGLB(project:Project){await new Promise(requestAnimationFrame);const group=await buildProject(project);try{
 const downgraded=new Map<THREE.Material,THREE.MeshStandardMaterial>();
 group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const convert=(material:THREE.Material)=>{if(material instanceof THREE.MeshStandardMaterial&&!(material instanceof THREE.MeshPhysicalMaterial))return material;if(downgraded.has(material))return downgraded.get(material)!;const m=material as THREE.MeshPhysicalMaterial;const standard=new THREE.MeshStandardMaterial({color:m.color??'#ffffff',map:m.map??null,normalMap:m.normalMap??null,roughness:Number.isFinite(m.roughness)?m.roughness:.45,metalness:Number.isFinite(m.metalness)?m.metalness:0,emissive:m.emissive??'#000000',opacity:m.transmission>0?.42:m.opacity,transparent:m.transmission>0||m.transparent,side:m.side});downgraded.set(material,standard);return standard;};object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});downgraded.forEach((_replacement,old)=>old.dispose());
 group.updateMatrixWorld(true);const bytes=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});if(!(bytes instanceof ArrayBuffer))throw new Error('GLB 导出失败');downloadBlob(new Blob([bytes],{type:'model/gltf-binary'}),project.name+'.glb');return bytes;}finally{disposeObject(group);}}
export function exportProject(project:Project){downloadBlob(new Blob([JSON.stringify(project)],{type:'application/json'}),project.name+'.airdraw.json');}
export class CanvasRecorder {
 private recorder:MediaRecorder|null=null;private stream:MediaStream|null=null;private chunks:Blob[]=[];started=0;
 get active(){return this.recorder?.state==='recording';}
 start(canvas:HTMLCanvasElement){if(this.active)return;if(typeof MediaRecorder==='undefined'||!canvas.captureStream)throw new Error('浏览器不支持 WebM 录制');const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(MediaRecorder.isTypeSupported);if(!mime)throw new Error('没有可用的 WebM 编码器');this.chunks=[];this.stream=canvas.captureStream(30);this.recorder=new MediaRecorder(this.stream,{mimeType:mime});this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};this.recorder.start(1000);this.started=Date.now();}
 stop(name:string){return new Promise<void>((resolve,reject)=>{const recorder=this.recorder;if(!recorder||recorder.state==='inactive'){reject(new Error('录制尚未开始'));return;}recorder.onstop=()=>{downloadBlob(new Blob(this.chunks,{type:recorder.mimeType}),name+'.webm');this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.recorder=null;this.chunks=[];resolve();};recorder.onerror=()=>{this.dispose();reject(new Error('录制失败'));};recorder.stop();});}
 dispose(){if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();this.stream?.getTracks().forEach(t=>t.stop());this.recorder=null;this.stream=null;this.chunks=[];}
}
export const workspaceRecorder=new CanvasRecorder();
