import * as THREE from 'three';
import type { MaterialPresetId,Stroke } from '../../types/drawing';

/**
 * Unified material preset data. Every preset is a `MeshPhysicalMaterial`
 * configuration tuned to read as a game-quality prop (rounded, glossy, softly
 * lit) rather than a neon web line; `neon` is the opt-in exception.
 */
export type MaterialPreset = {
  id: MaterialPresetId;
  label: string;
  hint: string;
  props: Omit<THREE.MeshPhysicalMaterialParameters, 'color'>;
  /** Toolbar swatch background. */
  swatch: string;
};

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  {
    id: 'candy',
    label: 'Candy',
    hint: '圆润糖釉：高 clearcoat + 柔和 sheen',
    props: {
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.5,
      sheenRoughness: 0.4,
      sheenColor: '#ffffff',
      envMapIntensity: 1.15,
    },
    swatch: 'linear-gradient(140deg, #ff8fc7, #7dd3fc 60%, #a7f3d0)',
  },
  {
    id: 'plastic',
    label: 'Glossy Plastic',
    hint: '高光塑料：低粗糙度 + 适度 clearcoat',
    props: {
      roughness: 0.16,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.95,
    },
    swatch: 'linear-gradient(140deg, #f8fafc, #94a3b8 70%, #475569)',
  },
  {
    id: 'metal',
    label: 'Metal',
    hint: '拉丝金属：金属度 1 + 环境反射',
    props: {
      roughness: 0.26,
      metalness: 1,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1.35,
    },
    swatch: 'linear-gradient(140deg, #e2e8f0, #94a3b8 45%, #334155)',
  },
  {
    id: 'glass',
    label: 'Glass',
    hint: '玻璃：透射 + 高折射（较耗性能）',
    props: {
      roughness: 0.07,
      metalness: 0,
      transmission: 0.85,
      thickness: 0.6,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.2,
    },
    swatch: 'linear-gradient(140deg, rgba(255,255,255,0.9), rgba(125,211,252,0.5) 60%, rgba(167,139,250,0.4))',
  },
  {
    id: 'neon',
    label: 'Neon',
    hint: '霓虹：自发光，配合 Bloom',
    props: {
      roughness: 0.35,
      metalness: 0,
      emissiveIntensity: 1.5,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.6,
    },
    swatch: 'linear-gradient(140deg, #22d3ee, #a78bfa 60%, #f472b6)',
  },
];

export function getPreset(id: MaterialPresetId): MaterialPreset {
  return MATERIAL_PRESETS.find((preset) => preset.id === id) ?? MATERIAL_PRESETS[0];
}

/**
 * Materials are shared per (preset, color): a long session creates at most
 * palette × presets instances instead of one per stroke. The cache owns
 * disposal so GPU resources are released exactly once.
 */
const cache = new Map<string, THREE.MeshPhysicalMaterial>();

const textures=new Map<string,THREE.Texture>();
function mapFor(surface:NonNullable<Stroke['surface']>,kind:string){const asset=surface==='wood'?'wood_table_001':surface==='metal'?'metal_plate':'brushed_concrete';const key=`${surface}:${kind}`;let map=textures.get(key);if(!map){map=new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}materials/${surface}/${asset}/${asset}_${kind}_1k.jpg`);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(3,1);if(kind==='diff')map.colorSpace=THREE.SRGBColorSpace;textures.set(key,map);}return map;}
export function getStrokeMaterial(presetId: MaterialPresetId, color: string, surface?:Stroke['surface']): THREE.MeshPhysicalMaterial {
  const key = `${presetId}:${color}:${surface??''}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const preset = getPreset(presetId);
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    ...preset.props,
    emissive: new THREE.Color(presetId === 'neon' ? color : '#000000'),
    ...(surface?{map:mapFor(surface,'diff'),normalMap:mapFor(surface,'nor_gl'),roughnessMap:mapFor(surface,'rough'),roughness:1,metalness:surface==='metal'?1:0}:{}),
  });
  cache.set(key, material);
  return material;
}

export function disposeStrokeMaterials(): void {
  for (const material of cache.values()) material.dispose();
  cache.clear();
  textures.forEach(t=>t.dispose());textures.clear();
}

/** For the theme rig: every cached material follows the environment blend. */
export function cachedMaterials(): THREE.MeshPhysicalMaterial[] {
  return [...cache.values()];
}
