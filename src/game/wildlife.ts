/* Living forest: wildlife with its own behaviour, timing and habitat.
 *
 * Animals are spawned in a ring around the player and recycled when far away. Each species has a
 * perception radius (smaller when the player crouches, larger when running), its own reaction
 * (deer freeze then bolt, boars burst out of cover, birds take off, squirrels climb trees,
 * hedgehogs curl up) and its own time of day and forest type. Hoofed animals leave tracks in mud.
 */

import * as THREE from 'three';
import type { Forest } from '../three/forest';
import type { BiomeId } from '../data/biomes';
import { buildAnimal, type AnimalKind, type AnimalRig } from '../three/animals';
import type { AnimalSound } from './audio';
import { RNG, TAU, clamp } from '../core/util';
import { shadowTexture } from '../three/textures';

export type WildlifeId =
  | 'reddeer'
  | 'roedeer'
  | 'boar'
  | 'fox'
  | 'squirrel'
  | 'hare'
  | 'hedgehog'
  | 'songbird'
  | 'jay'
  | 'woodpecker'
  | 'owl'
  | 'butterfly'
  | 'snail'
  | 'frog';

export const WILDLIFE_NAME: Record<WildlifeId, string> = {
  reddeer: 'Red deer',
  roedeer: 'Roe deer',
  boar: 'Wild boar',
  fox: 'Red fox',
  squirrel: 'Red squirrel',
  hare: 'European hare',
  hedgehog: 'Hedgehog',
  songbird: 'Songbirds',
  jay: 'Eurasian jay',
  woodpecker: 'Great spotted woodpecker',
  owl: 'Tawny owl',
  butterfly: 'Butterflies',
  snail: 'Snails',
  frog: 'Common frog',
};
export const WILDLIFE_IDS = Object.keys(WILDLIFE_NAME) as WildlifeId[];

type Mode = 'ground' | 'bird' | 'tree' | 'tiny';

interface Def {
  id: WildlifeId;
  mode: Mode;
  walk: number;
  run: number;
  alert: number; // distance at which it notices you
  flee: number; // distance at which it bolts
  sight: number; // distance at which you "see" it for the journal
  group: [number, number];
  biomes: Partial<Record<BiomeId, number>>;
  hours: (h: number) => number; // activity 0..1
  sound?: AnimalSound;
  tracks?: boolean;
}

const dawnDusk = (h: number) => (h < 4.5 || h > 22 ? 0.35 : h < 9 || h > 17 ? 1 : 0.55);
const day = (h: number) => (h > 6.5 && h < 19 ? 1 : 0);
const night = (h: number) => (h > 19.5 || h < 5.5 ? 1 : 0);
const duskNight = (h: number) => (h > 18 || h < 6 ? 1 : 0.4);

const DEFS: Def[] = [
  { id: 'reddeer', mode: 'ground', walk: 1.1, run: 9, alert: 34, flee: 20, sight: 60, group: [1, 3], biomes: { spruce: 1, mixed: 1, mountain: 1.2, oak: 0.6, beech: 0.6 }, hours: dawnDusk, sound: 'bark', tracks: true },
  { id: 'roedeer', mode: 'ground', walk: 1.0, run: 8, alert: 28, flee: 15, sight: 50, group: [1, 3], biomes: { spruce: 1, beech: 1, oak: 1, pine: 1, mixed: 1.2, wetland: 0.8, mountain: 0.5 }, hours: dawnDusk, sound: 'bark', tracks: true },
  { id: 'boar', mode: 'ground', walk: 0.9, run: 7, alert: 14, flee: 9, sight: 40, group: [1, 1], biomes: { beech: 1.1, oak: 1.3, mixed: 1, wetland: 1, spruce: 0.4 }, hours: duskNight, sound: 'grunt', tracks: true },
  { id: 'fox', mode: 'ground', walk: 1.3, run: 6.5, alert: 22, flee: 13, sight: 40, group: [1, 1], biomes: { spruce: 1, beech: 1, oak: 1, pine: 1, mixed: 1, mountain: 1, wetland: 0.6 }, hours: duskNight, tracks: true },
  { id: 'hare', mode: 'ground', walk: 0.6, run: 9, alert: 16, flee: 9, sight: 32, group: [1, 1], biomes: { pine: 1.3, oak: 0.8, mixed: 0.7, wetland: 0.5 }, hours: dawnDusk, tracks: true },
  { id: 'squirrel', mode: 'tree', walk: 1.2, run: 4.5, alert: 12, flee: 7, sight: 22, group: [1, 1], biomes: { spruce: 1.3, pine: 1, mixed: 1.2, beech: 0.9, oak: 0.9, mountain: 0.8 }, hours: day, sound: 'chatter' },
  { id: 'hedgehog', mode: 'ground', walk: 0.25, run: 0.25, alert: 4, flee: 3.2, sight: 9, group: [1, 1], biomes: { beech: 1, oak: 1, mixed: 1, spruce: 0.5 }, hours: (h) => (h > 19 || h < 6 ? 1 : 0.05), sound: 'rustle' },
  { id: 'songbird', mode: 'bird', walk: 0.3, run: 6, alert: 9, flee: 7, sight: 18, group: [3, 6], biomes: { spruce: 1, beech: 1, oak: 1, pine: 1, mixed: 1.2, mountain: 0.7, wetland: 1 }, hours: day, sound: 'flap' },
  { id: 'jay', mode: 'bird', walk: 0.4, run: 7, alert: 13, flee: 10, sight: 25, group: [1, 2], biomes: { oak: 1.4, beech: 1, mixed: 1 }, hours: day, sound: 'jay' },
  { id: 'woodpecker', mode: 'tree', walk: 0, run: 7, alert: 7, flee: 5, sight: 25, group: [1, 1], biomes: { spruce: 1, beech: 1.2, oak: 1, mixed: 1.2, mountain: 0.8 }, hours: day, sound: 'woodpecker' },
  { id: 'owl', mode: 'tree', walk: 0, run: 7, alert: 6, flee: 4, sight: 22, group: [1, 1], biomes: { spruce: 1, beech: 1, oak: 1, mixed: 1, mountain: 0.8, wetland: 0.6 }, hours: night, sound: 'owl' },
  { id: 'butterfly', mode: 'tiny', walk: 0.6, run: 1.5, alert: 1.2, flee: 1, sight: 7, group: [1, 1], biomes: { oak: 1.3, pine: 1, mixed: 1, beech: 0.7, mountain: 0.8, wetland: 0.7, spruce: 0.5 }, hours: (h) => (h > 9 && h < 18 ? 1 : 0) },
  { id: 'snail', mode: 'tiny', walk: 0.012, run: 0.012, alert: 0, flee: 0, sight: 3, group: [1, 1], biomes: { beech: 1, mixed: 1, wetland: 1.3, oak: 0.8, spruce: 0.7 }, hours: () => 1 },
  { id: 'frog', mode: 'tiny', walk: 0.5, run: 1.4, alert: 2.6, flee: 2.2, sight: 6, group: [1, 1], biomes: { wetland: 1.6, beech: 0.3, mixed: 0.3 }, hours: () => 1, sound: 'croak' },
];
const DEF = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<WildlifeId, Def>;

type State = 'wander' | 'graze' | 'alert' | 'flee' | 'hidden' | 'charge' | 'curl' | 'perch' | 'fly' | 'climb' | 'toTree' | 'onTree' | 'flutter';

interface Animal {
  id: WildlifeId;
  def: Def;
  rig: AnimalRig;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  state: State;
  timer: number;
  phase: number;
  target: THREE.Vector3 | null;
  lead: Animal | null; // followers (piglets, herd members)
  offset: THREE.Vector3;
  alt: number; // height above ground (trees, flight)
  vy: number;
  seen: boolean;
  sounded: boolean;
  tree: { pos: THREE.Vector3; radius: number } | null;
  baseNeck: number;
  nextSound: number;
  lastStep: number;
  dead: boolean;
}

export interface WildlifeEnv {
  player: THREE.Vector3;
  forward: THREE.Vector3; // camera forward (horizontal)
  right: THREE.Vector3;
  crouching: boolean;
  running: boolean;
  hour: number;
  rain: number;
  wetness: number;
  temperature: number;
}

export interface WildlifeHooks {
  sound(sound: AnimalSound, pan: number, dist: number): void;
  sighting(id: WildlifeId): void;
  boarHit(): void;
}

const MAX_TRACKS = 360;

export class Wildlife {
  group = new THREE.Group();
  animals: Animal[] = [];
  private rng: RNG;
  private spawnTimer = 0;
  private tracks: THREE.InstancedMesh;
  private trackIdx = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private density: number;

  constructor(
    private scene: THREE.Scene,
    private forest: Forest,
    private biome: BiomeId,
    seed: number,
    quality: 'low' | 'medium' | 'high',
    private hooks: WildlifeHooks
  ) {
    this.rng = new RNG(seed ^ 0x5bd1e995);
    this.density = quality === 'low' ? 0.55 : quality === 'medium' ? 0.8 : 1;
    scene.add(this.group);
    const tg = new THREE.PlaneGeometry(1, 1);
    tg.rotateX(-Math.PI / 2);
    const tm = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x1a120a, transparent: true, opacity: 0.55, depthWrite: false });
    this.tracks = new THREE.InstancedMesh(tg, tm, MAX_TRACKS);
    this.tracks.count = 0;
    this.tracks.frustumCulled = false;
    this.tracks.renderOrder = 1;
    this.group.add(this.tracks);
  }

  /* ---------------- population ---------------- */

  private target(id: WildlifeId, env: WildlifeEnv): number {
    const d = DEF[id];
    const hab = d.biomes[this.biome] ?? 0;
    if (!hab) return 0;
    const act = d.hours(env.hour);
    if (!act) return 0;
    let n = 0;
    switch (id) {
      case 'reddeer':
      case 'roedeer':
      case 'boar':
      case 'fox':
      case 'hare':
        n = 0.9 * hab * act;
        break;
      case 'squirrel':
        n = 1.6 * hab * act;
        break;
      case 'hedgehog':
        n = 0.9 * hab * act;
        break;
      case 'songbird':
        n = 2 * hab * act * (1 - env.rain * 0.8);
        break;
      case 'jay':
      case 'woodpecker':
        n = 0.9 * hab * act * (1 - env.rain * 0.6);
        break;
      case 'owl':
        n = 1 * hab * act;
        break;
      case 'butterfly':
        n = env.temperature >= 12 && env.rain < 0.15 ? 7 * hab * act : 0;
        break;
      case 'snail':
        n = env.wetness > 0.4 || env.rain > 0.2 ? 7 * hab : 1.5 * hab;
        break;
      case 'frog':
        n = 4 * hab * (env.wetness > 0.4 ? 1.3 : 1);
        break;
    }
    return n * this.density;
  }

  private groupsOf(id: WildlifeId) {
    return this.animals.filter((a) => a.id === id && !a.lead && !a.dead).length;
  }

  private maintain(env: WildlifeEnv) {
    for (const id of WILDLIFE_IDS) {
      const want = this.target(id, env);
      const have = this.groupsOf(id);
      // fractional targets become probabilities so not every walk has every animal
      if (have < Math.floor(want) || (have < Math.ceil(want) && this.rng.chance((want % 1) * 0.35))) {
        this.spawn(id, env);
      }
    }
  }

  private ringPoint(env: WildlifeEnv, minR: number, maxR: number): THREE.Vector3 | null {
    for (let i = 0; i < 14; i++) {
      const a = this.rng.f() * TAU;
      const r = this.rng.range(minR, maxR);
      const x = env.player.x + Math.cos(a) * r;
      const z = env.player.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > 90) continue;
      if (this.forest.isWater(x, z) || this.blocked(x, z, 0.4)) continue;
      return new THREE.Vector3(x, this.forest.heightAt(x, z), z);
    }
    return null;
  }

  private blocked(x: number, z: number, pad: number) {
    for (const c of this.forest.colliders) {
      const dx = c.x - x;
      const dz = c.z - z;
      const r = c.r + pad;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  private nearTree(p: THREE.Vector3, maxD: number) {
    let best: { pos: THREE.Vector3; radius: number } | null = null;
    let bd = maxD;
    for (const h of this.forest.hosts) {
      const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = { pos: h.pos, radius: h.radius };
      }
    }
    return best;
  }

  private make(id: WildlifeId, pos: THREE.Vector3, kind: AnimalKind = id as AnimalKind, variant = this.rng.int(0, 3)): Animal {
    const rig = buildAnimal(kind, variant);
    const s = this.rng.range(0.9, 1.08);
    rig.root.scale.setScalar(s);
    this.group.add(rig.root);
    const a: Animal = {
      id,
      def: DEF[id],
      rig,
      pos: pos.clone(),
      heading: this.rng.f() * TAU,
      speed: 0,
      state: 'wander',
      timer: this.rng.range(1, 5),
      phase: this.rng.f() * TAU,
      target: null,
      lead: null,
      offset: new THREE.Vector3(),
      alt: 0,
      vy: 0,
      seen: false,
      sounded: false,
      tree: null,
      baseNeck: rig.head?.rotation.x ?? 0,
      nextSound: this.rng.range(3, 12),
      lastStep: 0,
      dead: false,
    };
    this.animals.push(a);
    return a;
  }

  private spawn(id: WildlifeId, env: WildlifeEnv) {
    const d = DEF[id];
    if (d.mode === 'tiny') {
      const p = this.ringPoint(env, id === 'snail' ? 3 : 5, id === 'snail' ? 18 : 26);
      if (!p) return;
      const a = this.make(id, p);
      a.state = id === 'butterfly' ? 'flutter' : 'wander';
      a.target = p.clone();
      if (id === 'butterfly') a.alt = this.rng.range(0.4, 1.3);
      return;
    }
    if (d.mode === 'tree') {
      const p = this.ringPoint(env, 14, 40);
      if (!p) return;
      const tree = this.nearTree(p, 12);
      if (!tree) return;
      const a = this.make(id, p);
      a.tree = tree;
      if (id === 'squirrel') {
        // on the ground near its tree
        const ang = this.rng.f() * TAU;
        a.pos.set(tree.pos.x + Math.cos(ang) * (tree.radius + 1.5), 0, tree.pos.z + Math.sin(ang) * (tree.radius + 1.5));
        a.pos.y = this.forest.heightAt(a.pos.x, a.pos.z);
        a.state = 'wander';
      } else {
        this.placeOnTrunk(a, this.rng.range(id === 'owl' ? 6 : 3, id === 'owl' ? 9 : 7));
        a.state = 'perch';
      }
      return;
    }
    if (d.mode === 'bird') {
      const p = this.ringPoint(env, 16, 38);
      if (!p) return;
      const n = this.rng.int(d.group[0], d.group[1]);
      let lead: Animal | null = null;
      for (let i = 0; i < n; i++) {
        const q = p.clone().add(new THREE.Vector3(this.rng.range(-1.6, 1.6), 0, this.rng.range(-1.6, 1.6)));
        q.y = this.forest.heightAt(q.x, q.z);
        const a = this.make(id, q, id === 'jay' ? 'jay' : 'songbird', i);
        a.state = 'graze';
        if (lead) a.lead = lead;
        else lead = a;
      }
      return;
    }
    // ground mammals
    const isBoar = id === 'boar';
    const ambush = isBoar && this.rng.chance(0.55);
    const p = this.ringPoint(env, ambush ? 16 : 30, ambush ? 26 : 62);
    if (!p) return;
    const lead = this.make(id, p);
    if (ambush) {
      // waiting in dense cover; bursts out when you come close
      lead.state = 'hidden';
      lead.rig.root.visible = false;
    }
    const n = this.rng.int(d.group[0], d.group[1]);
    for (let i = 1; i < n; i++) {
      const f = this.make(id, p.clone().add(new THREE.Vector3(this.rng.range(-3, 3), 0, this.rng.range(-3, 3))));
      f.lead = lead;
      f.offset.set(this.rng.range(-3, 3), 0, this.rng.range(-4, -1));
    }
    if (isBoar) {
      // sow with striped piglets
      const piglets = this.rng.int(0, 4);
      for (let i = 0; i < piglets; i++) {
        const f = this.make('boar', p.clone(), 'piglet');
        f.lead = lead;
        f.offset.set(this.rng.range(-1.5, 1.5), 0, this.rng.range(-2.4, -0.6));
        if (ambush) f.rig.root.visible = false, (f.state = 'hidden');
      }
    }
  }

  private placeOnTrunk(a: Animal, height: number) {
    const t = a.tree!;
    const ang = this.rng.f() * TAU;
    const r = t.radius * 0.55 + 0.08;
    a.pos.set(t.pos.x + Math.cos(ang) * r, t.pos.y, t.pos.z + Math.sin(ang) * r);
    a.alt = height;
    a.heading = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z); // facing the trunk
    if (a.id === 'owl') a.heading += Math.PI; // owls sit with the back to the trunk
    if (a.id === 'woodpecker') {
      // clinging upright to the bark
      a.rig.body.rotation.x = -1.2;
      if (a.rig.head) a.rig.head.rotation.x = 1.0;
    }
  }

  /* ---------------- update ---------------- */

  private primed = false;

  update(dt: number, env: WildlifeEnv) {
    if (!this.primed) {
      // the forest is already alive when you arrive
      this.primed = true;
      for (let i = 0; i < 8; i++) this.maintain(env);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.maintain(env);
    }
    for (const a of this.animals) {
      if (a.dead) continue;
      this.think(a, dt, env);
      this.animate(a, dt);
      a.rig.root.position.set(a.pos.x, a.pos.y + a.alt, a.pos.z);
      a.rig.root.rotation.y = a.heading;
      const dist = a.pos.distanceTo(env.player);
      if (!a.seen && a.rig.root.visible && dist < a.def.sight) {
        const dir = new THREE.Vector3(a.pos.x - env.player.x, 0, a.pos.z - env.player.z).normalize();
        if (dir.dot(env.forward) > 0.55 || dist < 4) {
          a.seen = true;
          this.hooks.sighting(a.id);
        }
      }
      if (dist > 95) this.remove(a);
    }
    if (this.animals.some((a) => a.dead)) this.animals = this.animals.filter((a) => !a.dead);
  }

  private remove(a: Animal) {
    a.dead = true;
    this.group.remove(a.rig.root);
    for (const o of this.animals) if (o.lead === a) o.lead = null;
  }

  private emit(a: Animal, env: WildlifeEnv, sound?: AnimalSound) {
    const s = sound ?? a.def.sound;
    if (!s) return;
    const d = a.pos.distanceTo(env.player);
    const dir = new THREE.Vector3(a.pos.x - env.player.x, 0, a.pos.z - env.player.z).normalize();
    this.hooks.sound(s, clamp(dir.dot(env.right), -1, 1), d);
  }

  private think(a: Animal, dt: number, env: WildlifeEnv) {
    const d = a.def;
    const dx = a.pos.x - env.player.x;
    const dz = a.pos.z - env.player.z;
    const dist = Math.hypot(dx, dz);
    // perception: crouching makes you harder to notice, running easier
    const percept = dist * (env.crouching ? 1.7 : 1) / (env.running ? 1.5 : 1);
    const away = Math.atan2(dx, dz);
    a.timer -= dt;

    // ambient calls
    a.nextSound -= dt;
    if (a.nextSound <= 0) {
      a.nextSound = this.rng.range(8, 22);
      if (a.id === 'woodpecker' && a.state === 'perch') this.emit(a, env);
      else if (a.id === 'owl' && a.state === 'perch') this.emit(a, env);
      else if (a.id === 'frog' && this.rng.chance(0.4)) this.emit(a, env);
      else if (a.id === 'jay' && this.rng.chance(0.3)) this.emit(a, env);
    }

    if (d.mode === 'tiny') return this.thinkTiny(a, dt, env, dist, away);
    if (d.mode === 'bird') return this.thinkBird(a, dt, env, percept, away);
    if (a.id === 'woodpecker' || a.id === 'owl') return this.thinkPercher(a, dt, env, percept, away);
    if (a.id === 'squirrel') return this.thinkSquirrel(a, dt, env, percept, away);
    if (a.id === 'hedgehog') return this.thinkHedgehog(a, dt, dist);

    // followers stay with their leader unless the group is fleeing
    if (a.lead && !a.lead.dead) {
      const L = a.lead;
      if (L.state === 'hidden') return;
      if (a.state === 'hidden') {
        a.state = 'flee';
        a.rig.root.visible = true;
      }
      const goal = L.pos.clone().add(a.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), L.heading));
      const gx = goal.x - a.pos.x;
      const gz = goal.z - a.pos.z;
      const gd = Math.hypot(gx, gz);
      const want = L.state === 'flee' || L.state === 'charge' ? d.run * 1.05 : gd > 1.2 ? d.walk * 1.4 : 0;
      a.state = L.state === 'graze' && gd < 1.5 ? 'graze' : L.state === 'alert' ? 'alert' : gd > 0.6 ? 'wander' : 'graze';
      if (gd > 0.3) a.heading = turnTo(a.heading, Math.atan2(gx, gz), dt * 5);
      a.speed = damp1(a.speed, want, dt * 4);
      this.step(a, dt);
      return;
    }

    switch (a.state) {
      case 'hidden':
        if (dist < 11) {
          a.rig.root.visible = true;
          this.emit(a, env, 'rustle');
          this.emit(a, env, 'grunt');
          a.state = dist < 5.5 ? 'charge' : 'flee';
          a.timer = a.state === 'charge' ? 1.3 : 9;
          a.heading = a.state === 'charge' ? away + Math.PI : away + this.rng.range(-0.6, 0.6);
          for (const o of this.animals) if (o.lead === a) (o.rig.root.visible = true), (o.state = 'flee');
        }
        return;
      case 'charge':
        a.heading = turnTo(a.heading, away + Math.PI, dt * 3);
        a.speed = damp1(a.speed, d.run, dt * 6);
        this.step(a, dt);
        if (dist < 1.2) {
          this.hooks.boarHit();
          a.state = 'flee';
          a.timer = 10;
          a.heading = away + this.rng.range(-0.8, 0.8);
        } else if (a.timer <= 0) {
          a.state = 'flee';
          a.timer = 10;
          a.heading = away + this.rng.range(-0.8, 0.8);
        }
        return;
      case 'flee':
        a.heading = turnTo(a.heading, away + Math.sin(a.phase * 0.07) * (a.id === 'hare' ? 0.9 : 0.3), dt * 3);
        a.speed = damp1(a.speed, d.run, dt * 5);
        this.step(a, dt);
        if (a.id === 'fox' && a.timer < 4 && a.timer > 3.4) a.speed = 0; // fox stops to look back
        if (a.timer <= 0 && dist > 45) {
          a.state = 'wander';
          a.timer = this.rng.range(4, 9);
          a.sounded = false;
        }
        return;
      case 'alert':
        a.speed = damp1(a.speed, 0, dt * 6);
        a.heading = turnTo(a.heading, away + Math.PI, dt * 2.5);
        if (percept < d.flee || a.timer <= 0) {
          if (percept < d.alert) {
            a.state = 'flee';
            a.timer = this.rng.range(6, 10);
            a.heading = away;
            if (!a.sounded) {
              a.sounded = true;
              this.emit(a, env);
            }
          } else {
            a.state = 'wander';
            a.timer = this.rng.range(2, 5);
          }
        }
        return;
      default:
        if (percept < d.flee) {
          a.state = 'flee';
          a.timer = this.rng.range(6, 10);
          a.heading = away;
          if (!a.sounded) {
            a.sounded = true;
            this.emit(a, env);
          }
          return;
        }
        if (percept < d.alert) {
          a.state = 'alert';
          a.timer = this.rng.range(1.6, 3.2);
          return;
        }
        if (a.timer <= 0) {
          if (a.state === 'graze' || this.rng.chance(0.35)) {
            a.state = 'wander';
            a.heading += this.rng.range(-1.4, 1.4);
            a.timer = this.rng.range(3, 8);
          } else {
            a.state = 'graze';
            a.timer = this.rng.range(3, 9);
          }
        }
        a.speed = damp1(a.speed, a.state === 'wander' ? d.walk : 0, dt * 2);
        this.step(a, dt);
    }
  }

  private thinkHedgehog(a: Animal, dt: number, dist: number) {
    if (a.state === 'curl') {
      a.speed = 0;
      if (dist > 6 && a.timer <= 0) a.state = 'wander';
      return;
    }
    if (dist < a.def.flee) {
      a.state = 'curl';
      a.timer = 4;
      return;
    }
    if (a.timer <= 0) {
      a.heading += this.rng.range(-1, 1);
      a.timer = this.rng.range(2, 6);
    }
    a.speed = damp1(a.speed, a.def.walk, dt * 2);
    this.step(a, dt);
  }

  private thinkSquirrel(a: Animal, dt: number, env: WildlifeEnv, percept: number, away: number) {
    const t = a.tree!;
    switch (a.state) {
      case 'toTree': {
        const gx = t.pos.x - a.pos.x;
        const gz = t.pos.z - a.pos.z;
        a.heading = Math.atan2(gx, gz);
        a.speed = a.def.run;
        if (Math.hypot(gx, gz) < t.radius * 0.6 + 0.2) {
          a.state = 'climb';
          a.timer = this.rng.range(14, 26);
          this.emit(a, env);
        } else this.step(a, dt);
        return;
      }
      case 'climb':
        a.alt = Math.min(a.alt + dt * 2.6, 6 + (a.phase % 3));
        a.phase += dt * 3;
        if (a.alt > 5.5 && this.rng.chance(dt * 0.15)) this.emit(a, env);
        if (a.timer <= 0 && percept > 18) a.state = 'onTree';
        return;
      case 'onTree':
        // climb back down and carry on foraging
        a.alt = Math.max(0, a.alt - dt * 1.6);
        if (a.alt <= 0) {
          a.state = 'wander';
          a.heading = away;
          a.timer = 3;
        }
        return;
      default:
        if (percept < a.def.flee + 3) {
          a.state = 'toTree';
          return;
        }
        if (a.timer <= 0) {
          a.state = a.state === 'graze' ? 'wander' : 'graze';
          a.timer = this.rng.range(1, 3);
          a.heading += this.rng.range(-2, 2);
        }
        a.speed = a.state === 'wander' ? a.def.walk : 0;
        this.step(a, dt);
        // stay within a few metres of its tree
        if (Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) > 6) a.heading = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    }
  }

  private thinkPercher(a: Animal, dt: number, env: WildlifeEnv, percept: number, away: number) {
    if (a.state === 'fly') return this.fly(a, dt);
    if (a.id === 'owl' && a.rig.head) {
      // the owl follows you with its head
      const look = wrap(away + Math.PI - a.heading);
      a.rig.head.rotation.y = damp1(a.rig.head.rotation.y, clamp(look, -1.8, 1.8), dt * 3);
    } else if (a.rig.head) {
      // woodpecker: short pecking bursts against the bark
      a.phase += dt;
      a.rig.head.rotation.x = 1.0 + (Math.sin(a.phase * 0.9) > 0.6 ? Math.max(0, Math.sin(a.phase * 40)) * 0.35 : 0);
    }
    if (percept < a.def.flee) this.takeOff(a, env, away);
  }

  private thinkBird(a: Animal, dt: number, env: WildlifeEnv, percept: number, away: number) {
    if (a.state === 'fly') return this.fly(a, dt);
    const flockSpooked = a.lead?.state === 'fly';
    if (percept < a.def.flee || flockSpooked) {
      this.takeOff(a, env, away + this.rng.range(-0.7, 0.7));
      return;
    }
    // hop and peck
    if (a.timer <= 0) {
      a.timer = this.rng.range(0.4, 1.6);
      a.heading += this.rng.range(-1.6, 1.6);
      a.vy = this.rng.chance(0.5) ? 1.1 : 0;
    }
    if (a.vy > 0 || a.alt > 0) {
      a.alt = Math.max(0, a.alt + a.vy * dt);
      a.vy -= 9 * dt;
      a.speed = 0.5;
      this.step(a, dt);
    } else {
      a.vy = 0;
      a.speed = 0;
    }
    if (a.rig.head) a.rig.head.rotation.x = Math.max(0, Math.sin(a.timer * 9)) * 0.8;
  }

  private takeOff(a: Animal, env: WildlifeEnv, heading: number) {
    a.state = 'fly';
    a.heading = heading;
    a.vy = this.rng.range(2.8, 4.2);
    a.speed = a.def.run * this.rng.range(0.85, 1.15);
    a.timer = 6;
    for (const w of a.rig.wings) w.rotation.y = 0;
    if (!a.sounded) {
      a.sounded = true;
      this.emit(a, env, a.id === 'jay' ? 'jay' : 'flap');
    }
  }

  private fly(a: Animal, dt: number) {
    a.alt += a.vy * dt;
    a.vy = damp1(a.vy, 1.2, dt * 0.6);
    a.pos.x += Math.sin(a.heading) * a.speed * dt;
    a.pos.z += Math.cos(a.heading) * a.speed * dt;
    a.phase += dt * 26;
    a.rig.wings.forEach((w) => (w.rotation.z = Math.sin(a.phase) * 1.1 * (w.userData.side ?? 1)));
    if (a.timer <= 0 || a.alt > 30) this.remove(a);
  }

  private thinkTiny(a: Animal, dt: number, env: WildlifeEnv, dist: number, away: number) {
    if (a.id === 'butterfly') {
      // erratic flutter around a home point, rising away when you get very close
      a.phase += dt * 30;
      a.rig.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.2 + Math.abs(Math.sin(a.phase)) * 1.1)));
      if (a.timer <= 0) {
        a.timer = this.rng.range(0.3, 1.1);
        a.heading += this.rng.range(-1.5, 1.5);
      }
      const home = a.target!;
      if (Math.hypot(home.x - a.pos.x, home.z - a.pos.z) > 4) a.heading = turnTo(a.heading, Math.atan2(home.x - a.pos.x, home.z - a.pos.z), dt * 4);
      if (dist < a.def.flee) a.heading = away;
      const sp = dist < a.def.alert ? a.def.run : a.def.walk;
      a.pos.x += Math.sin(a.heading) * sp * dt;
      a.pos.z += Math.cos(a.heading) * sp * dt;
      a.pos.y = this.forest.heightAt(a.pos.x, a.pos.z);
      a.alt = clamp(a.alt + Math.sin(a.phase * 0.13) * dt * 0.6, 0.25, 1.8);
      if (dist > 45) this.remove(a);
      return;
    }
    if (a.id === 'snail') {
      if (a.timer <= 0) {
        a.timer = this.rng.range(6, 14);
        a.heading += this.rng.range(-0.6, 0.6);
      }
      a.speed = a.def.walk;
      this.step(a, dt, true);
      if (dist > 30) this.remove(a);
      return;
    }
    // frog: still, then hops; flees with a couple of quick hops
    if (a.alt <= 0 && a.vy <= 0) {
      a.alt = 0;
      a.speed = 0;
      if (dist < a.def.flee || a.timer <= 0) {
        const scared = dist < a.def.flee;
        a.heading = scared ? away + this.rng.range(-0.5, 0.5) : a.heading + this.rng.range(-1.2, 1.2);
        a.vy = scared ? 2.4 : 1.6;
        a.speed = scared ? a.def.run : a.def.walk;
        a.timer = this.rng.range(3, 9);
        if (scared && this.rng.chance(0.3)) this.emit(a, env);
      }
    } else {
      a.alt = Math.max(0, a.alt + a.vy * dt);
      a.vy -= 9.8 * dt;
      this.step(a, dt, true);
    }
    if (dist > 35) this.remove(a);
  }

  /** Move along the heading on the ground, sliding around trees and staying inside the world. */
  private step(a: Animal, dt: number, noCollide = false) {
    if (a.speed < 0.001) {
      a.pos.y = this.forest.heightAt(a.pos.x, a.pos.z);
      return;
    }
    const nx = a.pos.x + Math.sin(a.heading) * a.speed * dt;
    const nz = a.pos.z + Math.cos(a.heading) * a.speed * dt;
    if (Math.hypot(nx, nz) > 91) {
      a.heading = Math.atan2(-a.pos.x, -a.pos.z);
      return;
    }
    if (!noCollide && this.blocked(nx, nz, a.rig.height * 0.4)) {
      a.heading += (this.rng.chance(0.5) ? 1 : -1) * 0.9;
      return;
    }
    if (this.forest.isWater(nx, nz) && a.id !== 'frog') {
      a.heading += 1.2;
      return;
    }
    a.pos.x = nx;
    a.pos.z = nz;
    a.pos.y = this.forest.heightAt(nx, nz);
    // footprints in soft ground
    if (a.def.tracks && a.alt === 0) {
      a.lastStep += a.speed * dt;
      const stride = a.rig.height * 0.9;
      if (a.lastStep > stride) {
        a.lastStep = 0;
        this.track(a);
      }
    }
  }

  private wetGround = 0;
  setWetness(w: number) {
    this.wetGround = w;
  }

  private track(a: Animal) {
    if (this.wetGround < 0.35) return;
    const side = (this.trackIdx % 2 ? 1 : -1) * a.rig.height * 0.12;
    const x = a.pos.x + Math.cos(a.heading) * side;
    const z = a.pos.z - Math.sin(a.heading) * side;
    const y = this.forest.heightAt(x, z) + 0.006;
    const s = a.id === 'reddeer' ? 0.11 : a.id === 'boar' ? 0.1 : 0.06;
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.heading);
    this.tmpM.compose(new THREE.Vector3(x, y, z), this.tmpQ, new THREE.Vector3(s * 0.7, 1, s));
    this.tracks.setMatrixAt(this.trackIdx % MAX_TRACKS, this.tmpM);
    this.trackIdx++;
    this.tracks.count = Math.min(MAX_TRACKS, this.trackIdx);
    this.tracks.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- animation ---------------- */

  private animate(a: Animal, dt: number) {
    const r = a.rig;
    if (a.state === 'fly' || a.def.mode === 'tiny' && a.id === 'butterfly') return;
    if (a.id === 'hedgehog') {
      const curled = a.state === 'curl';
      const k = damp1(r.body.scale.z, curled ? 0.72 : 1, dt * 6);
      r.body.scale.set(curled ? 1.1 : 1, curled ? 1.15 : 1, k);
      r.head && (r.head.visible = !curled);
      r.legs.forEach((l) => (l.visible = !curled));
    }
    if (a.id === 'squirrel' && (a.state === 'climb' || a.state === 'onTree')) {
      // body pitched up the trunk
      r.body.rotation.x = damp1(r.body.rotation.x, -Math.PI / 2, dt * 8);
      a.heading = Math.atan2(a.tree!.pos.x - a.pos.x, a.tree!.pos.z - a.pos.z);
    } else if (a.id === 'squirrel') {
      r.body.rotation.x = damp1(r.body.rotation.x, 0, dt * 8);
    }
    // gait
    const sp = a.speed;
    a.phase += dt * (2 + sp * (a.id === 'hare' || a.id === 'squirrel' ? 7 : 4.2) / Math.max(0.4, r.height));
    const amp = Math.min(0.75, sp * 0.22 + (sp > 0.05 ? 0.25 : 0));
    const gallop = sp > a.def.walk * 2.2;
    const offs = gallop ? [0, 0.4, Math.PI, Math.PI + 0.4] : [0, Math.PI, Math.PI, 0];
    r.legs.forEach((l, i) => (l.rotation.x = Math.sin(a.phase + offs[i % 4]) * amp));
    const baseY = r.body.userData.y ?? (r.body.userData.y = r.body.position.y);
    if (a.def.mode === 'ground' || a.id === 'squirrel') r.body.position.y = baseY + (sp > 0.05 ? Math.abs(Math.sin(a.phase)) * r.height * (gallop ? 0.07 : 0.025) : 0);
    if (a.def.mode === 'ground') {
      if (gallop) r.body.rotation.x = Math.sin(a.phase) * 0.08;
      else r.body.rotation.x = damp1(r.body.rotation.x, 0, dt * 6);
    }
    if (r.head && a.def.mode === 'ground') {
      const want = a.state === 'graze' ? a.baseNeck + (a.id === 'boar' || a.id === 'hare' ? 0.6 : 1.45) : a.state === 'alert' ? a.baseNeck - 0.25 : a.baseNeck;
      r.head.rotation.x = damp1(r.head.rotation.x, want, dt * 3);
    }
    if (r.tail) r.tail.rotation.y = Math.sin(a.phase * 0.7) * (a.id === 'fox' ? 0.25 : 0.1);
  }

  dispose() {
    this.scene.remove(this.group);
    this.animals.length = 0;
    this.tracks.dispose();
    this.group.clear();
  }
}

function damp1(cur: number, target: number, k: number) {
  return cur + (target - cur) * Math.min(1, k);
}
function wrap(a: number) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function turnTo(cur: number, target: number, k: number) {
  return cur + wrap(target - cur) * Math.min(1, k);
}
