import {importProjectModel} from '../project/importModel';
import {workspace} from '../project/workspace';
export const MODEL_LIBRARY=[
  {id:'avocado',file:'Avocado.glb',title:'model.avocado',description:'model.avocadoNote',credit:'Microsoft · CC0'},
  {id:'car',file:'ToyCar.glb',title:'model.car',description:'model.carNote',credit:'Guido Odendahl / Eric Chadwick · CC0'},
] as const;
/** User-selected, locally bundled assets use the same validation/persistence as file import. */
export async function addLibraryModel(file:string,signal:AbortSignal){
  const projectId=workspace.project.id;
  const response=await fetch(`${import.meta.env.BASE_URL}models/library/${file}`,{signal});
  if(!response.ok)throw new Error(`Model unavailable (${response.status})`);
  const blob=await response.blob();if(signal.aborted||projectId!==workspace.project.id)return;
  const transfer=new DataTransfer();transfer.items.add(new File([blob],file,{type:'model/gltf-binary'}));
  await importProjectModel(transfer.files,signal);
}
