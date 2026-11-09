/* Southern/Central European forest biome definitions. */

export type BiomeId = 'spruce' | 'beech' | 'oak' | 'pine' | 'mixed' | 'mountain' | 'wetland';

export interface Biome {
  id: BiomeId;
  name: string;
  sk: string;
  tagline: string;
  description: string;
  unlockLevel: number;
  difficulty: number;
  trees: { spruce: number; beech: number; oak: number; pine: number; birch: number };
  understory: 'fern' | 'moss' | 'grass' | 'leaf' | 'heather' | 'sedge';
  ground: 'needles' | 'leaves' | 'sand' | 'moss' | 'mud' | 'mixed';
  groundColor: string;
  groundColor2: string;
  fogColor: string;
  skyColor: string;
  hemiSky: string;
  hemiGround: string;
  sunColor: string;
  fogDensity: number;
  treeDensity: number;
  mossAmount: number;
  mushroomCount: number;
  rainfall: number; // baseline humidity 0..1
  temperature: number; // celsius baseline
  elevation: number;
  leafColor: string;
  accent: string;
  highlights: string[];
  spawnBias: string[]; // species ids with boosted weight
}

export const BIOMES: Biome[] = [
  {
    id: 'spruce',
    name: 'Spruce Forest',
    sk: 'Smrekový les',
    tagline: 'Dark moss and deep needle beds',
    description:
      'Old Norway spruce stands with a carpet of moss and needles, fallen branches and damp hollows. The classic habitat of the king bolete and the deadly funeral bell.',
    unlockLevel: 1,
    difficulty: 1,
    trees: { spruce: 0.82, beech: 0.08, oak: 0, pine: 0.06, birch: 0.04 },
    understory: 'moss',
    ground: 'needles',
    groundColor: '#4a3d28',
    groundColor2: '#2f2a1c',
    fogColor: '#87927f',
    skyColor: '#b9c4b4',
    hemiSky: '#c5d2c0',
    hemiGround: '#2c2a1d',
    sunColor: '#ffe6b8',
    fogDensity: 0.021,
    treeDensity: 1,
    mossAmount: 0.9,
    mushroomCount: 120,
    rainfall: 0.55,
    temperature: 13,
    elevation: 0.6,
    leafColor: '#3f4a30',
    accent: '#8fa77e',
    highlights: ['Boletus edulis', 'Galerina marginata', 'Imleria badia'],
    spawnBias: ['boletus-edulis', 'imleria-badia', 'galerina-marginata', 'armillaria-mellea', 'russula-emetica', 'tricholoma-equestre'],
  },
  {
    id: 'beech',
    name: 'Beech Forest',
    sk: 'Bukový les',
    tagline: 'Copper leaves and grey columns',
    description:
      'Mature European beech on limestone, with a deep leaf litter, silver-grey trunks and a quiet, cathedral-like atmosphere. Home of the death cap and the horn of plenty.',
    unlockLevel: 1,
    difficulty: 2,
    trees: { spruce: 0.05, beech: 0.86, oak: 0.05, pine: 0, birch: 0.04 },
    understory: 'leaf',
    ground: 'leaves',
    groundColor: '#5a4830',
    groundColor2: '#33281a',
    fogColor: '#8b8d7c',
    skyColor: '#c3c5b2',
    hemiSky: '#cfd3bd',
    hemiGround: '#332b1d',
    sunColor: '#ffe2b0',
    fogDensity: 0.024,
    treeDensity: 0.95,
    mossAmount: 0.45,
    mushroomCount: 130,
    rainfall: 0.6,
    temperature: 12,
    elevation: 1.2,
    leafColor: '#7a5a2e',
    accent: '#b08a52',
    highlights: ['Amanita phalloides', 'Craterellus cornucopioides', 'Entoloma sinuatum'],
    spawnBias: ['amanita-phalloides', 'craterellus-cornucopioides', 'entoloma-sinuatum', 'amanita-citrina', 'russula-vesca', 'hericium-coralloides', 'cortinarius-orellanus'],
  },
  {
    id: 'oak',
    name: 'Oak Forest',
    sk: 'Dubový les',
    tagline: 'Warm light, dry ground, old wood',
    description:
      'Open grown pedunculate oak and hornbeam on warm slopes. Dry leaf litter, sunlit clearings and a distinctly southern feel; summer boletes and the deadly webcap.',
    unlockLevel: 3,
    difficulty: 2,
    trees: { spruce: 0.02, beech: 0.16, oak: 0.68, pine: 0.08, birch: 0.06 },
    understory: 'grass',
    ground: 'leaves',
    groundColor: '#66512f',
    groundColor2: '#3a2d19',
    fogColor: '#a3a184',
    skyColor: '#d3cfae',
    hemiSky: '#e3ddba',
    hemiGround: '#3b2f1c',
    sunColor: '#ffdda0',
    fogDensity: 0.017,
    treeDensity: 0.72,
    mossAmount: 0.3,
    mushroomCount: 110,
    rainfall: 0.42,
    temperature: 17,
    elevation: 1.6,
    leafColor: '#8a6a30',
    accent: '#c0a05c',
    highlights: ['Boletus reticulatus', 'Boletus aereus', 'Amanita phalloides'],
    spawnBias: ['boletus-reticulatus', 'boletus-aereus', 'amanita-phalloides', 'cortinarius-orellanus', 'macrolepiota-procera', 'agaricus-campestris', 'entoloma-sinuatum'],
  },
  {
    id: 'pine',
    name: 'Pine Forest',
    sk: 'Borovica',
    tagline: 'Sandy soil, resin and heather',
    description:
      'Scots pine on glacial sand with lichen, heather and pine needles. Dry, airy and warm; slippery jacks push through the sand after rain while the man-on-horseback hides in plain sight.',
    unlockLevel: 2,
    difficulty: 2,
    trees: { spruce: 0.06, beech: 0, oak: 0.03, pine: 0.85, birch: 0.06 },
    understory: 'heather',
    ground: 'sand',
    groundColor: '#7b6844',
    groundColor2: '#4c3f28',
    fogColor: '#a6ab93',
    skyColor: '#cdd6bd',
    hemiSky: '#dfe7cf',
    hemiGround: '#3e3522',
    sunColor: '#ffe4ae',
    fogDensity: 0.014,
    treeDensity: 0.6,
    mossAmount: 0.55,
    mushroomCount: 105,
    rainfall: 0.3,
    temperature: 16,
    elevation: 0.9,
    leafColor: '#5b5a32',
    accent: '#a8a86a',
    highlights: ['Suillus luteus', 'Tricholoma equestre', 'Macrolepiota procera'],
    spawnBias: ['suillus-luteus', 'tricholoma-equestre', 'imleria-badia', 'chrysenteron', 'russula-emetica', 'macrolepiota-procera', 'amanita-muscaria'],
  },
  {
    id: 'mixed',
    name: 'Mixed Forest',
    sk: 'Zmiešaný les',
    tagline: 'The richest mushroom ground',
    description:
      'Spruce, beech and fir mixed on rolling terrain. Every substrate in one place: moss, litter, dead wood and roots. The most diverse fungal community in the region.',
    unlockLevel: 4,
    difficulty: 2,
    trees: { spruce: 0.4, beech: 0.32, oak: 0.12, pine: 0.09, birch: 0.07 },
    understory: 'fern',
    ground: 'mixed',
    groundColor: '#4c402c',
    groundColor2: '#2d2618',
    fogColor: '#8e9683',
    skyColor: '#bec8b4',
    hemiSky: '#cbd6c0',
    hemiGround: '#302a1c',
    sunColor: '#ffe6bb',
    fogDensity: 0.019,
    treeDensity: 1,
    mossAmount: 0.65,
    mushroomCount: 145,
    rainfall: 0.58,
    temperature: 13,
    elevation: 1.1,
    leafColor: '#4c5632',
    accent: '#9aac7d',
    highlights: ['Boletus edulis', 'Cantharellus cibarius', 'Amanita phalloides'],
    spawnBias: ['boletus-edulis', 'cantharellus-cibarius', 'amanita-phalloides', 'armillaria-mellea', 'leccinum-versipelle', 'macrolepiota-procera', 'pleurotus-ostreatus'],
  },
  {
    id: 'mountain',
    name: 'Mountain Forest',
    sk: 'Horský les',
    tagline: 'Steep ground and sudden weather',
    description:
      'Spruce and mountain pine on steep, rocky slopes. Thin soil, exposed roots, cold air and weather that turns in minutes. Rare species and old-growth fallen timber.',
    unlockLevel: 5,
    difficulty: 4,
    trees: { spruce: 0.62, beech: 0.18, oak: 0, pine: 0.16, birch: 0.04 },
    understory: 'moss',
    ground: 'moss',
    groundColor: '#414a34',
    groundColor2: '#252b20',
    fogColor: '#9aa5a8',
    skyColor: '#b7c4c8',
    hemiSky: '#c3d0d4',
    hemiGround: '#262d24',
    sunColor: '#ffe9c6',
    fogDensity: 0.027,
    treeDensity: 0.8,
    mossAmount: 1,
    mushroomCount: 100,
    rainfall: 0.7,
    temperature: 8,
    elevation: 4.2,
    leafColor: '#3f4c36',
    accent: '#93a892',
    highlights: ['Boletus edulis', 'Hericium coralloides', 'Amanita muscaria'],
    spawnBias: ['boletus-edulis', 'hericium-coralloides', 'amanita-muscaria', 'galerina-marginata', 'imleria-badia', 'russula-emetica'],
  },
  {
    id: 'wetland',
    name: 'Wetland Forest',
    sk: 'Mokradný les',
    tagline: 'Alder, mud and permanent humidity',
    description:
      'Alder and ash on waterlogged ground, mud paths, sphagnum and standing water. A cool, damp microclimate where late-season species persist into November.',
    unlockLevel: 5,
    difficulty: 3,
    trees: { spruce: 0.06, beech: 0.1, oak: 0.1, pine: 0.05, birch: 0.3 },
    understory: 'sedge',
    ground: 'mud',
    groundColor: '#3a3a26',
    groundColor2: '#22241a',
    fogColor: '#8e9c8f',
    skyColor: '#b6c2b2',
    hemiSky: '#c2cfc0',
    hemiGround: '#252a1d',
    sunColor: '#ffe9be',
    fogDensity: 0.03,
    treeDensity: 0.85,
    mossAmount: 1,
    mushroomCount: 115,
    rainfall: 0.85,
    temperature: 11,
    elevation: 0.3,
    leafColor: '#5a6234',
    accent: '#8ea28a',
    highlights: ['Lactarius torminosus', 'Armillaria mellea', 'Craterellus cornucopioides'],
    spawnBias: ['lactarius-torminosus', 'armillaria-mellea', 'craterellus-cornucopioides', 'pleurotus-ostreatus', 'galerina-marginata', 'hypholoma-fasciculare'],
  },
];

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b])) as Record<BiomeId, Biome>;

export const SEASON_LABEL: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};
