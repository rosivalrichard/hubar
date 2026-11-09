/* Procedural forest: terrain, trees, understory, dead wood, rocks and landmarks. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Biome } from '../data/biomes';
import { RNG, TAU, clamp, lerp, smoothstep, fbm2, noise2, strSeed } from '../core/util';
import {
  GroundKind,
  TreeKind,
  barkTextures,
  foliageTexture,
  groundTextures,
  rockTexture,
  shadowTexture,
  understoryTexture,
} from './textures';

export interface HostTree {
  kind: TreeKind;
  pos: THREE.Vector3;
  radius: number;
  height: number;
}

export interface FallenLog {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
}

export interface Stump {
  pos: THREE.Vector3;
  radius: number;
  height: number;
}

export interface ForestOptions {
  biome: Biome;
  seed: number;
  quality: 'low' | 'medium' | 'high';
}

const WORLD_RADIUS = 96;

export class Forest {
  group = new THREE.Group();
  biome: Biome;
  quality: 'low' | 'medium' | 'high';
  seed: number;
  heightAt: (x: number, z: number) => number;
  slopeAt: (x: number, z: number) => number;
  colliders: { x: number; z: number; r: number }[] = [];
  hosts: HostTree[] = [];
  logs: FallenLog[] = [];
  stumps: Stump[] = [];
  openSites: { pos: THREE.Vector3; substrate: 'soil' | 'litter' | 'moss' | 'grass' | 'path' }[] = [];
  waterLevel = -999;
  private meshes: THREE.Object3D[] = [];
  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private leafPoints?: THREE.Points;
  private leafVel: Float32Array = new Float32Array(0);
  pathX = (z: number) => Math.sin(z * 0.031) * 6.5 + Math.sin(z * 0.011 + 1.1) * 11;
  cabinPos = new THREE.Vector3(0, 0, 74);

  constructor(private scene: THREE.Scene, opts: ForestOptions) {
    this.biome = opts.biome;
    this.seed = opts.seed;
    this.quality = opts.quality;
    const elev = this.biome.elevation;

    const baseHeight = (x: number, z: number) => {
      const n1 = fbm2(x * 0.012 + this.seed * 0.13, z * 0.012 + this.seed * 0.07, 4, 2.1, 0.52);
      const n2 = noise2(x * 0.05 + 9, z * 0.05 + 3) * 0.35;
      const n3 = fbm2(x * 0.003 + 4, z * 0.003 + 8, 2) * 3.4;
      let h = (n1 * 0.9 + n2 * 0.35 + n3 * 0.5) * elev;
      if (this.biome.id === 'mountain') {
        h += Math.abs(fbm2(x * 0.008, z * 0.008, 3)) * elev * 1.9;
        h += Math.sin(x * 0.06 + z * 0.03) * 0.35 * elev * 0.2;
      }
      if (this.biome.id === 'wetland') {
        h -= 0.35;
        h += noise2(x * 0.09, z * 0.09) * 0.08;
      }
      return h;
    };

    this.heightAt = (x: number, z: number) => {
      let h = baseHeight(x, z);
      const d = Math.abs(x - this.pathX(z));
      if (d < 4.2) {
        const centerH = baseHeight(this.pathX(z), z);
        const t = (1 - smoothstep(0.8, 4.2, d)) * 0.75;
        h = lerp(h, centerH - 0.05, t);
      }
      const dc = Math.hypot(x - this.cabinPos.x, z - this.cabinPos.z);
      if (dc < 9) {
        const t = (1 - smoothstep(4, 9, dc)) * 0.6;
        h = lerp(h, baseHeight(this.cabinPos.x, this.cabinPos.z), t);
      }
      return h;
    };

    this.slopeAt = (x: number, z: number) => {
      const e = 0.5;
      const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
      const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      return Math.hypot(dx, dz) / (2 * e);
    };

    if (this.biome.id === 'wetland') this.waterLevel = -0.08;

    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildUnderstory();
    this.buildRocksAndLogs();
    this.buildCabin();
    this.buildLeafFall();
    this.scene.add(this.group);
  }

  /* ------------------------------------------------------------------ */

  private add(obj: THREE.Object3D) {
    this.group.add(obj);
    this.meshes.push(obj);
  }

  private buildTerrain() {
    const size = WORLD_RADIUS * 2;
    const segs = this.quality === 'low' ? 96 : this.quality === 'medium' ? 140 : 180;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cBase = new THREE.Color(this.biome.groundColor);
    const cAlt = new THREE.Color(this.biome.groundColor2);
    const cMoss = new THREE.Color('#41522c');
    const cPath = new THREE.Color('#4a3a24');
    const cRock = new THREE.Color('#6a6a5e');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const slope = this.slopeAt(x, z);
      const d = Math.abs(x - this.pathX(z));
      const m = fbm2(x * 0.06, z * 0.06, 2);
      tmp.copy(cBase).lerp(cAlt, clamp(0.5 + m * 0.7, 0, 1));
      const moss = smoothstep(0.55, 1.05, this.biome.mossAmount) * clamp(0.5 + fbm2(x * 0.11 + 3, z * 0.11, 2), 0, 1);
      tmp.lerp(cMoss, moss * 0.55);
      if (d < 2.6) tmp.lerp(cPath, (1 - smoothstep(0.6, 2.6, d)) * 0.8);
      if (slope > 0.5) tmp.lerp(cRock, smoothstep(0.5, 0.95, slope) * 0.5);
      const edge = smoothstep(WORLD_RADIUS * 0.8, WORLD_RADIUS, Math.hypot(x, z));
      tmp.multiplyScalar(0.75 + 0.25 * (1 - edge));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const gtex = groundTextures(this.biome.ground as GroundKind, this.biome.groundColor, this.biome.groundColor2);
    gtex.map.repeat.set(18, 18);
    gtex.bump.repeat.set(18, 18);
    const mat = new THREE.MeshStandardMaterial({
      map: gtex.map,
      bumpMap: gtex.bump,
      bumpScale: 1.4,
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildWater() {
    if (this.biome.id !== 'wetland') return;
    const geo = new THREE.CircleGeometry(WORLD_RADIUS * 1.02, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2c3a2a,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = this.waterLevel;
    mesh.receiveShadow = true;
    this.add(mesh);
    this.disposables.push(geo, mat);
  }

  /* ------------------------------------------------------------------ */

  private trunkGeometry(kind: TreeKind): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const height = 1;
    const baseR = kind === 'oak' ? 0.34 : kind === 'beech' ? 0.26 : kind === 'birch' ? 0.16 : 0.24;
    const trunk = new THREE.CylinderGeometry(baseR * 0.55, baseR, height, kind === 'oak' ? 9 : 8, 7);
    trunk.translate(0, height / 2, 0);
    // organic taper and lean
    const pos = trunk.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wob = 1 + noise2(y * 4 + this.seed, x * 3 + z * 2) * 0.16;
      pos.setX(i, x * wob + y * y * (kind === 'birch' ? 0.04 : 0.02));
      pos.setZ(i, z * wob + Math.sin(y * 3) * 0.02);
    }
    parts.push(trunk);

    const addBranch = (y: number, angle: number, len: number, rad: number, tilt: number) => {
      const b = new THREE.CylinderGeometry(rad * 0.5, rad, len, 5, 2);
      b.translate(0, len / 2, 0);
      b.rotateZ(tilt);
      b.rotateY(angle);
      b.translate(0, y, 0);
      parts.push(b);
    };
    if (kind === 'oak') {
      addBranch(0.62, 0.5, 0.4, 0.09, 0.75);
      addBranch(0.7, 2.4, 0.36, 0.08, 0.8);
      addBranch(0.78, 4.2, 0.3, 0.07, 0.7);
      addBranch(0.86, 5.4, 0.26, 0.06, 0.6);
    } else if (kind === 'beech') {
      addBranch(0.6, 1.1, 0.36, 0.07, 0.6);
      addBranch(0.72, 3.4, 0.32, 0.06, 0.55);
      addBranch(0.84, 5.0, 0.24, 0.05, 0.5);
    } else if (kind === 'birch') {
      addBranch(0.55, 0.8, 0.3, 0.045, 0.7);
      addBranch(0.68, 3.6, 0.26, 0.04, 0.6);
    } else if (kind === 'pine') {
      addBranch(0.72, 1.2, 0.3, 0.07, 1.05);
      addBranch(0.84, 3.8, 0.26, 0.06, 1.0);
    } else {
      // spruce: short dead branches near the base
      addBranch(0.18, 0.4, 0.22, 0.04, 1.35);
      addBranch(0.3, 2.6, 0.2, 0.035, 1.3);
      addBranch(0.42, 4.6, 0.18, 0.03, 1.25);
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    merged.computeVertexNormals();
    return merged;
  }

  private crownGeometry(kind: TreeKind): THREE.BufferGeometry {
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const rng = new RNG(strSeed('crown:' + kind + ':' + this.seed));

    const addQuad = (cx: number, cy: number, cz: number, w: number, h: number, rot: number, tilt: number) => {
      const base = verts.length / 3;
      const hw = w / 2;
      const hh = h / 2;
      const corners: [number, number][] = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (const [x0, y0] of corners) {
        const x = x0 * cos;
        const z = x0 * sin;
        const y = y0 * Math.cos(tilt);
        const zz = z + y0 * Math.sin(tilt);
        verts.push(cx + x, cy + y, cz + zz);
      }
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    if (kind === 'spruce') {
      const layers = 11;
      for (let l = 0; l < layers; l++) {
        const t = l / layers;
        const y = lerp(0.14, 0.95, t);
        const radius = (1 - t) * 0.34 + 0.03;
        const count = l < 3 ? 4 : 7;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + l * 0.7 + rng.range(-0.2, 0.2);
          const r = radius * rng.range(0.75, 1.05);
          const w = radius * rng.range(1.6, 2.4);
          addQuad(Math.cos(a) * r, y + rng.range(-0.02, 0.02), Math.sin(a) * r, w, w * 0.72, a, rng.range(0.15, 0.5));
          addQuad(Math.cos(a + 0.5) * r * 0.9, y, Math.sin(a + 0.5) * r * 0.9, w * 0.85, w * 0.6, a + 0.5, rng.range(0.2, 0.55));
        }
      }
      // top spire
      addQuad(0, 0.99, 0, 0.06, 0.12, 0, 0.02);
      addQuad(0, 0.99, 0, 0.06, 0.12, Math.PI / 2, 0.02);
    } else if (kind === 'pine') {
      for (let i = 0; i < 15; i++) {
        const a = rng.f() * TAU;
        const r = rng.range(0.02, 0.24);
        const y = rng.range(0.78, 1.0);
        const w = rng.range(0.24, 0.4);
        addQuad(Math.cos(a) * r, y, Math.sin(a) * r, w, w * 0.55, a, rng.range(0.1, 0.4));
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        addQuad(Math.cos(a) * 0.18, 0.72, Math.sin(a) * 0.18, 0.3, 0.16, a, 0.5);
      }
    } else if (kind === 'beech') {
      for (let i = 0; i < 18; i++) {
        const a = rng.f() * TAU;
        const r = Math.sqrt(rng.f()) * 0.38;
        const y = rng.range(0.5, 0.95);
        const w = rng.range(0.32, 0.5);
        addQuad(Math.cos(a) * r, y, Math.sin(a) * r, w, w * 0.8, a, rng.range(-0.3, 0.3));
        addQuad(Math.cos(a + 1.2) * r, y, Math.sin(a + 1.2) * r, w * 0.85, w * 0.7, a + 1.2, rng.range(-0.3, 0.3));
      }
    } else if (kind === 'oak') {
      for (let i = 0; i < 20; i++) {
        const a = rng.f() * TAU;
        const r = Math.sqrt(rng.f()) * 0.46;
        const y = rng.range(0.55, 1.0);
        const w = rng.range(0.36, 0.56);
        addQuad(Math.cos(a) * r, y, Math.sin(a) * r, w, w * 0.75, a, rng.range(-0.35, 0.35));
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const a = rng.f() * TAU;
        const r = Math.sqrt(rng.f()) * 0.28;
        const y = rng.range(0.5, 0.95);
        const w = rng.range(0.26, 0.4);
        addQuad(Math.cos(a) * r, y, Math.sin(a) * r, w, w * 0.8, a, rng.range(-0.25, 0.25));
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  private buildTrees() {
    const mix = this.biome.trees;
    const kinds: TreeKind[] = ['spruce', 'beech', 'oak', 'pine', 'birch'];
    const rng = new RNG(this.seed * 7 + 13);
    const target = Math.round(430 * this.biome.treeDensity * (this.quality === 'low' ? 0.65 : this.quality === 'high' ? 1 : 0.84));
    const placements: Record<string, { x: number; z: number; s: number; rot: number; h: number }[]> = {
      spruce: [],
      beech: [],
      oak: [],
      pine: [],
      birch: [],
    };

    let tries = 0;
    let placed = 0;
    while (placed < target && tries < target * 12) {
      tries++;
      const r = Math.sqrt(rng.f()) * (WORLD_RADIUS - 6);
      const a = rng.f() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x - this.pathX(z)) < 3.2) continue;
      if (Math.hypot(x - this.cabinPos.x, z - this.cabinPos.z) < 11) continue;
      const slope = this.slopeAt(x, z);
      if (slope > 1.5) continue;
      // avoid clumping too hard
      let crowd = 0;
      for (const k of kinds) {
        for (const p of placements[k]) {
          if (Math.hypot(p.x - x, p.z - z) < 1.6) crowd++;
        }
      }
      if (crowd > 1) continue;
      const roll = rng.f();
      let acc = 0;
      let kind: TreeKind = 'spruce';
      for (const k of kinds) {
        acc += mix[k];
        if (roll <= acc) {
          kind = k;
          break;
        }
      }
      const scale = kind === 'spruce' ? rng.range(0.85, 1.25) : kind === 'birch' ? rng.range(0.75, 1.05) : rng.range(0.85, 1.2);
      const heightM = (kind === 'spruce' ? rng.range(18, 30) : kind === 'pine' ? rng.range(16, 26) : kind === 'birch' ? rng.range(12, 20) : rng.range(16, 26)) * scale;
      placements[kind].push({ x, z, s: heightM, rot: rng.f() * TAU, h: heightM });
      this.hosts.push({
        kind,
        pos: new THREE.Vector3(x, this.heightAt(x, z), z),
        radius: (kind === 'oak' ? 0.34 : kind === 'beech' ? 0.26 : kind === 'birch' ? 0.16 : 0.24) * (kind === 'oak' ? 1.1 : 1) * heightM * 0.09,
        height: heightM,
      });
      this.colliders.push({
        x,
        z,
        r: (kind === 'oak' ? 0.45 : kind === 'beech' ? 0.38 : kind === 'birch' ? 0.22 : 0.34) * Math.max(0.9, heightM / 22),
      });
      placed++;
    }

    const dummy = new THREE.Object3D();
    for (const kind of kinds) {
      const list = placements[kind];
      if (!list.length) continue;
      const trunkGeo = this.trunkGeometry(kind);
      const bark = barkTextures(kind);
      const trunkTex = bark.map.clone();
      trunkTex.needsUpdate = true;
      trunkTex.repeat.set(kind === 'oak' ? 1.4 : 1.6, kind === 'oak' ? 2.6 : 3.6);
      const bumpTex = bark.bump.clone();
      bumpTex.needsUpdate = true;
      bumpTex.repeat.copy(trunkTex.repeat);
      const trunkMat = new THREE.MeshStandardMaterial({
        map: trunkTex,
        bumpMap: bumpTex,
        bumpScale: 1.2,
        roughness: 0.95,
        metalness: 0,
        color: kind === 'birch' ? 0xffffff : 0xcfc9bc,
      });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      trunks.castShadow = this.quality !== 'low';
      trunks.receiveShadow = true;
      trunks.name = 'trunks-' + kind;

      const crownGeo = this.crownGeometry(kind);
      const crownTex = foliageTexture(kind);
      const crownMat = new THREE.MeshStandardMaterial({
        map: crownTex,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0,
        color: 0xffffff,
      });
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
      crowns.castShadow = this.quality === 'high';
      crowns.receiveShadow = false;
      crowns.name = 'crowns-' + kind;
      if (this.quality === 'high') {
        const depthMat = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          map: crownTex,
          alphaTest: 0.45,
        });
        crowns.customDepthMaterial = depthMat;
      }

      list.forEach((p, i) => {
        const y = this.heightAt(p.x, p.z) - 0.15;
        dummy.position.set(p.x, y, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.s * 0.13, p.s, p.s * 0.13);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        dummy.position.set(p.x, y, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.s * 0.62, p.s, p.s * 0.62);
        dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      this.add(trunks);
      this.add(crowns);
      this.disposables.push(trunkGeo, trunkMat, trunkTex, bumpTex, crownGeo, crownMat);
    }
  }

  private buildUnderstory() {
    const rng = new RNG(this.seed * 31 + 5);
    const type = (this.biome.understory === 'leaf' ? 'grass' : this.biome.understory) as 'fern' | 'grass' | 'sedge' | 'heather' | 'moss';
    const tex = understoryTexture(type);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0,
      color: 0xd8d8cc,
    });
    // crossed quads
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const addBlade = (w: number, h: number) => {
      for (const rot of [0, Math.PI / 2, Math.PI / 4]) {
        const base = verts.length / 3;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const hw = w / 2;
        verts.push(-hw * c, 0, -hw * s, hw * c, 0, hw * s, hw * c, h, hw * s, -hw * c, h, -hw * s);
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    addBlade(1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const density = type === 'moss' ? 2600 : 3200;
    const count = Math.round(density * (this.quality === 'low' ? 0.5 : this.quality === 'high' ? 1 : 0.75));
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const scaleRange: Record<string, [number, number]> = {
      fern: [0.7, 1.6],
      grass: [0.35, 0.85],
      sedge: [0.7, 1.5],
      heather: [0.35, 0.8],
      moss: [0.16, 0.4],
    };
    const [smin, smax] = scaleRange[type] || [0.4, 1];
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 5) {
      tries++;
      const r = Math.sqrt(rng.f()) * (WORLD_RADIUS - 3);
      const a = rng.f() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x - this.pathX(z)) < 1.5) continue;
      if (Math.hypot(x - this.cabinPos.x, z - this.cabinPos.z) < 5) continue;
      const y = this.heightAt(x, z);
      if (this.waterLevel > -900 && y < this.waterLevel + 0.02) continue;
      const s = rng.range(smin, smax);
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set(0, rng.f() * TAU, 0);
      dummy.scale.set(s * rng.range(0.8, 1.4), s, s * rng.range(0.8, 1.4));
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
      if (rng.chance(0.05) && this.biome.understory !== 'moss') {
        this.openSites.push({ pos: new THREE.Vector3(x, y, z), substrate: 'grass' });
      }
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    inst.name = 'understory';
    this.add(inst);
    this.disposables.push(geo, mat);
  }

  private buildRocksAndLogs() {
    const rng = new RNG(this.seed * 17 + 91);
    const rockTex = rockTexture();
    const rockMat = new THREE.MeshStandardMaterial({
      map: rockTex.map,
      bumpMap: rockTex.bump,
      bumpScale: 1.6,
      roughness: 0.95,
      color: 0xa8a89e,
    });
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    // deform
    const rp = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i);
      const y = rp.getY(i);
      const z = rp.getZ(i);
      const n = 1 + noise2(x * 2.2 + 4, z * 2.2 + y) * 0.32;
      rp.setXYZ(i, x * n, y * n * 0.7, z * n);
    }
    rockGeo.computeVertexNormals();
    const rockCount = this.biome.id === 'mountain' ? 70 : 34;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const dummy = new THREE.Object3D();
    let rn = 0;
    for (let i = 0; i < rockCount * 3 && rn < rockCount; i++) {
      const r = Math.sqrt(rng.f()) * (WORLD_RADIUS - 8);
      const a = rng.f() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x - this.pathX(z)) < 2.4) continue;
      if (Math.hypot(x - this.cabinPos.x, z - this.cabinPos.z) < 10) continue;
      const s = rng.range(0.25, this.biome.id === 'mountain' ? 2.6 : 1.1);
      dummy.position.set(x, this.heightAt(x, z) - s * 0.28, z);
      dummy.rotation.set(rng.range(-0.4, 0.4), rng.f() * TAU, rng.range(-0.4, 0.4));
      dummy.scale.set(s * rng.range(0.8, 1.4), s, s * rng.range(0.8, 1.4));
      dummy.updateMatrix();
      rocks.setMatrixAt(rn++, dummy.matrix);
      if (s > 0.5) this.colliders.push({ x, z, r: s * 0.8 });
    }
    rocks.count = rn;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.add(rocks);
    this.disposables.push(rockGeo, rockMat);

    // fallen logs
    const logMat = new THREE.MeshStandardMaterial({
      map: barkTextures('spruce').map,
      bumpMap: barkTextures('spruce').bump,
      bumpScale: 1.4,
      roughness: 0.96,
      color: 0x8a7a62,
    });
    const logGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 3);
    logGeo.rotateZ(Math.PI / 2);
    const logCount = this.biome.id === 'wetland' ? 26 : 18;
    const logs = new THREE.InstancedMesh(logGeo, logMat, logCount);
    const mossMat = new THREE.MeshStandardMaterial({
      map: understoryTexture('moss'),
      alphaTest: 0.3,
      roughness: 1,
      color: 0x7a8a52,
      side: THREE.DoubleSide,
    });
    const mossGeo = new THREE.PlaneGeometry(1, 1);
    const mosses = new THREE.InstancedMesh(mossGeo, mossMat, logCount * 3);
    let ln = 0;
    let mn = 0;
    for (let i = 0; i < logCount * 4 && ln < logCount; i++) {
      const r = Math.sqrt(rng.f()) * (WORLD_RADIUS - 12);
      const a = rng.f() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x - this.pathX(z)) < 3) continue;
      if (Math.hypot(x - this.cabinPos.x, z - this.cabinPos.z) < 12) continue;
      if (this.slopeAt(x, z) > 0.9) continue;
      const len = rng.range(3, 9);
      const rad = rng.range(0.16, 0.42);
      const dir = new THREE.Vector3(Math.cos(rng.f() * TAU), 0, Math.sin(rng.f() * TAU)).normalize();
      const y = this.heightAt(x, z);
      dummy.position.set(x, y + rad * 0.75, z);
      dummy.rotation.set(0, Math.atan2(dir.z, dir.x), rng.range(-0.05, 0.05));
      dummy.scale.set(len, rad, rad);
      dummy.updateMatrix();
      logs.setMatrixAt(ln++, dummy.matrix);
      this.logs.push({
        pos: new THREE.Vector3(x, y, z),
        dir,
        length: len,
        radius: rad,
      });
      // two collision circles along the log
      for (const t of [-0.28, 0.28]) {
        this.colliders.push({ x: x + dir.x * len * t, z: z + dir.z * len * t, r: rad + 0.2 });
      }
      // moss patches on the top
      for (let m = 0; m < 3; m++) {
        const t = rng.range(-0.4, 0.4);
        dummy.position.set(x + dir.x * len * t, y + rad * 1.35, z + dir.z * len * t);
        dummy.rotation.set(-Math.PI / 2, rng.f() * TAU, 0);
        dummy.scale.set(rng.range(0.6, 1.4), rng.range(0.5, 1.1), 1);
        dummy.updateMatrix();
        mosses.setMatrixAt(mn++, dummy.matrix);
      }
      this.openSites.push({ pos: new THREE.Vector3(x + dir.x * len * 0.5, y, z + dir.z * len * 0.5), substrate: 'litter' });
    }
    logs.count = ln;
    mosses.count = mn;
    logs.castShadow = true;
    logs.receiveShadow = true;
    this.add(logs);
    this.add(mosses);
    this.disposables.push(logGeo, logMat, mossGeo, mossMat);

    // stumps
    const stumpGeo = new THREE.CylinderGeometry(1, 1.15, 1, 10, 2);
    stumpGeo.translate(0, 0.5, 0);
    const stumps = new THREE.InstancedMesh(stumpGeo, logMat, 16);
    for (let i = 0; i < 16; i++) {
      const r = Math.sqrt(rng.f()) * (WORLD_RADIUS - 12);
      const a = rng.f() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x - this.pathX(z)) < 3) continue;
      const rad = rng.range(0.28, 0.6);
      const h = rng.range(0.3, 1.1);
      dummy.position.set(x, this.heightAt(x, z) - 0.05, z);
      dummy.rotation.set(0, rng.f() * TAU, 0);
      dummy.scale.set(rad, h, rad);
      dummy.updateMatrix();
      stumps.setMatrixAt(i, dummy.matrix);
      this.stumps.push({ pos: new THREE.Vector3(x, this.heightAt(x, z), z), radius: rad, height: h });
      this.colliders.push({ x, z, r: rad + 0.15 });
    }
    stumps.castShadow = true;
    stumps.receiveShadow = true;
    this.add(stumps);
    this.disposables.push(stumpGeo);
  }

  private buildCabin() {
    const wood = new THREE.MeshStandardMaterial({
      color: 0x6b5236,
      roughness: 0.92,
      map: barkTextures('spruce').map,
      bumpMap: barkTextures('spruce').bump,
      bumpScale: 1.2,
    });
    const roof = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.85 });
    const group = new THREE.Group();
    const baseY = this.heightAt(this.cabinPos.x, this.cabinPos.z);
    group.position.set(this.cabinPos.x, baseY, this.cabinPos.z);
    group.rotation.y = 0.18;

    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.4), wood);
    body.position.y = 1.2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.5, 4), roof);
    roofMesh.position.y = 3.15;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.scale.set(1, 1, 0.82);
    roofMesh.castShadow = true;
    group.add(roofMesh);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 0.9 }));
    door.position.set(0, 0.95, 1.72);
    group.add(door);
    const window1 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2a2c22, roughness: 0.3, emissive: 0x1a1a12, emissiveIntensity: 0.4 })
    );
    window1.position.set(1.5, 1.5, 1.71);
    group.add(window1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.6), wood);
    step.position.set(0, 0.08, 2.1);
    group.add(step);

    // woodpile and chopping block
    for (let i = 0; i < 10; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.9, 7), wood);
      log.rotation.z = Math.PI / 2;
      log.position.set(-3.2 + (i % 5) * 0.24, 0.12 + Math.floor(i / 5) * 0.22, 0.4);
      log.castShadow = true;
      group.add(log);
    }
    this.colliders.push({ x: this.cabinPos.x, z: this.cabinPos.z, r: 2.6 });
    this.cabinPos.y = baseY;
    this.add(group);
    this.disposables.push(wood, roof);
  }

  private buildLeafFall() {
    const count = this.quality === 'low' ? 100 : 260;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rng = new RNG(this.seed * 3 + 1);
    this.leafVel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-30, 30);
      pos[i * 3 + 1] = rng.range(1, 20);
      pos[i * 3 + 2] = rng.range(-30, 30);
      this.leafVel[i * 3] = rng.range(-0.15, 0.15);
      this.leafVel[i * 3 + 1] = rng.range(-0.5, -0.15);
      this.leafVel[i * 3 + 2] = rng.range(-0.15, 0.15);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.12,
      map: (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#8a6a34';
        ctx.beginPath();
        ctx.ellipse(16, 16, 12, 5, 0.4, 0, TAU);
        ctx.fill();
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })(),
      transparent: true,
      alphaTest: 0.4,
      opacity: 0.9,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.leafPoints = pts;
    this.group.add(pts);
    this.disposables.push(geo, mat);
  }

  /* ------------------------------------------------------------------ */

  randomPoint(rng: RNG, minR = 0, maxR = WORLD_RADIUS - 8): THREE.Vector3 {
    const r = Math.sqrt(lerp((minR / maxR) ** 2, 1, rng.f())) * maxR;
    const a = rng.f() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return new THREE.Vector3(x, this.heightAt(x, z), z);
  }

  isPath(x: number, z: number, w = 2.2) {
    return Math.abs(x - this.pathX(z)) < w;
  }

  isWater(x: number, z: number) {
    if (this.waterLevel < -900) return false;
    return this.heightAt(x, z) < this.waterLevel + 0.01;
  }

  nearestHosts(kind: TreeKind, maxDist = 7): HostTree[] {
    return this.hosts.filter((h) => h.kind === kind);
  }

  groundNormal(x: number, z: number): THREE.Vector3 {
    const e = 0.35;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
  }

  update(dt: number, cameraPos: THREE.Vector3, wind: number) {
    if (this.leafPoints) {
      const attr = this.leafPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i++) {
        arr[i * 3] += (this.leafVel[i * 3] + Math.sin(performance.now() * 0.0004 + i) * 0.2) * dt * (0.6 + wind);
        arr[i * 3 + 1] += this.leafVel[i * 3 + 1] * dt * (0.7 + wind * 0.8);
        arr[i * 3 + 2] += (this.leafVel[i * 3 + 2] + Math.cos(performance.now() * 0.0003 + i) * 0.2) * dt * (0.6 + wind);
        if (arr[i * 3 + 1] < 0.1) {
          arr[i * 3] = cameraPos.x + (Math.random() - 0.5) * 34;
          arr[i * 3 + 1] = cameraPos.y + 12 + Math.random() * 8;
          arr[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 34;
        }
        if (Math.abs(arr[i * 3] - cameraPos.x) > 26) arr[i * 3] = cameraPos.x + (Math.random() - 0.5) * 20;
        if (Math.abs(arr[i * 3 + 2] - cameraPos.z) > 26) arr[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 20;
      }
      attr.needsUpdate = true;
    }
    // move leaf field with camera so it never runs out
    if (this.leafPoints) {
      this.leafPoints.position.set(0, 0, 0);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.meshes) {
      m.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    this.meshes.length = 0;
    this.colliders.length = 0;
    this.hosts.length = 0;
    this.logs.length = 0;
    this.stumps.length = 0;
    this.openSites.length = 0;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    void shadowTexture;
  }
}
