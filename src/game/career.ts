/* Career missions, advanced automatically as the player meets each goal. */

import { S, addXP, emit, saveNow, levelForXp } from './state';
import { ALL_SPECIES, SPECIES_BY_ID } from '../data/species';

export interface Mission {
  id: string;
  title: string;
  desc: string;
  target: number;
  progress: () => number;
  rewardXp: number;
}

const pos = (s: string) => ALL_SPECIES.find((x) => x.id === s)!;

export const MISSIONS: Mission[] = [
  {
    id: 'm1',
    title: 'Learn three names',
    desc: 'Identify three different species correctly.',
    target: 3,
    progress: () => Object.values(S.species).filter((r) => r.discovered).length,
    rewardXp: 40,
  },
  {
    id: 'm2',
    title: 'Fill the basket',
    desc: 'Collect five edible mushrooms.',
    target: 5,
    progress: () => S.stats.edibleCollected,
    rewardXp: 40,
  },
  {
    id: 'm3',
    title: 'Walk under beech',
    desc: 'Complete an expedition in the beech forest.',
    target: 1,
    progress: () => (S.stats.biomesVisited.includes('beech') ? 1 : 0),
    rewardXp: 50,
  },
  {
    id: 'm4',
    title: 'The king of boletes',
    desc: 'Identify a Boletus edulis.',
    target: 1,
    progress: () => (S.species['boletus-edulis']?.discovered ? 1 : 0),
    rewardXp: 60,
  },
  {
    id: 'm5',
    title: 'Document the forest',
    desc: 'Photograph three specimens.',
    target: 3,
    progress: () => S.stats.photosTaken,
    rewardXp: 50,
  },
  {
    id: 'm6',
    title: 'A rare find',
    desc: 'Discover a species of rarity 4 or higher.',
    target: 1,
    progress: () => Object.entries(S.species).filter(([id, r]) => r.discovered && (SPECIES_BY_ID[id]?.rarity ?? 0) >= 4).length,
    rewardXp: 80,
  },
  {
    id: 'm7',
    title: 'Know the deadly ones',
    desc: 'Correctly identify a deadly species and leave it in the ground.',
    target: 1,
    progress: () =>
      ALL_SPECIES.filter((x) => x.edibility === 'deadly' && S.species[x.id]?.discovered).length,
    rewardXp: 90,
  },
  {
    id: 'm8',
    title: 'A seasoned forager',
    desc: 'Reach level 4.',
    target: 4,
    progress: () => levelForXp(S.profile.xp).level,
    rewardXp: 100,
  },
  {
    id: 'm9',
    title: 'The full week',
    desc: 'Complete three daily challenges.',
    target: 3,
    progress: () => S.stats.challengesCompleted,
    rewardXp: 120,
  },
  {
    id: 'm10',
    title: 'A serious collection',
    desc: 'Discover fifteen different species.',
    target: 15,
    progress: () => S.stats.speciesDiscovered,
    rewardXp: 150,
  },
];

export function careerStage(): number {
  return Math.max(0, (S as unknown as { careerStage?: number }).careerStage ?? 0);
}

export function currentMission(): { mission: Mission; progress: number; index: number } | null {
  const idx = careerStage();
  if (idx >= MISSIONS.length) return null;
  const mission = MISSIONS[idx];
  return { mission, progress: Math.min(mission.target, mission.progress()), index: idx };
}

export function careerCheck() {
  let advanced = false;
  for (let guard = 0; guard < MISSIONS.length + 1; guard++) {
    const idx = careerStage();
    if (idx >= MISSIONS.length) break;
    const m = MISSIONS[idx];
    if (m.progress() < m.target) break;
    addXP(m.rewardXp, 'Career mission');
    (S as unknown as { careerStage: number }).careerStage = idx + 1;
    emit('career', { mission: m, index: idx });
    advanced = true;
  }
  if (advanced) saveNow();
}

export function careerTitle(): string {
  const mission = currentMission();
  if (!mission) return 'All missions complete';
  return mission.mission.title;
}
