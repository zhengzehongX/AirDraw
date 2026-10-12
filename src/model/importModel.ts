import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LoadingManager, Mesh, Texture } from 'three';
/** Resolve sidecar files from a single selection; never fetch external model URLs. */
export async function importModel(files:FileList):Promise<{url:string;dispose:()=>void}>{
  const all=Array.from(files),main=all.find(f=>/\.(glb|gltf)$/i.test(f.name));
  if(!main)throw new Error('请选择 GLB 或 GLTF 模型');
  if(all.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw new Error('模型文件合计不能超过 50 MB');
  const urls=new Map(all.map(f=>[f.name,URL.createObjectURL(f)]));const dispose=()=>urls.forEach(u=>URL.revokeObjectURL(u));
  try {
    if(/\.gltf$/i.test(main.name)){
      const data=JSON.parse(await main.text());
      for(const item of [...(data.buffers??[]),...(data.images??[])])if(item.uri&&!item.uri.startsWith('data:')){const local=urls.get(decodeURIComponent(item.uri.split('/').pop()!));if(!local)throw new Error(`请同时选择依赖文件：${item.uri}`);item.uri=local;}
      const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'model/gltf+json'}));urls.set('resolved',url);
    }
    const url=urls.get('resolved')??urls.get(main.name)!;
    const manager=new LoadingManager();manager.setURLModifier(u=>{if(u.startsWith('data:')||u.startsWith('blob:'))return u;throw new Error('不允许模型自动加载远程资源');});
    const result=await new GLTFLoader(manager).loadAsync(url);
    // Validate before replacing the current model; release validation resources.
    const resources=new Set<{dispose:()=>void}>();result.scene.traverse(o=>{if(o instanceof Mesh){resources.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){resources.add(material);Object.values(material).forEach(value=>{if(value instanceof Texture)resources.add(value);});}}});resources.forEach(r=>r.dispose());
    return{url,dispose};
  }catch(err){dispose();throw err;}
}
