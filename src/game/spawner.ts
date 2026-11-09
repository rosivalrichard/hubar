/* Mushroom population: season + weather + habitat weighted placement. */

import * as THREE from 'three';
import type { Species } from '../data/species-types';
import { ALL_SPECIES } from '../data/species';
import type { Biome } from '../data/biomes';
import type { Forest, HostTree } from '../three/forest';
import { buildMushroomVisual, GrowthStage, MushroomVisual } from '../three/mushroom';
import { RNG, TAU, clamp, lerp, strSeed, smoothstep, pickWeighted, monthOf } from '../core/util';

export interface MushroomEntity {
  uid: number;
  species: Species;
  stage: GrowthStage;
  variant: number;
  scale: number;
  sizeCm: number;
  visual: MushroomVisual;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  observations: Set<string>;
  identified: boolean;
  misidentified: boolean;
  inspected: boolean;
  photographed: boolean;
  collected: boolean;
  spawnTime: number;
}

export interface SpawnContext {
  biome: Biome;
  isoDate: string;
  wetness: number; // 0..1 recent rain
  temperature: number;
  fog: number;
  seed: number;
  targetCount: number;
}

const STAGE_WEIGHTS: [GrowthStage, number][] = [
  ['young', 0.28],
  ['mature', 0.48],
  ['old', 0.16],
  ['damaged', 0.08],
];

export class MushroomField {
  group = new THREE.Group();
  mushrooms: MushroomEntity[] = [];
  private uid = 1;
  private rng: RNG;
  private ctx: SpawnContext;
  private meshes: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    private forest: Forest,
    ctx: SpawnContext
  ) {
    this.ctx = ctx;
    this.rng = new RNG(ctx.seed);
    scene.add(this.group);
    this.populate();
  }

  /* ------------------------------------------------------------------ */

  private month() {
    return monthOf(this.ctx.isoDate);
  }

  private candidates(): { sp: Species; weight: number }[] {
    const month = this.month();
    const pool = ALL_SPECIES.filter((s) => s.biomes.includes(this.ctx.biome.id));
    const inSeason = pool.filter((s) => s.months.includes(month));
    const list = inSeason.length >= 3 ? inSeason : pool.filter((s) => {
      // nearest fruiting month within 2
      return s.months.some((m) => Math.min(Math.abs(m - month), 12 - Math.abs(m - month)) <= 2);
    });
    const use = list.length ? list : pool;
    return use.map((sp) => {
      let w = 1 / Math.pow(sp.rarity, 1.35);
      if (this.ctx.biome.spawnBias.includes(sp.id)) w *= 2.4;
      if (sp.months.includes(month)) w *= 1.6;
      // weather preferences
      if (this.ctx.wetness > 0.55) {
        if (['deadwood', 'litter', 'moss'].some((s) => sp.substrate.includes(s as never))) w *= 1.15;
        if (sp.visual.capPattern === 'warty') w *= 0.8;
      } else {
        if (sp.substrate.includes('deadwood')) w *= 1.1;
        if (sp.visual.sticky) w *= 0.8;
      }
      if (this.ctx.temperature < 8 && sp.months.includes(12)) w *= 1.4;
      if (sp.rarity >= 4) w *= smoothstep(0.2, 0.9, this.ctx.wetness) * 1.4 + 0.25;
      // keep deadly species present but rarer than their rarity suggests
      if (sp.edibility === 'deadly') w *= 0.7;
      return { sp, weight: Math.max(0.001, w) };
    });
  }

  private pickStage(): GrowthStage {
    let r = this.rng.f();
    for (const [stage, w] of STAGE_WEIGHTS) {
      r -= w;
      if (r <= 0) return stage;
    }
    return 'mature';
  }

  private hostFor(sp: Species): HostTree | null {
    const allowed = this.forest.hosts.filter((h) => sp.hosts.includes(h.kind as never));
    if (!allowed.length) return null;
    return allowed[Math.floor(this.rng.f() * allowed.length)];
  }

  private anchorFor(sp: Species): { pos: THREE.Vector3; substrate: string } | null {
    const rng = this.rng;
    // wood dwellers
    if (sp.substrate.includes('deadwood') || sp.substrate.includes('stump')) {
      if (this.forest.logs.length && rng.chance(0.55)) {
        const log = this.forest.logs[Math.floor(rng.f() * this.forest.logs.length)];
        const t = rng.range(-0.42, 0.42);
        const side = rng.chance(0.5) ? 1 : -1;
        const perp = new THREE.Vector3(-log.dir.z, 0, log.dir.x);
        const pos = log.pos
          .clone()
          .addScaledVector(log.dir, log.length * t)
          .addScaledVector(perp, side * (log.radius + 0.06))
          .add(new THREE.Vector3(0, log.radius * 0.55, 0));
        return { pos, substrate: 'deadwood' };
      }
      if (this.forest.stumps.length) {
        const st = this.forest.stumps[Math.floor(rng.f() * this.forest.stumps.length)];
        const a = rng.f() * TAU;
        const pos = st.pos
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * st.radius * 0.7, st.height * rng.range(0.5, 1), Math.sin(a) * st.radius * 0.7));
        return { pos, substrate: 'deadwood' };
      }
    }
    // mycorrhizal: near host tree
    if (sp.hosts.length && rng.chance(0.85)) {
      const host = this.hostFor(sp);
      if (host) {
        const a = rng.f() * TAU;
        const dist = sp.id === 'boletus-edulis' ? rng.range(1.2, 5.5) : rng.range(0.7, 4.2);
        const x = host.pos.x + Math.cos(a) * dist;
        const z = host.pos.z + Math.sin(a) * dist;
        if (this.validGround(x, z)) {
          return {
            pos: new THREE.Vector3(x, this.forest.heightAt(x, z), z),
            substrate: sp.substrate[0],
          };
        }
      }
    }
    // litter / moss / grass sites
    if (sp.substrate.includes('path') && rng.chance(0.4)) {
      const z = rng.range(-70, 70);
      const x = this.forest.pathX(z) + rng.range(-1.4, 1.4);
      if (this.validGround(x, z)) {
        return { pos: new THREE.Vector3(x, this.forest.heightAt(x, z), z), substrate: 'path' };
      }
    }
    const site = this.forest.openSites.length && rng.chance(0.4)
      ? this.forest.openSites[Math.floor(rng.f() * this.forest.openSites.length)]
      : null;
    if (site) return { pos: site.pos.clone(), substrate: site.substrate };
    // generic ground
    for (let i = 0; i < 12; i++) {
      const p = this.forest.randomPoint(rng, 4, 88);
      if (this.validGround(p.x, p.z)) {
        return { pos: p, substrate: sp.substrate[0] };
      }
    }
    return null;
  }

  private validGround(x: number, z: number) {
    if (this.forest.slopeAt(x, z) > 1.15) return false;
    if (this.forest.isPath(x, z, 0.8)) return false;
    if (this.forest.isWater(x, z)) return false;
    for (const c of this.forest.colliders) {
      if (Math.hypot(c.x - x, c.z - z) < c.r + 0.2) return false;
    }
    for (const m of this.mushrooms) {
      if (Math.hypot(m.position.x - x, m.position.z - z) < 0.22) return false;
    }
    return true;
  }

  private populate() {
    const { targetCount, wetness, temperature } = this.ctx;
    const spawnBudget = Math.round(targetCount * (0.72 + wetness * 0.5) * (temperature < 6 ? 0.8 : 1));
    const pool = this.candidates();
    let guard = 0;
    while (this.mushrooms.length < spawnBudget && guard < spawnBudget * 14) {
      guard++;
      const chosen = pickWeighted(pool, (p) => p.weight, this.rng);
      if (!chosen) break;
      const sp = chosen.sp;
      const anchor = this.anchorFor(sp);
      if (!anchor) continue;
      const clusterSize = this.rng.int(sp.visual.cluster[0], Math.min(sp.visual.cluster[1], 5));
      for (let c = 0; c < clusterSize; c++) {
        const a = this.rng.f() * TAU;
        const d = c === 0 ? 0 : this.rng.range(0.12, 0.62);
        const x = anchor.pos.x + Math.cos(a) * d;
        const z = anchor.pos.z + Math.sin(a) * d;
        if (c > 0 && !this.validGround(x, z)) continue;
        const baseY = this.forest.heightAt(x, z);
        const y = Math.max(baseY, anchor.pos.y - 0.05) + 0.008;
        const stage = this.pickStage();
        const diameter = lerp(sp.visual.capDiameter[0], sp.visual.capDiameter[1], Math.pow(this.rng.f(), 1.6));
        const maxD = sp.visual.capDiameter[1];
        let scale = clamp(diameter / maxD, 0.25, 1.15);
        if (stage === 'young') scale *= 0.82;
        if (stage === 'old') scale *= 1.04;
        if (this.ctx.biome.id === 'mountain') scale *= 0.92;
        const variant = this.rng.int(0, 2);
        const visual = buildMushroomVisual(sp, stage, variant, wetness > 0.55, scale);
        const normal = this.forest.groundNormal(x, z);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const tilt = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(Math.cos(this.rng.f() * TAU), 0, Math.sin(this.rng.f() * TAU)),
          this.rng.range(-0.18, 0.18)
        );
        visual.group.quaternion.copy(q).multiply(tilt);
        visual.group.position.set(x, y, z);
        visual.group.name = 'mushroom';
        visual.mesh.userData.uid = this.mushrooms.length + 1;
        this.group.add(visual.group);
        this.meshes.push(visual.mesh);
        this.mushrooms.push({
          uid: this.uid++,
          species: sp,
          stage,
          variant,
          scale,
          sizeCm: diameter,
          visual,
          position: new THREE.Vector3(x, y, z),
          normal,
          observations: new Set(),
          identified: false,
          misidentified: false,
          inspected: false,
          photographed: false,
          collected: false,
          spawnTime: performance.now(),
        });
        if (this.mushrooms.length >= spawnBudget) break;
      }
    }
  }

  /* ------------------------------------------------------------------ */

  raycast(camera: THREE.Camera, maxDist: number): MushroomEntity | null {
    const raycaster = new THREE.Raycaster();
    raycaster.far = maxDist;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(this.meshes, false);
    for (const h of hits) {
      const uid = (h.object as THREE.Mesh).userData.uid as number;
      const m = this.mushrooms.find((mm) => mm.uid === uid);
      if (m && !m.collected) return m;
    }
    return null;
  }

  nearest(position: THREE.Vector3, maxDist = 3): MushroomEntity | null {
    let best: MushroomEntity | null = null;
    let bestD = maxDist;
    for (const m of this.mushrooms) {
      if (m.collected) continue;
      const d = m.position.distanceTo(position);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  collect(m: MushroomEntity) {
    m.collected = true;
    this.group.remove(m.visual.group);
    const i = this.meshes.indexOf(m.visual.mesh);
    if (i >= 0) this.meshes.splice(i, 1);
  }

  /** After heavy rain, a flush of new fruit bodies appears. */
  flush(count = 12) {
    const pool = this.candidates();
    for (let i = 0; i < count; i++) {
      const chosen = pickWeighted(pool, (p) => p.weight * 1.2, this.rng);
      if (!chosen) continue;
      const anchor = this.anchorFor(chosen.sp);
      if (!anchor) continue;
      const y = this.forest.heightAt(anchor.pos.x, anchor.pos.z) + 0.008;
      const diameter = lerp(chosen.sp.visual.capDiameter[0], chosen.sp.visual.capDiameter[1], 0.5);
      const scale = clamp(diameter / chosen.sp.visual.capDiameter[1], 0.3, 1.1);
      const variant = this.rng.int(0, 2);
      const visual = buildMushroomVisual(chosen.sp, 'young', variant, true, scale);
      visual.group.position.set(anchor.pos.x, y, anchor.pos.z);
      visual.group.rotation.y = this.rng.f() * TAU;
      this.group.add(visual.group);
      this.meshes.push(visual.mesh);
      const entity: MushroomEntity = {
        uid: this.uid++,
        species: chosen.sp,
        stage: 'young',
        variant,
        scale,
        sizeCm: diameter,
        visual,
        position: new THREE.Vector3(anchor.pos.x, y, anchor.pos.z),
        normal: this.forest.groundNormal(anchor.pos.x, anchor.pos.z),
        observations: new Set(),
        identified: false,
        misidentified: false,
        inspected: false,
        photographed: false,
        collected: false,
        spawnTime: performance.now(),
      };
      this.meshes[this.meshes.length - 1].userData.uid = entity.uid;
      this.mushrooms.push(entity);
    }
  }

  getActive(): MushroomEntity[] {
    return this.mushrooms.filter((m) => !m.collected);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.mushrooms) {
      m.visual.mesh.geometry = m.visual.mesh.geometry; // cached, do not dispose
    }
    this.mushrooms.length = 0;
    this.meshes.length = 0;
    this.group.clear();
  }
}
