/* Museum of extraordinary finds and personal specimen records. */

import { S, saveSoon, toast, addXP } from './state';
import { WILDLIFE_NAME, type WildlifeId } from './wildlife';
import { SPECIES_BY_ID } from '../data/species';
import type { MushroomEntity } from './spawner';
import type { MuseumEntry } from './state';

const MAX_ENTRIES = 120;

/** How remarkable an entry is — used for "most unusual" and for trimming the archive. */
export function entryScore(e: MuseumEntry) {
  return e.rarity * 10 + (e.special ? 6 : 0) + Math.log10(Math.max(1, e.weightG)) + (e.bodies > 1 ? e.bodies * 0.3 : 0);
}

export function isExtraordinary(m: MushroomEntity) {
  return m.rarity >= 3 || m.special !== null;
}

function entryId(m: MushroomEntity) {
  return `${S.run?.startedAt ?? 'x'}-${m.uid}`;
}

/** Save an extraordinary specimen the moment it is discovered (seen up close). */
export function recordDiscovery(m: MushroomEntity, biome: string, weather: string): MuseumEntry | null {
  if (!isExtraordinary(m)) return null;
  const id = entryId(m);
  let e = S.museum.find((x) => x.id === id);
  if (e) return e;
  e = {
    id,
    speciesId: m.species.id,
    date: new Date().toISOString(),
    biome,
    weather,
    capCm: m.sizeCm,
    heightCm: m.heightCm,
    weightG: m.weightG,
    rarity: m.rarity,
    special: m.special,
    bodies: m.bodies,
    identified: m.identified,
    collected: false,
  };
  S.museum.unshift(e);
  if (S.museum.length > MAX_ENTRIES) {
    S.museum.sort((a, b) => entryScore(b) - entryScore(a));
    S.museum.length = MAX_ENTRIES;
  }
  updateUnusual();
  saveSoon();
  return e;
}

/** Update museum entry and personal records when a specimen goes into the basket. */
export function recordCollection(m: MushroomEntity, biome: string, weather: string) {
  const e = recordDiscovery(m, biome, weather);
  if (e) {
    e.collected = true;
    e.identified = m.identified;
  }
  const r = S.records;
  const name = m.species.id;
  const beaten: string[] = [];
  if (m.sizeCm > r.largestCapCm) {
    if (r.largestCapCm > 0) beaten.push('Largest mushroom');
    r.largestCapCm = m.sizeCm;
    r.largestCapSpecies = name;
  }
  if (m.weightG > r.heaviestG) {
    if (r.heaviestG > 0) beaten.push('Heaviest mushroom');
    r.heaviestG = m.weightG;
    r.heaviestSpecies = name;
  }
  if (m.rarity > r.rarest) {
    if (r.rarest > 0) beaten.push('Rarest find');
    r.rarest = m.rarity;
    r.rarestSpecies = name;
  }
  if (m.bodies > 1 && m.bodies > r.largestCluster) {
    if (r.largestCluster > 0) beaten.push('Largest cluster');
    r.largestCluster = m.bodies;
    r.largestClusterSpecies = name;
  }
  if (beaten.length) toast('New personal record', beaten.join(' · '), 'level');
  saveSoon();
}

function updateUnusual() {
  let best: MuseumEntry | null = null;
  for (const e of S.museum) if (!best || entryScore(e) > entryScore(best)) best = e;
  S.records.mostUnusual = best?.id ?? '';
}

export function museumSpeciesName(e: MuseumEntry) {
  const sp = SPECIES_BY_ID[e.speciesId];
  return sp ? { sci: sp.sci, sk: sp.sk } : { sci: e.speciesId, sk: '' };
}

/** Wildlife journal: every individual animal you get a good look at. First sighting of a species earns XP. */
export function noteWildlife(id: WildlifeId) {
  const rec = S.wildlife[id];
  if (!rec) {
    S.wildlife[id] = { count: 1, first: new Date().toISOString() };
    toast('New wildlife sighting', WILDLIFE_NAME[id], 'good');
    addXP(10, 'wildlife');
  } else rec.count++;
  saveSoon();
}
