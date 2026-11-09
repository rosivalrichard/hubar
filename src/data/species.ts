/* Aggregated species database plus lookup and presentation helpers. */

import { EDIBLE_SPECIES } from './species-edible';
import { EDIBLE_SPECIES_2 } from './species-edible2';
import { TOXIC_SPECIES } from './species-toxic';
import { EXTRA_SPECIES } from './species-extra';
import type { Species, Edibility } from './species-types';
import type { BiomeId } from './biomes';
import { BIOMES } from './biomes';
import { monthOf } from '../core/util';

export const ALL_SPECIES: Species[] = [
  ...EDIBLE_SPECIES,
  ...EDIBLE_SPECIES_2,
  ...TOXIC_SPECIES,
  ...EXTRA_SPECIES,
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(
  ALL_SPECIES.map((s) => [s.id, s])
);

export function getSpecies(id: string): Species {
  return SPECIES_BY_ID[id];
}

export function speciesLookalikes(sp: Species): Species[] {
  return sp.lookalikes.map((id) => SPECIES_BY_ID[id]).filter(Boolean);
}

export function isEdible(sp: Species): boolean {
  return ['choice', 'good', 'edible', 'caution'].includes(sp.edibility);
}

export function isDangerous(sp: Species): boolean {
  return sp.edibility === 'toxic' || sp.edibility === 'deadly';
}

export function edibilityColor(e: Edibility): string {
  switch (e) {
    case 'choice':
      return '#8fbf6a';
    case 'good':
      return '#a8c47a';
    case 'edible':
      return '#b8c48a';
    case 'caution':
      return '#d3b464';
    case 'inedible':
      return '#a39b8c';
    case 'toxic':
      return '#d08159';
    case 'deadly':
      return '#c4553f';
  }
}

export function seasonText(sp: Species): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = sp.months.slice().sort((a, b) => a - b);
  if (m.length >= 10) return 'Almost year-round';
  const groups: [number, number][] = [];
  let start = m[0];
  let prev = m[0];
  for (let i = 1; i < m.length; i++) {
    if (m[i] === prev + 1) {
      prev = m[i];
    } else {
      groups.push([start, prev]);
      start = prev = m[i];
    }
  }
  groups.push([start, prev]);
  return groups
    .map(([a, b]) => (a === b ? names[a - 1] : `${names[a - 1]}–${names[b - 1]}`))
    .join(', ');
}

export function speciesForBiome(biome: BiomeId): Species[] {
  return ALL_SPECIES.filter((s) => s.biomes.includes(biome));
}

export function fruitingNow(sp: Species, isoDate: string): boolean {
  return sp.months.includes(monthOf(isoDate));
}

export function biomeSpeciesCount(biome: BiomeId): number {
  return speciesForBiome(biome).length;
}

export function biomeName(biome: BiomeId): string {
  return BIOMES.find((b) => b.id === biome)?.name ?? biome;
}

export function genusOf(sp: Species): string {
  return sp.sci.split(' ')[0];
}

export function valueOf(sp: Species, scale = 1): number {
  const quality = 0.55 + 0.45 * Math.min(1.6, scale);
  return Math.round(sp.value * quality * 100) / 100;
}

/** Sanity check used in development; keeps the UI safe if a lookalike id is missing. */
export function validateSpecies(): string[] {
  const problems: string[] = [];
  const ids = new Set(ALL_SPECIES.map((s) => s.id));
  if (ids.size !== ALL_SPECIES.length) problems.push('duplicate species id');
  for (const s of ALL_SPECIES) {
    for (const l of s.lookalikes) {
      if (!ids.has(l)) problems.push(`${s.id} -> unknown lookalike ${l}`);
    }
  }
  return problems;
}

/** Strip lookalike references that have no entry, so the encyclopedia never shows a dead link. */
for (const s of ALL_SPECIES) {
  s.lookalikes = s.lookalikes.filter((id) => !!SPECIES_BY_ID[id] && id !== s.id);
}

export const SPECIES_COUNT = ALL_SPECIES.length;
export const DEADLY_COUNT = ALL_SPECIES.filter((s) => s.edibility === 'deadly').length;
export const EDIBLE_COUNT = ALL_SPECIES.filter((s) => isEdible(s)).length;

export type { Species, Edibility } from './species-types';
export { EDIBILITY_LABEL } from './species-types';
