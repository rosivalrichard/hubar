/* Shared mycological data types. */

import type { BiomeId } from './biomes';

export type Form = 'agaric' | 'bolete' | 'morel' | 'funnel' | 'shelf' | 'coral' | 'brain' | 'inkcap';
export type Edibility = 'choice' | 'good' | 'edible' | 'caution' | 'inedible' | 'toxic' | 'deadly';
export type CapShape =
  | 'convex' | 'cushion' | 'flat' | 'depressed' | 'funnel' | 'conical' | 'bell'
  | 'parasol' | 'irregular' | 'lobed' | 'cylindrical' | 'shelf' | 'coral';
export type CapPattern =
  | 'smooth' | 'fibrous' | 'warty' | 'scales' | 'concentric' | 'honeycomb' | 'brain'
  | 'ridges' | 'velvet' | 'cracked' | 'shaggy' | 'zoned' | 'mottled' | 'wrinkled';
export type GillType = 'gills' | 'pores' | 'ridges' | 'wrinkles' | 'smooth' | 'honeycomb' | 'spines';
export type Margin = 'smooth' | 'striate' | 'wavy' | 'inrolled' | 'appendiculate' | 'hairy' | 'scalloped';
export type StemBase = 'equal' | 'club' | 'bulb' | 'rooting' | 'tapered';
export type StemSurface = 'smooth' | 'fibrous' | 'scabers' | 'glandular' | 'reticulate' | 'shaggy' | 'banded';
export type Ring = 'none' | 'thin' | 'skirt' | 'double' | 'zone';
export type Volva = 'none' | 'sack' | 'girdles' | 'rim';
export type Substrate = 'litter' | 'soil' | 'moss' | 'deadwood' | 'stump' | 'roots' | 'grass' | 'path';
export type CapColorFamily = 'brown' | 'red' | 'orange' | 'yellow' | 'white' | 'green' | 'grey' | 'dark' | 'violet';

export interface Visual {
  capColor: string;
  capEdge: string;
  capShape: CapShape;
  capPattern: CapPattern;
  capColorFamily: CapColorFamily;
  capDiameter: [number, number]; // cm
  capRatio: number; // height / radius
  margin: Margin;
  stemHeight: [number, number]; // cm
  stemWidth: [number, number]; // cm
  stemColor: string;
  stemColor2: string;
  stemBase: StemBase;
  stemSurface: StemSurface;
  ring: Ring;
  volva: Volva;
  gillType: GillType;
  hymenColor: string;
  sporeColor: string;
  fleshColor: string;
  sticky: boolean;
  warts: string | null;
  cluster: [number, number];
  eccentric: boolean;
}

export interface Obs {
  cap: string;
  stem: string;
  under: string;
  base: string;
  habitat: string;
  smell: string;
  spore: string;
}

export interface Species {
  id: string;
  sci: string;
  sk: string;
  en: string;
  family: string;
  form: Form;
  edibility: Edibility;
  toxin: string;
  edibleNote: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  difficulty: 1 | 2 | 3 | 4 | 5;
  months: number[];
  biomes: BiomeId[];
  hosts: ('spruce' | 'beech' | 'oak' | 'pine' | 'birch')[];
  substrate: Substrate[];
  value: number;
  weight: number; // grams
  visual: Visual;
  obs: Obs;
  lookalikes: string[];
  facts: string[];
  intro: string;
}

export const EDIBILITY_LABEL: Record<Edibility, string> = {
  choice: 'Choice edible',
  good: 'Good edible',
  edible: 'Edible',
  caution: 'Edible with caution',
  inedible: 'Inedible',
  toxic: 'Poisonous',
  deadly: 'Deadly poisonous',
};

export const EDIBILITY_RANK: Record<Edibility, number> = {
  choice: 0,
  good: 1,
  edible: 2,
  caution: 3,
  inedible: 4,
  toxic: 5,
  deadly: 6,
};

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
