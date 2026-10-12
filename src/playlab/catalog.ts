import type { Toy, ToyId } from './types';
import type { TextKey } from '../i18n/zh';

/**
 * What the hub knows without mounting anything.
 *
 * The card rail has to draw five previews, and loading five shader modules to do
 * that would put every toy's GPU memory on screen at once. So the catalogue holds
 * the cheap metadata and `loadToy` imports the real module on first use — and
 * checks it agrees with the catalogue, so a toy cannot quietly claim a different
 * name or two-hand support than the card advertises.
 *
 * `titleZh` / `description` / `lesson.prompt` stay as they are: the runtime reads
 * `titleZh` outside React (the loading detail in `runtime.ts`), so the Chinese
 * name is the stable internal identifier. The `*Key` fields are what React renders.
 */
export type ToyCard = Pick<Toy, 'id' | 'title' | 'titleZh' | 'description' | 'thumbnail' | 'capabilities' | 'supportsTwoHands' | 'qualityLevels' | 'lesson'> & {
  titleKey: TextKey;
  descriptionKey: TextKey;
  promptKey: TextKey;
};

export const TOY_ORDER: readonly ToyId[] = ['orb', 'galaxy', 'fluid', 'ocean', 'fireworks'];

export const TOY_CARDS: Record<ToyId, ToyCard> = {
  orb: {
    id: 'orb',
    title: 'Energy Orb',
    titleZh: '光球',
    titleKey: 'playlab.toy.orb',
    description: '张开手掌吸引它，捏住抓住它，双手把它拉开或分成两颗。',
    descriptionKey: 'playlab.card.orbDesc',
    thumbnail: { accent: '#22d3ee', preview: 'orb' },
    capabilities: ['attract', 'push', 'pinch-grab', 'pinch-throw', 'two-hand-link', 'two-hand-stretch', 'two-hand-split'],
    supportsTwoHands: true,
    qualityLevels: ['ultra', 'high', 'balanced', 'performance'],
    lesson: { prompt: '张开手掌靠近光球', done: 'HAND_OPEN', seconds: 14 },
    promptKey: 'playlab.prompt.orb',
  },
  galaxy: {
    id: 'galaxy',
    title: 'Particle Galaxy',
    titleZh: '粒子星云',
    titleKey: 'playlab.toy.galaxy',
    description: '手掌是引力，握拳是斥力，食指拖出光轨；双手拉开整片星云。',
    descriptionKey: 'playlab.toy.galaxyCaption',
    thumbnail: { accent: '#a78bfa', preview: 'points' },
    capabilities: ['attract', 'repel', 'trails', 'vortex', 'shapes', 'two-hand-stretch', 'two-hand-rotate'],
    supportsTwoHands: true,
    qualityLevels: ['ultra', 'high', 'balanced', 'performance'],
    lesson: { prompt: '张开手掌吸引粒子', done: 'HAND_OPEN', seconds: 14 },
    promptKey: 'playlab.prompt.galaxy',
  },
  fluid: {
    id: 'fluid',
    title: 'Fluid Ink',
    titleZh: '流体墨水',
    titleKey: 'playlab.toy.fluid',
    description: '食指注入颜色，张掌推出涡流，两只手各拿一种颜色在中间混合。',
    descriptionKey: 'playlab.toy.fluidCaption',
    thumbnail: { accent: '#f472b6', preview: 'fluid' },
    capabilities: ['attract', 'push', 'pinch-grab', 'vortex', 'two-hand-mix'],
    supportsTwoHands: true,
    qualityLevels: ['ultra', 'high', 'balanced', 'performance'],
    lesson: { prompt: '移动食指注入墨水', done: 'PINCH_MOVE', seconds: 14 },
    promptKey: 'playlab.prompt.fluid',
  },
  ocean: {
    id: 'ocean',
    title: 'Hand Ocean',
    titleZh: '手势海洋',
    titleKey: 'playlab.toy.ocean',
    description: '手掌下压掀起浪，划过留下尾迹，捏起一颗水珠再松手落回海面。',
    descriptionKey: 'playlab.card.oceanDesc',
    thumbnail: { accent: '#60a5fa', preview: 'water' },
    capabilities: ['push', 'vortex', 'pinch-grab', 'two-hand-stretch', 'two-hand-rotate'],
    supportsTwoHands: true,
    qualityLevels: ['ultra', 'high', 'balanced', 'performance'],
    lesson: { prompt: '手掌向下压海面', done: 'PALM_PUSH', seconds: 14 },
    promptKey: 'playlab.prompt.ocean',
  },
  fireworks: {
    id: 'fireworks',
    title: 'Fireworks',
    titleZh: '烟花',
    titleKey: 'playlab.toy.fireworks',
    description: '捏住蓄力、抬手瞄准、松开发射；双手各蓄一色，合拢变成双色烟花。',
    descriptionKey: 'playlab.card.fireworksDesc',
    thumbnail: { accent: '#fbbf24', preview: 'sparks' },
    capabilities: ['pinch-grab', 'pinch-throw', 'two-hand-mix', 'two-hand-split'],
    supportsTwoHands: true,
    qualityLevels: ['ultra', 'high', 'balanced', 'performance'],
    lesson: { prompt: '捏住蓄力后松开', done: 'PINCH_END', seconds: 16 },
    promptKey: 'playlab.prompt.fireworks',
  },
};

const loaders: Record<ToyId, () => Promise<{ default: Toy }>> = {
  orb: () => import('./toys/energyOrb'),
  galaxy: () => import('./toys/particleGalaxy'),
  fluid: () => import('./toys/fluidInk'),
  ocean: () => import('./toys/handOcean'),
  fireworks: () => import('./toys/fireworks'),
};

const loaded = new Map<ToyId, Toy>();

/** Imports a toy module once. The hub never calls this for previews. */
export async function loadToy(id: ToyId): Promise<Toy> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const toy = (await loaders[id]()).default;
  const card = TOY_CARDS[id];
  if (toy.id !== card.id || toy.supportsTwoHands !== card.supportsTwoHands)
    throw new Error(`PlayLab toy ${id} does not match its catalogue entry`);
  loaded.set(id, toy);
  return toy;
}

export function peekToy(id: ToyId): Toy | undefined {
  return loaded.get(id);
}
