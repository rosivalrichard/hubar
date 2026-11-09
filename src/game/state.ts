/* Persistent player state: XP, levels, encyclopedia, basket, market, equipment,
   achievements and challenges. Saved to localStorage with schema merging. */

import { ALL_SPECIES, SPECIES_BY_ID, isEdible, isDangerous } from '../data/species';
import type { Species } from '../data/species-types';
import { BIOMES, BIOME_BY_ID, type BiomeId } from '../data/biomes';
import { clamp, dateKey, weekKey, monthOf, RNG, strSeed } from '../core/util';

export type Mode = 'free' | 'career' | 'challenge' | 'survival' | 'knowledge';
export type WeatherKindLite = 'clear' | 'sunny' | 'overcast' | 'mist' | 'drizzle' | 'rain' | 'storm' | 'fog';

export const MODE_LABEL: Record<Mode, string> = {
  free: 'Free Exploration',
  career: 'Career',
  challenge: 'Challenge',
  survival: 'Survival',
  knowledge: 'Knowledge',
};

export interface BasketItem {
  uid: number;
  speciesId: string;
  claimedId: string | null;
  identified: boolean;
  sizeCm: number;
  condition: number;
  stage: string;
  collectedAt: number;
  wet: boolean;
}

export interface SpeciesRecord {
  discovered: boolean;
  correct: number;
  wrong: number;
  collected: number;
  bestSizeCm: number;
  firstFound: string | null;
  photos: number;
}

export interface SurvivalState {
  energy: number;
  provisions: number;
  distance: number;
}

export interface RunState {
  mode: Mode;
  biome: BiomeId;
  isoDate: string;
  hour: number;
  weather: string;
  x: number;
  z: number;
  yaw: number;
  startedAt: number;
  xpStart: number;
  moneyStart: number;
  discoveries: string[];
  correctIds: number;
  wrongIds: number;
  streak: number;
  maxStreak: number;
  edibleCollected: number;
  poisonCollected: number;
  photos: number;
  distinctCollected: string[];
  survival: SurvivalState | null;
  challengeTarget: string | null;
}

export interface Stats {
  distanceWalked: number;
  mushroomsCollected: number;
  edibleCollected: number;
  poisonousCollected: number;
  identifiedCorrect: number;
  identifiedWrong: number;
  speciesDiscovered: number;
  photosTaken: number;
  moneyEarned: number;
  challengesCompleted: number;
  achievementsUnlocked: number;
  maxStreak: number;
  timePlayedSec: number;
  nights: number;
  daysPlayed: string[];
  biomesVisited: BiomeId[];
  rainCollects: number;
  fogIdentifies: number;
  runs: number;
}

export interface Settings {
  sensitivity: number;
  fov: number;
  quality: 'low' | 'medium' | 'high';
  volume: number;
  invertY: boolean;
  headbob: boolean;
  subtitles: boolean;
  dayLengthMinutes: number;
  hints: boolean;
}

export interface Records {
  bestRunScore: number;
  bestSale: number;
  bestSpeciesCount: number;
  longestStreak: number;
  knowledgeBest: number;
  bestBoleteCm: number;
}

export interface SaveState {
  version: number;
  profile: { name: string; xp: number; money: number; reputation: number };
  species: Record<string, SpeciesRecord>;
  equipment: Record<string, boolean>;
  basket: BasketItem[];
  challenges: {
    dailyKey: string;
    daily: Record<string, { progress: number; completed: boolean; granted: boolean }>;
    weeklyKey: string;
    weekly: Record<string, { progress: number; completed: boolean; granted: boolean }>;
    special: Record<string, { progress: number; completed: boolean; granted: boolean }>;
  };
  achievements: Record<string, number>;
  stats: Stats;
  settings: Settings;
  records: Records;
  run: RunState | null;
  provisions: number;
  lastPlayed: string;
  tutorialDone: boolean;
}

const SAVE_KEY = 'hubar.save.v2';

export const EQUIPMENT = [
  { id: 'basket', name: 'Wicker Basket', price: 0, level: 1, desc: 'A ventilated wicker basket. Holds 10 mushrooms without crushing them.', icon: 'basket' },
  { id: 'knife', name: 'Mushroom Knife', price: 0, level: 1, desc: 'Curved blade and brush. Lets you cut cleanly and keep specimens in good condition.', icon: 'knife' },
  { id: 'fieldGuide', name: 'Field Guide', price: 60, level: 2, desc: 'A pocket key to the region\u2019s fungi. Filters identification candidates by observed features.', icon: 'book' },
  { id: 'boots', name: 'Walking Boots', price: 80, level: 2, desc: 'Ankle support and a deep tread. Faster walking and slower stamina drain.', icon: 'boots' },
  { id: 'camera', name: 'Field Camera', price: 75, level: 2, desc: 'Document specimens for the archive. Photographs earn XP and complete plates.', icon: 'camera' },
  { id: 'backpack', name: 'Foraging Backpack', price: 110, level: 3, desc: 'Adds 12 basket slots and a padded compartment for fragile caps.', icon: 'backpack' },
  { id: 'flashlight', name: 'Headlamp', price: 70, level: 3, desc: 'A warm beam for dusk and night searches. Battery lasts the expedition.', icon: 'light' },
  { id: 'weatherRadio', name: 'Weather Radio', price: 90, level: 3, desc: 'Hourly forecast for the next day. Essential before a long walk.', icon: 'radio' },
  { id: 'gps', name: 'GPS & Compass', price: 160, level: 4, desc: 'Position, bearing and a map of discovered forest sectors.', icon: 'gps' },
  { id: 'raincoat', name: 'Waxed Raincoat', price: 140, level: 4, desc: 'Keeps the weather out: less stamina loss in rain and fog.', icon: 'coat' },
] as const;

export type EquipmentId = (typeof EQUIPMENT)[number]['id'];

export const LEVELS = [
  { level: 1, name: 'Beginner', xp: 0 },
  { level: 2, name: 'Forest Explorer', xp: 150 },
  { level: 3, name: 'Amateur Mushroom Hunter', xp: 400 },
  { level: 4, name: 'Experienced Mushroom Hunter', xp: 850 },
  { level: 5, name: 'Mushroom Specialist', xp: 1600 },
  { level: 6, name: 'Expert Mycologist', xp: 2700 },
  { level: 7, name: 'Master Mushroom Hunter', xp: 4200 },
];

export function levelForXp(xp: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  return LEVELS[idx];
}

export function levelProgress(xp: number) {
  const cur = levelForXp(xp);
  const next = LEVELS.find((l) => l.xp > cur.xp);
  const span = next ? next.xp - cur.xp : 1;
  const into = clamp(xp - cur.xp, 0, span);
  return { ...cur, next, pct: next ? into / span : 1, into, span };
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

type Listener = (payload: any) => void;
const listeners: Record<string, Listener[]> = {};
export function on(evt: string, fn: Listener) {
  (listeners[evt] ??= []).push(fn);
  return () => {
    listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn);
  };
}
export function emit(evt: string, payload?: any) {
  for (const fn of listeners[evt] || []) {
    try {
      fn(payload);
    } catch (e) {
      console.error(e);
    }
  }
}
export function toast(title: string, body = '', kind: 'info' | 'good' | 'bad' | 'level' = 'info') {
  emit('toast', { title, body, kind });
}

/* ------------------------------------------------------------------ */
/* defaults / load                                                     */
/* ------------------------------------------------------------------ */

function freshSpeciesRecords(): Record<string, SpeciesRecord> {
  const out: Record<string, SpeciesRecord> = {};
  for (const sp of ALL_SPECIES) {
    out[sp.id] = { discovered: false, correct: 0, wrong: 0, collected: 0, bestSizeCm: 0, firstFound: null, photos: 0 };
  }
  return out;
}

function freshStats(): Stats {
  return {
    distanceWalked: 0,
    mushroomsCollected: 0,
    edibleCollected: 0,
    poisonousCollected: 0,
    identifiedCorrect: 0,
    identifiedWrong: 0,
    speciesDiscovered: 0,
    photosTaken: 0,
    moneyEarned: 0,
    challengesCompleted: 0,
    achievementsUnlocked: 0,
    maxStreak: 0,
    timePlayedSec: 0,
    nights: 0,
    daysPlayed: [],
    biomesVisited: [],
    rainCollects: 0,
    fogIdentifies: 0,
    runs: 0,
  };
}

function defaults(): SaveState {
  return {
    version: 2,
    profile: { name: 'Forager', xp: 0, money: 30, reputation: 50 },
    species: freshSpeciesRecords(),
    equipment: { basket: true, knife: true },
    basket: [],
    challenges: { dailyKey: '', daily: {}, weeklyKey: '', weekly: {}, special: {} },
    achievements: {},
    stats: freshStats(),
    settings: {
      sensitivity: 1,
      fov: 72,
      quality: 'medium',
      volume: 0.75,
      invertY: false,
      headbob: true,
      subtitles: true,
      dayLengthMinutes: 13,
      hints: true,
    },
    records: { bestRunScore: 0, bestSale: 0, bestSpeciesCount: 0, longestStreak: 0, knowledgeBest: 0, bestBoleteCm: 0 },
    run: null,
    provisions: 2,
    lastPlayed: dateKey(),
    tutorialDone: false,
  };
}

function deepMerge<T>(base: T, saved: any): T {
  if (!saved || typeof saved !== 'object') return base;
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(base as any)) {
    const b = (base as any)[k];
    const s = saved[k];
    if (s === undefined) continue;
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = deepMerge(b, s);
    else out[k] = s;
  }
  return out;
}

export const S: SaveState = (() => {
  const base = defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const merged = deepMerge(base, parsed);
    // ensure new species entries exist
    for (const sp of ALL_SPECIES) {
      if (!merged.species[sp.id]) merged.species[sp.id] = { discovered: false, correct: 0, wrong: 0, collected: 0, bestSizeCm: 0, firstFound: null, photos: 0 };
    }
    // recompute derived stats that must be consistent
    merged.stats.speciesDiscovered = Object.values(merged.species).filter((r: any) => r.discovered).length;
    return merged;
  } catch (e) {
    console.warn('save load failed', e);
    return base;
  }
})();

let saveTimer: number | null = null;
export function saveNow() {
  try {
    S.lastPlayed = dateKey();
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch (e) {
    console.warn('save failed', e);
  }
}
export function saveSoon() {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 450);
}

export function resetSave() {
  localStorage.removeItem(SAVE_KEY);
  const base = defaults();
  Object.assign(S, base);
  saveNow();
  emit('reset');
}

/* ------------------------------------------------------------------ */
/* profile                                                             */
/* ------------------------------------------------------------------ */

export function addXP(amount: number, reason = '') {
  const before = levelForXp(S.profile.xp);
  S.profile.xp += amount;
  const after = levelForXp(S.profile.xp);
  emit('xp', { amount, reason, xp: S.profile.xp });
  if (after.level > before.level) {
    emit('levelup', { level: after.level, name: after.name });
    toast(`Level ${after.level} — ${after.name}`, 'New forests and equipment may be available.', 'level');
    S.profile.money += 40;
    emit('money', S.profile.money);
  }
  saveSoon();
}

export function addMoney(amount: number) {
  S.profile.money = Math.max(0, Math.round((S.profile.money + amount) * 100) / 100);
  emit('money', S.profile.money);
  saveSoon();
}

export function addReputation(amount: number) {
  S.profile.reputation = clamp(S.profile.reputation + amount, 0, 100);
  saveSoon();
}

export function hasEquip(id: EquipmentId | string): boolean {
  return !!S.equipment[id];
}

export function buyEquipment(id: string): { ok: boolean; message: string } {
  const eq = EQUIPMENT.find((e) => e.id === id);
  if (!eq) return { ok: false, message: 'Unknown item.' };
  if (hasEquip(id)) return { ok: false, message: 'Already owned.' };
  if (levelForXp(S.profile.xp).level < eq.level) return { ok: false, message: `Requires level ${eq.level}.` };
  if (S.profile.money < eq.price) return { ok: false, message: 'Not enough money.' };
  addMoney(-eq.price);
  S.equipment[id] = true;
  emit('equipment', id);
  emit('money', S.profile.money);
  saveNow();
  return { ok: true, message: `${eq.name} purchased.` };
}

export function basketCapacity() {
  return 10 + (hasEquip('backpack') ? 12 : 0) + (hasEquip('basket') ? 2 : 0);
}

export function basketWeight() {
  return S.basket.reduce((sum, it) => sum + (SPECIES_BY_ID[it.speciesId]?.weight ?? 0), 0);
}

export function basketValue() {
  return S.basket.reduce((sum, it) => {
    const sp = SPECIES_BY_ID[it.speciesId];
    if (!sp) return sum;
    return sum + (isEdible(sp) ? sp.value * it.condition * (0.5 + 0.5 * it.sizeCm / sp.visual.capDiameter[1]) : 0);
  }, 0);
}

/* ------------------------------------------------------------------ */
/* species                                                             */
/* ------------------------------------------------------------------ */

export function speciesRecord(id: string): SpeciesRecord {
  const r = S.species[id];
  if (!r) {
    const nr: SpeciesRecord = { discovered: false, correct: 0, wrong: 0, collected: 0, bestSizeCm: 0, firstFound: null, photos: 0 };
    S.species[id] = nr;
    return nr;
  }
  return r;
}

export function discoverSpecies(sp: Species, sizeCm = 0): boolean {
  const rec = speciesRecord(sp.id);
  const isNew = !rec.discovered;
  rec.discovered = true;
  if (isNew) {
    rec.firstFound = new Date().toISOString();
    S.stats.speciesDiscovered = Object.values(S.species).filter((r) => r.discovered).length;
    addXP(30 + sp.rarity * 8, 'New species');
    emit('discover', { speciesId: sp.id, species: sp });
    emit('newSpecies', { speciesId: sp.id, species: sp });
    saveSoon();
  }
  if (sizeCm > rec.bestSizeCm) rec.bestSizeCm = Math.round(sizeCm * 10) / 10;
  return isNew;
}

export function noteIdentification(sp: Species, correct: boolean, claimedId: string | null) {
  const rec = speciesRecord(sp.id);
  if (correct) {
    rec.correct++;
    S.stats.identifiedCorrect++;
    discoverSpecies(sp);
  } else {
    rec.wrong++;
    S.stats.identifiedWrong++;
    if (claimedId) {
      const claimed = SPECIES_BY_ID[claimedId];
      if (claimed) {
        const cr = speciesRecord(claimed.id);
        cr.wrong++;
      }
    }
  }
  saveSoon();
}

export function notePhoto(sp: Species) {
  const rec = speciesRecord(sp.id);
  rec.photos++;
  S.stats.photosTaken++;
  emit('photo', { speciesId: sp.id });
  saveSoon();
}

export function isDiscovered(id: string) {
  return !!S.species[id]?.discovered;
}

export function discoveredCount() {
  return Object.values(S.species).filter((r) => r.discovered).length;
}

export function biomeProgress(biome: BiomeId) {
  const list = ALL_SPECIES.filter((s) => s.biomes.includes(biome));
  const found = list.filter((s) => isDiscovered(s.id)).length;
  return { found, total: list.length, pct: list.length ? found / list.length : 0 };
}

export function isBiomeUnlocked(id: BiomeId) {
  const b = BIOME_BY_ID[id];
  if (!b) return false;
  return levelForXp(S.profile.xp).level >= b.unlockLevel;
}

/* ------------------------------------------------------------------ */
/* basket / market                                                     */
/* ------------------------------------------------------------------ */

export function addToBasket(sp: Species, opts: { sizeCm: number; stage: string; identified: boolean; claimedId: string | null; wet: boolean }): boolean {
  if (S.basket.length >= basketCapacity()) {
    toast('Basket full', 'Sell your harvest or unlock the backpack.', 'bad');
    return false;
  }
  const condition = opts.stage === 'damaged' ? 0.55 : opts.stage === 'old' ? 0.72 : opts.stage === 'young' ? 0.86 : 1;
  const item: BasketItem = {
    uid: Date.now() + Math.floor(Math.random() * 9999),
    speciesId: sp.id,
    claimedId: opts.claimedId,
    identified: opts.identified,
    sizeCm: opts.sizeCm,
    condition,
    stage: opts.stage,
    collectedAt: Date.now(),
    wet: opts.wet,
  };
  S.basket.push(item);
  S.stats.mushroomsCollected++;
  if (isEdible(sp)) S.stats.edibleCollected++;
  if (isDangerous(sp)) S.stats.poisonousCollected++;
  const rec = speciesRecord(sp.id);
  rec.collected++;
  if (opts.sizeCm > rec.bestSizeCm) rec.bestSizeCm = Math.round(opts.sizeCm * 10) / 10;
  if (S.run) {
    if (isEdible(sp)) S.run.edibleCollected++;
    if (isDangerous(sp)) S.run.poisonCollected++;
    if (!S.run.distinctCollected.includes(sp.id)) S.run.distinctCollected.push(sp.id);
    if (S.run.weather === 'rain' || S.run.weather === 'storm' || S.run.weather === 'drizzle') S.stats.rainCollects++;
  }
  notifyChallenge('collect', 1, {
    speciesId: sp.id,
    edible: isEdible(sp),
    poisonous: isDangerous(sp),
    rarity: sp.rarity,
    sizeCm: opts.sizeCm,
    weather: S.run?.weather,
    distinctRun: S.run?.distinctCollected.length ?? 0,
  });
  addXP(4 + Math.round(sp.rarity * 1.5), 'Collected');
  saveSoon();
  return true;
}

export interface SaleLine {
  speciesId: string;
  count: number;
  unit: number;
  total: number;
  edible: boolean;
  claimedId: string | null;
}

export interface SaleResult {
  lines: SaleLine[];
  earnings: number;
  penalty: number;
  poisonCount: number;
  wrongClaims: number;
  reputationDelta: number;
  empty: boolean;
}

export function sellBasket(): SaleResult {
  const result: SaleResult = { lines: [], earnings: 0, penalty: 0, poisonCount: 0, wrongClaims: 0, reputationDelta: 0, empty: S.basket.length === 0 };
  if (!S.basket.length) return result;
  const groups = new Map<string, BasketItem[]>();
  for (const it of S.basket) {
    const arr = groups.get(it.speciesId) || [];
    arr.push(it);
    groups.set(it.speciesId, arr);
  }
  for (const [id, items] of groups) {
    const sp = SPECIES_BY_ID[id];
    if (!sp) continue;
    const edible = isEdible(sp);
    let unit = 0;
    if (edible) {
      const avgSize = items.reduce((s, i) => s + i.sizeCm, 0) / items.length;
      const sizeFactor = clamp(avgSize / sp.visual.capDiameter[1], 0.35, 1.2);
      const avgCond = items.reduce((s, i) => s + i.condition, 0) / items.length;
      unit = Math.round(sp.value * (0.55 + sizeFactor * 0.6) * avgCond * 100) / 100;
      result.earnings += unit * items.length;
    } else {
      result.poisonCount += items.length;
      result.penalty += 9 * items.length;
      result.reputationDelta -= 3 * items.length;
      unit = 0;
    }
    const claimed = items.find((i) => i.claimedId && i.claimedId !== id)?.claimedId ?? null;
    if (claimed) {
      result.wrongClaims += items.filter((i) => i.identified && i.claimedId !== id).length;
    }
    result.lines.push({ speciesId: id, count: items.length, unit, total: unit * items.length, edible, claimedId: claimed });
  }
  result.earnings = Math.round(result.earnings * 100) / 100;
  result.penalty = Math.round(result.penalty * 100) / 100;
  addMoney(result.earnings - result.penalty);
  addReputation(result.reputationDelta);
  S.stats.moneyEarned += Math.max(0, result.earnings);
  S.records.bestSale = Math.max(S.records.bestSale, result.earnings);
  S.basket = [];
  if (result.poisonCount > 0) {
    toast('The buyer refused the poisonous specimens', `${result.poisonCount} inedible item${result.poisonCount > 1 ? 's' : ''} destroyed. Reputation lost.`, 'bad');
  }
  if (result.wrongClaims > 0) {
    toast('Misidentified mushrooms', `${result.wrongClaims} specimen${result.wrongClaims > 1 ? 's were' : ' was'} not what you claimed.`, 'bad');
  }
  checkAchievements();
  saveNow();
  return result;
}

export function discardBasket() {
  S.basket = [];
  saveNow();
}

/* ------------------------------------------------------------------ */
/* challenges                                                          */
/* ------------------------------------------------------------------ */

export type ChallengeType =
  | 'collect-edible'
  | 'discover'
  | 'identify-correct'
  | 'identify-streak'
  | 'collect-species'
  | 'visit-biome'
  | 'rare-find'
  | 'photo'
  | 'poison-identify'
  | 'largest-bolete'
  | 'fog-expedition'
  | 'distinct-species-run'
  | 'expedition'
  | 'fill-basket';

export interface ChallengeDef {
  id: string;
  kind: 'daily' | 'weekly' | 'special';
  title: string;
  desc: string;
  type: ChallengeType;
  target: number;
  rewardXp: number;
  rewardMoney: number;
  speciesId?: string;
  biome?: BiomeId;
  minimum?: number;
  rarityMin?: number;
}

const DAILY_POOL: Omit<ChallengeDef, 'id' | 'kind'>[] = [
  { title: 'A good basket', desc: 'Collect 5 edible mushrooms.', type: 'collect-edible', target: 5, rewardXp: 70, rewardMoney: 20 },
  { title: 'New ground', desc: 'Discover 3 species you have never identified.', type: 'discover', target: 3, rewardXp: 90, rewardMoney: 25 },
  { title: 'Confident hand', desc: 'Identify 6 mushrooms correctly.', type: 'identify-correct', target: 6, rewardXp: 80, rewardMoney: 18 },
  { title: 'A steady eye', desc: 'Identify 4 mushrooms in a row without a mistake.', type: 'identify-streak', target: 4, rewardXp: 85, rewardMoney: 0 },
  { title: 'Forest walk', desc: 'Visit a forest you have not walked today.', type: 'visit-biome', target: 1, rewardXp: 50, rewardMoney: 10 },
  { title: 'Rare company', desc: 'Find a rare or very rare species.', type: 'rare-find', target: 1, rarityMin: 4, rewardXp: 100, rewardMoney: 30 },
  { title: 'Field notes', desc: 'Photograph 3 specimens.', type: 'photo', target: 3, rewardXp: 60, rewardMoney: 15 },
  { title: 'A full basket', desc: 'Return with a completely full basket.', type: 'fill-basket', target: 1, rewardXp: 70, rewardMoney: 20 },
];

const WEEKLY_POOL: Omit<ChallengeDef, 'id' | 'kind'>[] = [
  { title: 'A week in the woods', desc: 'Discover 12 different species.', type: 'discover', target: 12, rewardXp: 320, rewardMoney: 90 },
  { title: 'The mycologist\u2019s hand', desc: 'Identify 10 mushrooms in a row without a mistake.', type: 'identify-streak', target: 10, rewardXp: 300, rewardMoney: 70 },
  { title: 'A serious harvest', desc: 'Collect 30 edible mushrooms.', type: 'collect-edible', target: 30, rewardXp: 340, rewardMoney: 120 },
  { title: 'The long walk', desc: 'Complete 4 forest expeditions.', type: 'expedition', target: 4, rewardXp: 260, rewardMoney: 80 },
  { title: 'Record keeper', desc: 'Photograph 15 specimens.', type: 'photo', target: 15, rewardXp: 240, rewardMoney: 60 },
];

export const SPECIAL_CHALLENGES: ChallengeDef[] = [
  { id: 'sp-largest-bolete', kind: 'special', title: 'The king of the forest', desc: 'Find a bolete with a cap 18 cm or wider.', type: 'largest-bolete', target: 1, minimum: 18, rewardXp: 400, rewardMoney: 150 },
  { id: 'sp-aereus', kind: 'special', title: 'Bronze in the oak leaves', desc: 'Find Boletus aereus, the dark cep.', type: 'collect-species', target: 1, speciesId: 'boletus-aereus', rewardXp: 500, rewardMoney: 200 },
  { id: 'sp-fog', kind: 'special', title: 'Into the white', desc: 'Complete an expedition in dense fog.', type: 'fog-expedition', target: 1, rewardXp: 320, rewardMoney: 90 },
  { id: 'sp-poison', kind: 'special', title: 'Know your enemy', desc: 'Identify 5 poisonous mushrooms without collecting them.', type: 'poison-identify', target: 5, rewardXp: 380, rewardMoney: 0 },
  { id: 'sp-biome', kind: 'special', title: 'A complete picture', desc: 'Collect 10 different species in a single expedition.', type: 'distinct-species-run', target: 10, rewardXp: 420, rewardMoney: 140 },
  { id: 'sp-photo', kind: 'special', title: 'The archive', desc: 'Photograph 25 specimens.', type: 'photo', target: 25, rewardXp: 300, rewardMoney: 80 },
];

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = new RNG(seed);
  return rng.shuffle(arr);
}

export function dailyChallenges(): ChallengeDef[] {
  const key = dateKey();
  const picks = seededShuffle(DAILY_POOL, strSeed('daily:' + key)).slice(0, 3);
  return picks.map((p, i) => ({ ...p, id: `d-${key}-${i}`, kind: 'daily' }));
}

export function weeklyChallenges(): ChallengeDef[] {
  const key = weekKey();
  const picks = seededShuffle(WEEKLY_POOL, strSeed('weekly:' + key)).slice(0, 2);
  return picks.map((p, i) => ({ ...p, id: `w-${key}-${i}`, kind: 'weekly' }));
}

export function ensureChallengeBuckets() {
  const dk = dateKey();
  if (S.challenges.dailyKey !== dk) {
    S.challenges.dailyKey = dk;
    S.challenges.daily = {};
  }
  const wk = weekKey();
  if (S.challenges.weeklyKey !== wk) {
    S.challenges.weeklyKey = wk;
    S.challenges.weekly = {};
    // weekly visits should be counted fresh each week
  }
  for (const def of SPECIAL_CHALLENGES) {
    if (!S.challenges.special[def.id]) S.challenges.special[def.id] = { progress: 0, completed: false, granted: false };
  }
}

export function challengeEntry(def: ChallengeDef) {
  ensureChallengeBuckets();
  const bucket = def.kind === 'daily' ? S.challenges.daily : def.kind === 'weekly' ? S.challenges.weekly : S.challenges.special;
  const e = bucket[def.id] || (bucket[def.id] = { progress: 0, completed: false, granted: false });
  return e;
}

function challengeMatches(def: ChallengeDef, meta: any): boolean {
  if (def.speciesId && meta.speciesId !== def.speciesId) return false;
  if (def.biome && meta.biome !== def.biome) return false;
  if (def.rarityMin && (meta.rarity ?? 0) < def.rarityMin) return false;
  return true;
}

export function notifyChallenge(event: string, amount = 1, meta: any = {}) {
  ensureChallengeBuckets();
  const defs = [...dailyChallenges(), ...weeklyChallenges(), ...SPECIAL_CHALLENGES];
  for (const def of defs) {
    let hit = false;
    let value = amount;
    switch (def.type) {
      case 'collect-edible':
        hit = event === 'collect' && meta.edible;
        break;
      case 'discover':
        hit = event === 'discover';
        break;
      case 'identify-correct':
        hit = event === 'identify' && meta.correct;
        break;
      case 'identify-streak':
        hit = event === 'identify-streak';
        value = Math.max(0, meta.streak ?? 0);
        break;
      case 'collect-species':
        hit = event === 'collect' && meta.speciesId === def.speciesId;
        break;
      case 'visit-biome':
        hit = event === 'visit-biome' && meta.biome === (def.biome || meta.biome);
        break;
      case 'rare-find':
        hit = event === 'collect' && (meta.rarity ?? 0) >= (def.rarityMin || 4);
        break;
      case 'photo':
        hit = event === 'photo';
        break;
      case 'poison-identify':
        hit = event === 'identify' && meta.correct && meta.poisonous && !meta.collected;
        break;
      case 'largest-bolete':
        hit = event === 'identify' && meta.speciesId?.startsWith('boletus') && (meta.sizeCm ?? 0) >= (def.minimum ?? 18);
        break;
      case 'fog-expedition':
        hit = event === 'expedition-end' && meta.weather === 'fog';
        break;
      case 'distinct-species-run':
        hit = event === 'collect';
        value = meta.distinctRun ?? 0;
        break;
      case 'expedition':
        hit = event === 'expedition-end';
        break;
      case 'fill-basket':
        hit = event === 'basket-full';
        break;
    }
    if (!hit || !challengeMatches(def, meta)) continue;
    const entry = challengeEntry(def);
    if (entry.completed) continue;
    if (def.type === 'identify-streak' || def.type === 'distinct-species-run') {
      entry.progress = Math.max(entry.progress, value);
    } else {
      entry.progress += value;
    }
    if (entry.progress >= def.target) {
      entry.completed = true;
      entry.granted = true;
      S.stats.challengesCompleted++;
      addXP(def.rewardXp, 'Challenge complete');
      if (def.rewardMoney) addMoney(def.rewardMoney);
      emit('challenge', { def });
      toast('Challenge complete', def.title, 'good');
      saveNow();
    }
  }
  saveSoon();
}

export function challengeList(kind: 'daily' | 'weekly' | 'special') {
  const defs = kind === 'daily' ? dailyChallenges() : kind === 'weekly' ? weeklyChallenges() : SPECIAL_CHALLENGES;
  return defs.map((def) => ({ def, entry: challengeEntry(def) }));
}

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: SaveState) => boolean;
}

const distinct = (arr: BiomeId[]) => new Set(arr).size;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-id', name: 'First Names', desc: 'Identify your first mushroom correctly.', icon: 'book', check: (s) => s.stats.identifiedCorrect >= 1 },
  { id: 'ten-species', name: 'Ten Names', desc: 'Discover 10 different species.', icon: 'leaf', check: (s) => s.stats.speciesDiscovered >= 10 },
  { id: 'quarter', name: 'A Quarter of the Archive', desc: 'Discover 25% of the species in the encyclopedia.', icon: 'book', check: (s) => s.stats.speciesDiscovered >= Math.ceil(ALL_SPECIES.length * 0.25) },
  { id: 'half', name: 'Half the Archive', desc: 'Discover half of the encyclopedia.', icon: 'book', check: (s) => s.stats.speciesDiscovered >= Math.ceil(ALL_SPECIES.length * 0.5) },
  { id: 'all-species', name: 'The Complete Archive', desc: 'Discover every species in the encyclopedia.', icon: 'star', check: (s) => s.stats.speciesDiscovered >= ALL_SPECIES.length },
  { id: 'all-biomes', name: 'Seven Forests', desc: 'Visit all seven forest biomes.', icon: 'map', check: (s) => distinct(s.stats.biomesVisited) >= BIOMES.length },
  { id: 'hunter', name: 'A Real Hunter', desc: 'Collect 100 mushrooms.', icon: 'basket', check: (s) => s.stats.mushroomsCollected >= 100 },
  { id: 'sharp-eye', name: 'Sharp Eye', desc: 'Identify 20 mushrooms in a row without a mistake.', icon: 'eye', check: (s) => s.stats.maxStreak >= 20 },
  { id: 'poison-wise', name: 'Know Your Enemy', desc: 'Correctly identify 10 poisonous species without collecting them.', icon: 'skull', check: (s) => s.stats.identifiedCorrect >= 10 && s.stats.poisonousCollected === 0 },
  { id: 'no-poison', name: 'Clean Basket', desc: 'Sell 50 edible mushrooms and never sell a poisonous one.', icon: 'basket', check: (s) => s.stats.edibleCollected >= 50 && s.stats.poisonousCollected === 0 },
  { id: 'money', name: 'A Good Season', desc: 'Earn €500 from the market.', icon: 'coin', check: (s) => s.stats.moneyEarned >= 500 },
  { id: 'rich', name: 'The Market Knows You', desc: 'Earn €2,000 from the market.', icon: 'coin', check: (s) => s.stats.moneyEarned >= 2000 },
  { id: 'photographer', name: 'Field Photographer', desc: 'Photograph 10 different species.', icon: 'camera', check: (s) => Object.values(s.species).filter((r) => r.photos > 0).length >= 10 },
  { id: 'walker', name: 'Ten Kilometres', desc: 'Walk 10 km through the forest.', icon: 'boots', check: (s) => s.stats.distanceWalked >= 10000 },
  { id: 'night', name: 'After Dusk', desc: 'Complete an expedition that passes into the night.', icon: 'moon', check: (s) => s.stats.nights >= 1 },
  { id: 'challenges', name: 'Challenge Accepted', desc: 'Complete 10 challenges.', icon: 'target', check: (s) => s.stats.challengesCompleted >= 10 },
  { id: 'level5', name: 'Mushroom Specialist', desc: 'Reach level 5.', icon: 'star', check: (s) => levelForXp(s.profile.xp).level >= 5 },
  { id: 'level7', name: 'Master of the Forest', desc: 'Reach level 7.', icon: 'star', check: (s) => levelForXp(s.profile.xp).level >= 7 },
  { id: 'aereus', name: 'Bronze and Oak', desc: 'Discover Boletus aereus.', icon: 'leaf', check: (s) => !!s.species['boletus-aereus']?.discovered },
  { id: 'all-boletes', name: 'The Boletes', desc: 'Discover every bolete in the encyclopedia.', icon: 'leaf', check: (s) => ALL_SPECIES.filter((x) => x.form === 'bolete').every((x) => s.species[x.id]?.discovered) },
  { id: 'deadly-id', name: 'Face to Face', desc: 'Correctly identify the death cap and leave it in the ground.', icon: 'skull', check: (s) => !!s.species['amanita-phalloides']?.discovered },
  { id: 'survivor', name: 'Survivor', desc: 'Complete a survival expedition and return to the cabin.', icon: 'flame', check: (s) => s.stats.runs >= 1 && s.records.bestRunScore > 0 && !!s.achievements['night'] },
];

export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (S.achievements[a.id]) continue;
    let ok = false;
    try {
      ok = a.check(S);
    } catch {
      ok = false;
    }
    if (ok) {
      S.achievements[a.id] = Date.now();
      S.stats.achievementsUnlocked = Object.keys(S.achievements).length;
      emit('achievement', a);
      toast('Achievement', a.name, 'good');
      addXP(50, 'Achievement');
      saveNow();
    }
  }
}

/* ------------------------------------------------------------------ */
/* runs                                                                */
/* ------------------------------------------------------------------ */

export function startRun(opts: { mode: Mode; biome: BiomeId; isoDate: string; hour: number; weather: string; x: number; z: number; yaw: number; provisions?: number }) {
  const min = S.settings.dayLengthMinutes;
  void min;
  S.run = {
    mode: opts.mode,
    biome: opts.biome,
    isoDate: opts.isoDate,
    hour: opts.hour,
    weather: opts.weather,
    x: opts.x,
    z: opts.z,
    yaw: opts.yaw,
    startedAt: Date.now(),
    xpStart: S.profile.xp,
    moneyStart: S.profile.money,
    discoveries: [],
    correctIds: 0,
    wrongIds: 0,
    streak: 0,
    maxStreak: 0,
    edibleCollected: 0,
    poisonCollected: 0,
    photos: 0,
    distinctCollected: [],
    survival: opts.mode === 'survival' ? { energy: 100, provisions: opts.provisions ?? S.provisions, distance: 0 } : null,
    challengeTarget: null,
  };
  S.stats.runs++;
  if (!S.stats.biomesVisited.includes(opts.biome)) S.stats.biomesVisited.push(opts.biome);
  if (!S.stats.daysPlayed.includes(opts.isoDate)) S.stats.daysPlayed.push(opts.isoDate);
  notifyChallenge('visit-biome', 1, { biome: opts.biome });
  saveNow();
}

export function noteRunIdentification(correct: boolean) {
  if (!S.run) return;
  if (correct) {
    S.run.correctIds++;
    S.run.streak++;
    S.run.maxStreak = Math.max(S.run.maxStreak, S.run.streak);
    S.stats.maxStreak = Math.max(S.stats.maxStreak, S.run.streak);
    S.records.longestStreak = Math.max(S.records.longestStreak, S.run.streak);
  } else {
    S.run.wrongIds++;
    S.run.streak = 0;
  }
  saveSoon();
}

export function noteRunDiscovery(id: string) {
  if (!S.run) return;
  if (!S.run.discoveries.includes(id)) S.run.discoveries.push(id);
}

export function runScore(): number {
  if (!S.run) return 0;
  const speciesValue = S.run.discoveries.length * 25;
  const correct = S.run.correctIds * 10;
  const edible = S.run.edibleCollected * 6;
  const penalty = S.run.poisonCollected * 22 + S.run.wrongIds * 8;
  return Math.max(0, Math.round(speciesValue + correct + edible - penalty));
}

export function endRun(): { score: number; xpGained: number; moneyGained: number; summary: RunState | null } {
  const run = S.run;
  if (!run) return { score: 0, xpGained: 0, moneyGained: 0, summary: null };
  const score = runScore();
  const xpGained = S.profile.xp - run.xpStart;
  const moneyGained = S.profile.money - run.moneyStart;
  S.records.bestRunScore = Math.max(S.records.bestRunScore, score);
  S.records.bestSpeciesCount = Math.max(S.records.bestSpeciesCount, run.discoveries.length);
  if (run.mode === 'survival') {
    S.provisions = Math.max(0, Math.min(9, (run.survival?.provisions ?? 0)));
  }
  notifyChallenge('expedition-end', 1, { weather: run.weather, biome: run.biome, score, mode: run.mode });
  if (run.survival) {
    // finishing a survival run at the cabin counts as returning
  }
  S.stats.timePlayedSec += Math.round((Date.now() - run.startedAt) / 1000);
  S.run = null;
  checkAchievements();
  saveNow();
  return { score, xpGained, moneyGained, summary: run };
}

export function syncRun(partial: Partial<RunState>) {
  if (!S.run) return;
  Object.assign(S.run, partial);
  saveSoon();
}

export function noteNight() {
  S.stats.nights++;
  checkAchievements();
}
