import * as THREE from 'three';
/** Trace the user's installed system font. Font binaries are never distributed. */
export function textShapes(text:string):THREE.Shape[]{
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('文字矢量化不可用');
 ctx.font='128px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';ctx.fillStyle='#ffffff';ctx.fillText(text.slice(0,20),8,144,1008);
 const image=ctx.getImageData(0,0,canvas.width,canvas.height),edges=new Map<string,[number,number][]>(),w=canvas.width,h=canvas.height;
 const filled=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&image.data[(y*w+x)*4+3]>128;
 const add=(a:[number,number],b:[number,number])=>{const key=a.join(',');edges.set(key,[...(edges.get(key)??[]),b]);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(filled(x,y)){if(!filled(x,y-1))add([x,y],[x+1,y]);if(!filled(x+1,y))add([x+1,y],[x+1,y+1]);if(!filled(x,y+1))add([x+1,y+1],[x,y+1]);if(!filled(x-1,y))add([x,y+1],[x,y]);}
 const path=new THREE.ShapePath();let guard=0;
 while(edges.size&&guard++<w*h){const first=edges.keys().next().value!;let current=first,points:[number,number][]=[];
  do{const [x,y]=current.split(',').map(Number);points.push([x/100-4,1.44-y/100]);const next=edges.get(current)?.pop();if(!edges.get(current)?.length)edges.delete(current);if(!next)break;current=next.join(',');}while(current!==first&&points.length<w*h);
  if(points.length<4)continue;path.moveTo(...points[0]);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],c=points[(i+1)%points.length];if((b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]))path.lineTo(...b);}path.lineTo(...points[0]);
 }
 return path.toShapes();
}
