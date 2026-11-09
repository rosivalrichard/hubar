/* Natural variation and rarity of individual specimens.
 *
 * Every fruit body gets a size and shape roll. A small share become special specimens (giants, very wide
 * caps, thick stems, fused twins, big clusters, unusually symmetrical ones) or grow half-hidden in moss and
 * litter. Rarity (1 common … 5 legendary) is scored from the species, the size, the shape and how well the
 * day suits the species, with a random component so it never becomes predictable.
 */

import type { Species } from '../data/species-types';
import { RNG, clamp } from '../core/util';

export type Rarity = 1 | 2 | 3 | 4 | 5;
export type SpecialKind = 'giant' | 'wide' | 'thick' | 'twins' | 'cluster' | 'symmetric' | null;

export const RARITY_NAME: Record<Rarity, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
};
export const RARITY_COLOR: Record<Rarity, string> = {
  1: '#a9a28f',
  2: '#7fb069',
  3: '#5fa8d3',
  4: '#b07fd6',
  5: '#e2b84a',
};
/** Market price multiplier. */
export const RARITY_VALUE: Record<Rarity, number> = { 1: 1, 2: 1.15, 3: 1.6, 4: 2.6, 5: 5 };

export const KIND_LABEL: Record<Exclude<SpecialKind, null>, string> = {
  giant: 'Giant specimen',
  wide: 'Extremely wide cap',
  thick: 'Unusually thick stem',
  twins: 'Fused twins',
  cluster: 'Exceptional cluster',
  symmetric: 'Perfectly symmetrical',
};

/** Geometry modifiers consumed by the mushroom builder. */
export interface ShapeMods {
  capMul: number;
  stemWMul: number;
  stemHMul: number;
  count: number | null; // override fruit bodies in one specimen
  fused: boolean;
  symmetric: boolean;
}

export const NO_SHAPE: ShapeMods = { capMul: 1, stemWMul: 1, stemHMul: 1, count: null, fused: false, symmetric: false };

export interface SpecimenRoll {
  kind: SpecialKind;
  sizeMul: number; // overall scale on top of the normal size roll
  shape: ShapeMods;
  hidden: number; // 0..1 how deep it sits in moss / litter
  rarity: Rarity;
}

export interface SpecimenContext {
  wetness: number; // 0..1
  temperature: number;
  month: number; // 1..12
  biomeFit: boolean; // species listed for this biome
}

/** Roll the natural variation of one specimen. */
export function rollSpecimen(sp: Species, rng: RNG, ctx: SpecimenContext): SpecimenRoll {
  const shape: ShapeMods = { ...NO_SHAPE };
  let kind: SpecialKind = null;
  let sizeMul = 1;

  // good conditions (rain, peak month) make extraordinary growth more likely
  const peak = sp.months.includes(ctx.month) ? 1 : 0.5;
  const boost = (0.6 + ctx.wetness * 0.9) * peak * (ctx.biomeFit ? 1 : 0.7);
  const isCap = sp.form !== 'coral' && sp.form !== 'brain' && sp.form !== 'morel';
  const clusterSpecies = sp.visual.cluster[1] >= 3;

  const r = rng.f();
  let acc = 0;
  const hit = (p: number) => {
    acc += p * boost;
    return r < acc;
  };
  if (hit(0.007)) {
    kind = 'giant';
    sizeMul = 2 + Math.pow(rng.f(), 2.2) * 3; // 2–5x, big ones rarer
  } else if (isCap && hit(0.016)) {
    kind = 'wide';
    shape.capMul = rng.range(1.45, 1.9);
    shape.stemHMul = rng.range(0.9, 1.05);
  } else if (isCap && hit(0.016)) {
    kind = 'thick';
    shape.stemWMul = rng.range(1.7, 2.4);
    shape.stemHMul = rng.range(0.85, 1);
  } else if (isCap && !clusterSpecies && hit(0.012)) {
    kind = 'twins';
    shape.count = 2;
    shape.fused = true;
  } else if (clusterSpecies && hit(0.02)) {
    kind = 'cluster';
    shape.count = rng.int(8, 14);
  } else if (isCap && hit(0.012)) {
    kind = 'symmetric';
    shape.symmetric = true;
  }

  // ordinary specimens still vary a little
  if (!kind) {
    shape.capMul = rng.range(0.92, 1.1);
    shape.stemWMul = rng.range(0.9, 1.12);
    shape.stemHMul = rng.range(0.9, 1.1);
  }

  const hidden = rng.chance(0.07) ? rng.range(0.25, 0.55) : 0;

  // rarity score
  let score = (sp.rarity - 1) * 0.55; // species 1..5 -> 0..2.2
  if (kind === 'giant') score += 1.6 + (sizeMul - 2) * 0.55;
  else if (kind === 'cluster') score += 1.4 + ((shape.count ?? 8) - 8) * 0.08;
  else if (kind === 'twins') score += 1.5;
  else if (kind === 'wide' || kind === 'thick') score += 1.1;
  else if (kind === 'symmetric') score += 1.25;
  if (hidden > 0) score += 0.25;
  score += (rng.f() - 0.5) * 0.7;
  const rarity = clamp(scoreToRarity(score), 1, 5) as Rarity;

  return { kind, sizeMul, shape, hidden, rarity };
}

function scoreToRarity(s: number): number {
  if (s >= 4.3) return 5;
  if (s >= 3.1) return 4;
  if (s >= 2) return 3;
  if (s >= 1) return 2;
  return 1;
}

/** Fresh weight estimate in grams for a specimen with this cap diameter. */
export function estimateWeight(sp: Species, capCm: number, shape: ShapeMods, count: number): number {
  const ref = (sp.visual.capDiameter[0] + sp.visual.capDiameter[1]) / 2;
  const k = capCm / ref;
  const body = sp.weight * Math.pow(k, 2.6) * (0.65 + 0.35 * shape.stemWMul * shape.stemWMul);
  return Math.round(body * Math.max(1, count));
}

export function stemHeightCm(sp: Species, scale: number, shape: ShapeMods) {
  const mid = (sp.visual.stemHeight[0] + sp.visual.stemHeight[1]) / 2;
  return mid * scale * shape.stemHMul;
}
