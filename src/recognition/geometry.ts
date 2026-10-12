import type {Point} from '../types/drawing';
export type GeometryKind='line'|'circle'|'ellipse'|'rectangle'|'triangle'|'arrow'|'star';
export type Suggestion={kind:GeometryKind;label:string;points:Point[];confidence:number};
const dist=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*16,(a.y-b.y)*9);
function perpendicular(p:Point,a:Point,b:Point){const dx=(b.x-a.x)*16,dy=(b.y-a.y)*9,length=dx*dx+dy*dy;if(!length)return dist(p,a);const t=Math.max(0,Math.min(1,((p.x-a.x)*16*dx+(p.y-a.y)*9*dy)/length));return dist(p,{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:0});}
export function rdp(points:Point[],epsilon:number):Point[]{if(points.length<3)return points;let max=0,index=0;for(let i=1;i<points.length-1;i++){const d=perpendicular(points[i],points[0],points.at(-1)!);if(d>max){max=d;index=i;}}return max>epsilon?[...rdp(points.slice(0,index+1),epsilon).slice(0,-1),...rdp(points.slice(index),epsilon)]:[points[0],points.at(-1)!];}
export function analyzeGeometry(points:Point[]):Suggestion|null {
 if(points.length<8)return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2,rx=(maxX-minX)/2,ry=(maxY-minY)/2;
 const diagonal=Math.hypot(rx*32,ry*18);if(diagonal<.12)return null;
 const closed=dist(points[0],points.at(-1)!)<diagonal*.16;
 const polygon=rdp(points,diagonal*.05);
 let kind:GeometryKind|null=null,out:Point[]=[];
 if(!closed&&polygon.length===2){kind='line';out=polygon;}
 else if(closed&&rx>0&&ry>0){
  const errors=points.map(p=>Math.abs(Math.hypot((p.x-cx)/rx,(p.y-cy)/ry)-1));const error=errors.reduce((a,b)=>a+b,0)/errors.length;
  if(error<.11&&polygon.length>6){kind=Math.abs(rx*16-ry*9)/Math.max(rx*16,ry*9)<.18?'circle':'ellipse';const radius=(rx*16+ry*9)/2;out=Array.from({length:65},(_,i)=>({x:cx+(kind==='circle'?radius/16:rx)*Math.cos(i*Math.PI/32),y:cy+(kind==='circle'?radius/9:ry)*Math.sin(i*Math.PI/32),z:0}));}
  else {
   const vertices=polygon.slice(0,-1);
   if(vertices.length===3){kind='triangle';out=[...vertices,vertices[0]];}
   if(vertices.length===4){const cornerErrors=vertices.map((b,i)=>{const a=vertices[(i+3)%4],c=vertices[(i+1)%4],u={x:(a.x-b.x)*16,y:(a.y-b.y)*9},v={x:(c.x-b.x)*16,y:(c.y-b.y)*9};return Math.abs((u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)));});if(cornerErrors.every(e=>e<.35)){kind='rectangle';out=[{x:minX,y:minY,z:0},{x:maxX,y:minY,z:0},{x:maxX,y:maxY,z:0},{x:minX,y:maxY,z:0},{x:minX,y:minY,z:0}];}}
   if(vertices.length===10){const radii=vertices.map(p=>Math.hypot((p.x-cx)*16,(p.y-cy)*9)),even=radii.filter((_,i)=>i%2===0),odd=radii.filter((_,i)=>i%2===1),average=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length,ratio=average(even)/average(odd);if(ratio<.75||ratio>1.33){kind='star';out=[...vertices,vertices[0]];}}
  }
 }else if(polygon.length>=4&&polygon.length<=6){const tip=polygon[1],end=polygon.at(-1)!;if(dist(tip,end)<diagonal*.2){kind='arrow';out=polygon;}}
 if(!kind)return null;
 return{kind,label:`转换为${({line:'直线',circle:'圆形',ellipse:'椭圆',rectangle:'矩形',triangle:'三角形',arrow:'箭头',star:'星形'} as const)[kind]}`,points:out,confidence:.8};
}
