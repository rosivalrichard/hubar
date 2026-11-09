/* Procedural mushroom geometry. Each specimen is one merged mesh with one atlas material. */

import * as THREE from 'three';
import { RNG, TAU, clamp, lerp, hash2, hash3, strSeed, noise2, fbm2, smoothstep } from '../core/util';
import type { Species } from '../data/species-types';
import { mushroomAtlas, UV_TILE, DETAIL_SCALE } from './textures';
import { NO_SHAPE, type ShapeMods } from '../game/specimens';

/** Shape modifiers of the specimen currently being built (set by buildMushroomGeometry). */
let SHAPE: ShapeMods = NO_SHAPE;

export type GrowthStage = 'young' | 'mature' | 'old' | 'damaged';

interface Geo {
  pos: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

const newGeo = (): Geo => ({ pos: [], uv: [], col: [], idx: [] });

function vert(g: Geo, x: number, y: number, z: number, u: number, v: number, c: THREE.Color) {
  g.pos.push(x, y, z);
  g.uv.push(u, v);
  g.col.push(c.r, c.g, c.b);
  return g.pos.length / 3 - 1;
}

function mergeInto(dst: Geo, src: Geo, m?: THREE.Matrix4) {
  const base = dst.pos.length / 3;
  if (m) {
    const v = new THREE.Vector3();
    for (let i = 0; i < src.pos.length; i += 3) {
      v.set(src.pos[i], src.pos[i + 1], src.pos[i + 2]).applyMatrix4(m);
      dst.pos.push(v.x, v.y, v.z);
    }
  } else {
    for (let i = 0; i < src.pos.length; i++) dst.pos.push(src.pos[i]);
  }
  for (let i = 0; i < src.uv.length; i++) dst.uv.push(src.uv[i]);
  for (let i = 0; i < src.col.length; i++) dst.col.push(src.col[i]);
  for (let i = 0; i < src.idx.length; i++) dst.idx.push(src.idx[i] + base);
}

function tileUV(tile: [number, number], u: number, v: number): [number, number] {
  return [tile[0] + clamp(u, 0, 1) * 0.5, tile[1] + clamp(v, 0, 1) * 0.5];
}

/* ---------------- cap profiles ---------------- */

type Pt = [number, number];

const PROFILES: Record<string, Pt[]> = {
  convex: [[0, 1], [0.16, 0.985], [0.32, 0.95], [0.48, 0.89], [0.63, 0.79], [0.76, 0.66], [0.87, 0.5], [0.94, 0.33], [0.985, 0.16], [1, 0.03]],
  cushion: [[0, 1], [0.2, 0.99], [0.4, 0.96], [0.57, 0.9], [0.72, 0.8], [0.84, 0.66], [0.93, 0.48], [0.98, 0.26], [1, 0.04]],
  flat: [[0, 1], [0.25, 0.94], [0.5, 0.87], [0.72, 0.83], [0.88, 0.79], [1, 0.75]],
  depressed: [[0, 0.74], [0.16, 0.85], [0.34, 0.94], [0.52, 0.97], [0.7, 0.93], [0.85, 0.84], [0.95, 0.71], [1, 0.56]],
  funnel: [[0.16, 0.5], [0.28, 0.7], [0.42, 0.86], [0.58, 0.95], [0.74, 0.96], [0.88, 0.88], [1, 0.68]],
  conical: [[0, 1], [0.12, 0.86], [0.25, 0.67], [0.38, 0.47], [0.52, 0.29], [0.68, 0.14], [0.84, 0.04], [1, 0]],
  bell: [[0, 1], [0.1, 0.98], [0.22, 0.9], [0.34, 0.74], [0.46, 0.54], [0.58, 0.35], [0.7, 0.21], [0.84, 0.1], [1, 0.05]],
  parasol: [[0, 1], [0.16, 0.985], [0.32, 0.94], [0.48, 0.87], [0.64, 0.79], [0.78, 0.7], [0.9, 0.6], [1, 0.53]],
  lobed: [[0, 0.98], [0.2, 0.97], [0.38, 0.92], [0.54, 0.84], [0.68, 0.74], [0.82, 0.61], [0.92, 0.45], [1, 0.28]],
  cylindrical: [[0, 0.82], [0.3, 0.95], [0.55, 1], [0.75, 0.97], [0.9, 0.86], [1, 0.66]],
  shelf: [[0, 1], [0.22, 0.97], [0.44, 0.92], [0.64, 0.86], [0.82, 0.8], [1, 0.73]],
  coral: [[0, 1]],
};

const STAGE: Record<GrowthStage, { capR: number; capH: number; stem: number; stemW: number; tint: number }> = {
  young: { capR: 0.7, capH: 1.16, stem: 0.55, stemW: 0.92, tint: 1.06 },
  mature: { capR: 1, capH: 1, stem: 1, stemW: 1, tint: 1 },
  old: { capR: 1.12, capH: 0.82, stem: 1.08, stemW: 0.94, tint: 0.88 },
  damaged: { capR: 1.02, capH: 0.97, stem: 1, stemW: 1, tint: 0.93 },
};

function capColorAt(sp: Species, c: THREE.Color, angle: number, r01: number, variant: number, tint: number) {
  const n = fbm2(Math.cos(angle) * 2.4 + variant * 7, Math.sin(angle) * 2.4 + r01 * 3 + variant * 3, 3);
  let m = 1 + n * 0.05 * (0.4 + r01);
  // rim is often paler
  m *= 1 + smoothstep(0.82, 1, r01) * 0.1;
  c.multiplyScalar(tint * m);
}

function densifyProfile(p: Pt[], sub: number): Pt[] {
  if (p.length < 3) return p;
  const out: Pt[] = [];
  const at = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

function buildCap(
  g: Geo,
  sp: Species,
  stage: GrowthStage,
  variant: number,
  rng: RNG,
  damage?: { a0: number; a1: number }
) {
  const vis = sp.visual;
  const st = STAGE[stage];
  const R = (lerp(vis.capDiameter[0], vis.capDiameter[1], 0.62) / 2) * 0.0115 * st.capR * SHAPE.capMul;
  const H = R * vis.capRatio * st.capH * (SHAPE.capMul > 1.2 ? 0.85 : 1);
  const irregular = SHAPE.symmetric ? 0 : 1;
  const base = new THREE.Color(vis.capColor);
  const edge = new THREE.Color(vis.capEdge);
  const col = new THREE.Color();
  const prof = PROFILES[vis.capShape] || PROFILES.convex;
  const radial = 64;
  const marginWave = (vis.margin === 'wavy' || vis.margin === 'scalloped' ? 0.055 : 0.02) * (SHAPE.symmetric ? 0.15 : 1);
  const striate = vis.margin === 'striate';
  const seedA = variant * 13.7 + 2.1;

  // extra margin curls
  const pts: Pt[] = prof.map((p) => [p[0], p[1]]);
  if (stage === 'young') {
    const last = pts[pts.length - 1];
    pts.push([last[0] * 1.0, last[1] - 0.12], [last[0] * 0.94, last[1] - 0.22]);
  } else if (stage === 'old') {
    const last = pts[pts.length - 1];
    pts.push([last[0] * 1.03, last[1] + 0.07], [last[0] * 0.97, last[1] + 0.13]);
  }

  // The hand-written profiles have ~10 points; with so few rings the smooth-shaded cap shows terraced
  // "contour line" bands. Densify with Catmull-Rom so light falls off smoothly.
  const dense = densifyProfile(pts, 4);
  pts.length = 0;
  pts.push(...dense);
  const rings = pts.length;
  const capStartIdx = g.pos.length / 3;
  const damageCut = (a: number) => {
    if (!damage) return false;
    let t = ((a % TAU) + TAU) % TAU;
    return t > damage.a0 && t < damage.a1;
  };

  for (let i = 0; i < rings; i++) {
    const [pr, py] = pts[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      let rr = pr;
      // organic irregularity
      rr *= 1 + noise2(Math.cos(a) * 2.2 + seedA, Math.sin(a) * 2.2 + seedA) * 0.035 * irregular;
      rr *= 1 + Math.sin(a * 5 + seedA) * marginWave * smoothstep(0.6, 1, pr);
      const y = py * H + noise2(Math.cos(a) * 3 + seedA, pr * 4) * H * 0.035 * irregular;
      if (i === 0 && pr > 0) {
        // apex handled by center fan
      }
      const x = Math.cos(a) * rr * R;
      const z = Math.sin(a) * rr * R;
      const u = 0.5 + Math.cos(a) * pr * 0.5;
      const v = 0.5 + Math.sin(a) * pr * 0.5;
      const [uu, vv] = tileUV(UV_TILE.cap, u * 0.94 + 0.03, v * 0.94 + 0.03);
      if (pr < 0.03) {
        col.copy(base).multiplyScalar(st.tint);
        capColorAt(sp, col, a, 0, variant, 1);
      } else {
        col.copy(base).lerp(edge, smoothstep(0.85, 1, pr) * 0.55);
        capColorAt(sp, col, a, pr, variant, st.tint);
        if (striate) {
          const s = 0.5 + 0.5 * Math.sin(a * 40 + seedA);
          col.multiplyScalar(0.94 + s * 0.1 * smoothstep(0.75, 1, pr));
        }
      }
      if (vis.capShape === 'lobed') {
        col.multiplyScalar(0.92 + 0.12 * noise2(a * 2, pr * 3));
      }
      vert(g, x, y, z, uu, vv, col);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      if (damageCut(a)) continue;
      const a0 = capStartIdx + i * (radial + 1) + j;
      const b0 = a0 + 1;
      const c0 = a0 + radial + 1;
      const d0 = c0 + 1;
      // skip the apex ring degenerate triangles
      if (i > 0 || pts[0][0] > 0) {
        g.idx.push(a0, c0, b0);
      }
      g.idx.push(b0, c0, d0);
    }
  }

  // underside
  const under = new THREE.Color(vis.hymenColor).multiplyScalar(stage === 'old' ? 0.9 : 0.96);
  const rimY = pts[pts.length - 1][1] * H;
  const stemR = (vis.stemWidth[1] / 2) * 0.0115 * st.stemW * SHAPE.stemWMul;
  const holeR = Math.min(stemR * 0.9, R * 0.4);
  const um = 8;
  const underStart = g.pos.length / 3;
  const isFunnel = sp.form === 'funnel';
  for (let i = 0; i <= um; i++) {
    const t = i / um;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      if (isFunnel) {
        // outer wall of the trumpet
        const rr = lerp(1, Math.min(0.3, holeR / (R || 1)), t);
        const yy = lerp(rimY, H * 0.55 + R * 0.15, t);
        const x = Math.cos(a) * rr * R;
        const z = Math.sin(a) * rr * R;
        const [uu, vv] = tileUV(UV_TILE.gills, 0.5 + Math.cos(a) * rr * 0.5, 0.5 + Math.sin(a) * rr * 0.5);
        col.copy(under).multiplyScalar(0.95 + 0.05 * noise2(a * 4, t * 3));
        vert(g, x, yy, z, uu, vv, col);
      } else {
        const rr = lerp(1, Math.max(0.06, holeR / Math.max(R, 0.001)), t);
        const droop = vis.gillType === 'pores' ? 0.08 : 0.16;
        let yy = lerp(rimY, rimY + H * droop + (stage === 'old' ? H * 0.04 : 0), t);
        if (sp.form === 'bolete') {
          // 1–2 cm deep tube layer: a spongy cushion bulging below the margin, depressed around the stem
          yy = rimY - R * 0.12 * Math.sin(Math.PI * t * 0.92) + smoothstep(0.65, 1, t) * H * 0.14;
        }
        const x = Math.cos(a) * rr * R;
        const z = Math.sin(a) * rr * R;
        const [uu, vv] = tileUV(UV_TILE.gills, 0.5 + Math.cos(a) * rr * 0.5, 0.5 + Math.sin(a) * rr * 0.5);
        col.copy(under);
        col.multiplyScalar(0.88 + 0.12 * noise2(a * 3.5, t * 4));
        vert(g, x, yy, z, uu, vv, col);
      }
    }
  }
  for (let i = 0; i < um; i++) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      if (damageCut(a)) continue;
      const a0 = underStart + i * (radial + 1) + j;
      const b0 = a0 + 1;
      const c0 = a0 + radial + 1;
      const d0 = c0 + 1;
      // underside faces down: reverse winding
      g.idx.push(a0, b0, c0);
      g.idx.push(b0, d0, c0);
    }
  }

  // rim band connecting top and underside
  const rimStart = g.pos.length / 3;
  const edgeCol = new THREE.Color(vis.capEdge);
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * TAU;
    let rr = 1;
    rr *= 1 + noise2(Math.cos(a) * 2.2 + seedA, Math.sin(a) * 2.2 + seedA) * 0.035 * irregular;
    rr *= 1 + Math.sin(a * 5 + seedA) * marginWave;
    const x = Math.cos(a) * rr * R;
    const z = Math.sin(a) * rr * R;
    const [u1, v1] = tileUV(UV_TILE.cap, 0.5 + Math.cos(a) * 0.47, 0.5 + Math.sin(a) * 0.47);
    vert(g, x, rimY, z, u1, v1, edgeCol);
    const [u2, v2] = tileUV(UV_TILE.gills, 0.5 + Math.cos(a) * 0.47, 0.5 + Math.sin(a) * 0.47);
    vert(g, x, rimY - R * 0.035, z, u2, v2, edgeCol);
  }
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * TAU;
    if (damageCut(a)) continue;
    const a0 = rimStart + j * 2;
    const b0 = a0 + 1;
    const c0 = a0 + 2;
    const d0 = a0 + 3;
    g.idx.push(a0, b0, c0);
    g.idx.push(b0, d0, c0);
  }

  // actual gill blades, visible when inspecting underneath
  if (vis.gillType === 'gills' && sp.form !== 'funnel') {
    const nG = 84;
    const inner = holeR;
    const outer = R * 0.9;
    const yTop = rimY + H * 0.13;
    const yBot = rimY - R * 0.05 - (stage === 'old' ? R * 0.02 : 0);
    const blade = new THREE.Color(vis.hymenColor).multiplyScalar(0.94);
    for (let i = 0; i < nG; i++) {
      const a = (i / nG) * TAU;
      if (damageCut(a)) continue;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const i0 = vert(g, ca * inner, yTop, sa * inner, 0.5, 0.5, blade);
      const i1 = vert(g, ca * outer, yTop + H * 0.02, sa * outer, 0.5, 0.5, blade);
      const i2 = vert(g, ca * outer, yBot, sa * outer, 0.5, 0.5, blade);
      const i3 = vert(g, ca * inner, yBot + H * 0.02, sa * inner, 0.5, 0.5, blade);
      g.idx.push(i0, i1, i2, i0, i2, i3);
    }
  }

  // hanging marginal flap / veil remnant
  if (vis.margin === 'appendiculate') {
    const flapStart = g.pos.length / 3;
    const nf = 40;
    for (let i = 0; i <= nf; i++) {
      const a = (i / nf) * TAU;
      const rr = R * (0.99 + Math.sin(a * 7) * 0.02);
      const len = R * (0.1 + 0.04 * Math.sin(a * 5));
      const c = new THREE.Color(vis.capEdge);
      const [u1, v1] = tileUV(UV_TILE.extra, i / nf, 0.4);
      vert(g, Math.cos(a) * rr, rimY, Math.sin(a) * rr, u1, v1, c);
      const [u2, v2] = tileUV(UV_TILE.extra, i / nf, 0.7);
      vert(g, Math.cos(a) * rr * 0.97, rimY - len, Math.sin(a) * rr * 0.97, u2, v2, c.clone().multiplyScalar(0.9));
    }
    for (let i = 0; i < nf; i++) {
      const a0 = flapStart + i * 2;
      g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }

  return { R, H, rimY, stemR, holeR };
}

/* ---------------- stem ---------------- */

function stemRadius(t: number, type: string) {
  // t: 0 base .. 1 apex
  switch (type) {
    case 'barrel':
      // king boletes: stout, bulging in the lower half, rounded base, narrower apex
      return 0.86 + 0.62 * Math.exp(-Math.pow((t - 0.3) / 0.32, 2)) - 0.1 * t - 0.12 * Math.pow(1 - t, 6);
    case 'club':
      return 1.55 - 0.55 * smoothstep(0, 0.7, t) - 0.08 * t;
    case 'bulb':
      return 1.9 - 0.9 * smoothstep(0, 0.28, t) - 0.14 * t;
    case 'rooting':
      return 0.8 + 0.3 * smoothstep(0, 0.4, t) + 0.05 * t;
    case 'tapered':
      return 0.68 + 0.42 * smoothstep(0, 0.8, t);
    default:
      return 1.02 - 0.04 * t;
  }
}

function buildStem(g: Geo, sp: Species, stage: GrowthStage, rng: RNG, capBottom: number, R: number) {
  const vis = sp.visual;
  const st = STAGE[stage];
  const kingBolete = sp.form === 'bolete' && vis.stemBase === 'club' && /^(Boletus|Tylopilus) /.test(sp.sci);
  // King boletes have a massive stem (up to 7–10 cm, base up to 12 cm) and, when young, a barrel stem
  // nearly as wide as the small "bun" cap. Same 1.15 scale as the cap so proportions stay true.
  const boleteYoung = kingBolete && stage === 'young';
  const h = (lerp(vis.stemHeight[0], vis.stemHeight[1], kingBolete ? 0.45 : 0.55) / 100) * st.stem * SHAPE.stemHMul * (boleteYoung ? 1.45 : 1);
  const w =
    (lerp(vis.stemWidth[0], vis.stemWidth[1], kingBolete ? 0.92 : 0.6) / 100) * (kingBolete ? 1.15 : 1) * st.stemW * SHAPE.stemWMul * (boleteYoung ? 1.3 : 1);
  const profile = kingBolete ? 'barrel' : vis.stemBase;
  const rings = 14;
  const radial = 26;
  const base = new THREE.Color(vis.stemColor);
  const dark = new THREE.Color(vis.stemColor2);
  const seed = strSeed(sp.id);
  const start = g.pos.length / 3;

  const lean = SHAPE.symmetric ? 0 : rng.range(-0.07, 0.07) * h; // gentle bow proportional to stem length
  const leanDir = rng.f() * TAU;

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rr = (w / 2) * stemRadius(t, profile) * (1 + noise2(t * 4 + seed, t * 9) * 0.05);
    const y = t * h;
    const bend = Math.sin(t * Math.PI) * lean;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const x = Math.cos(a) * rr + Math.cos(leanDir) * bend;
      const z = Math.sin(a) * rr + Math.sin(leanDir) * bend;
      const col = base.clone().lerp(dark, smoothstep(0.55, 0, t) * 0.35);
      col.multiplyScalar(0.94 + 0.1 * noise2(a * 3, t * 6));
      const [uu, vv] = tileUV(UV_TILE.stem, j / radial, t);
      vert(g, x, y + (vis.stemBase === 'rooting' ? -0.01 : 0), z, uu, vv, col);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = start + i * (radial + 1) + j;
      const b0 = a0 + 1;
      const c0 = a0 + radial + 1;
      const d0 = c0 + 1;
      g.idx.push(a0, c0, b0, b0, c0, d0);
    }
  }
  // cap the stem top
  const topY = h;
  const topC = base.clone().lerp(new THREE.Color(vis.fleshColor), 0.4);
  const centerTop = vert(g, 0, topY, 0, 0.5, 1, topC);
  const topStart = g.pos.length / 3;
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * TAU;
    const rr = (w / 2) * stemRadius(1, profile);
    vert(g, Math.cos(a) * rr, topY, Math.sin(a) * rr, 0.5, 1, topC);
  }
  for (let j = 0; j < radial; j++) {
    g.idx.push(centerTop, topStart + j + 1, topStart + j);
  }
  // underside of stem base (rounded off)
  const baseC = dark.clone().multiplyScalar(0.7);
  const centerBase = vert(g, 0, -0.008, 0, 0.5, 0.1, baseC);
  const bStart = g.pos.length / 3;
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * TAU;
    const rr = (w / 2) * stemRadius(0, profile);
    vert(g, Math.cos(a) * rr, -0.006, Math.sin(a) * rr, 0.5, 0.1, baseC);
  }
  for (let j = 0; j < radial; j++) {
    g.idx.push(centerBase, bStart + j, bStart + j + 1);
  }
  return { h, w, topY };
}

function buildRing(g: Geo, sp: Species, stage: GrowthStage, stemH: number, stemW: number, rng: RNG) {
  const vis = sp.visual;
  if (vis.ring === 'none') return;
  const st = STAGE[stage];
  const y = stemH * (vis.ring === 'double' ? 0.82 : 0.72);
  const outer = stemW * (vis.ring === 'double' ? 1.9 : 1.55) * (stage === 'old' ? 1.15 : 1);
  const droop = stemH * (vis.ring === 'double' ? 0.16 : 0.1);
  const radial = 30;
  const start = g.pos.length / 3;
  const c1 = new THREE.Color(vis.fleshColor);
  const c2 = new THREE.Color(vis.stemColor);
  if (vis.ring === 'zone') {
    const band = g.pos.length / 3;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const rr = stemW * 0.52;
      vert(g, Math.cos(a) * rr, y + 0.012, Math.sin(a) * rr, 0.5, 0.6, c2.clone().multiplyScalar(0.55));
      vert(g, Math.cos(a) * rr, y - 0.012, Math.sin(a) * rr, 0.5, 0.6, c2.clone().multiplyScalar(0.55));
    }
    for (let j = 0; j < radial; j++) {
      const a0 = band + j * 2;
      g.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
    return;
  }
  // upper lip, lower hang, thin
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * TAU;
    const wob = 0.9 + 0.18 * Math.sin(a * 6 + rng.f() * 6);
    const ro = outer * wob;
    const ci = c1.clone().multiplyScalar(0.98 + 0.06 * noise2(a * 4, 1));
    const [u, v] = tileUV(UV_TILE.extra, j / radial * 0.5 + 0.25, 0.62);
    vert(g, Math.cos(a) * stemW * 0.5, y + 0.012, Math.sin(a) * stemW * 0.5, u, v, ci);
    const [u2, v2] = tileUV(UV_TILE.extra, j / radial * 0.5 + 0.25, 0.9);
    vert(g, Math.cos(a) * ro, y - droop, Math.sin(a) * ro, u2, v2, ci.clone().multiplyScalar(0.93));
  }
  for (let j = 0; j < radial; j++) {
    const a0 = start + j * 2;
    g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
  }
  if (vis.ring === 'double') {
    const s2 = g.pos.length / 3;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const ro = outer * 1.18;
      const [u, v] = tileUV(UV_TILE.extra, j / radial * 0.5 + 0.25, 0.3);
      vert(g, Math.cos(a) * stemW * 0.5, y + 0.04, Math.sin(a) * stemW * 0.5, u, v, c1);
      const [u2, v2] = tileUV(UV_TILE.extra, j / radial * 0.5 + 0.25, 0.55);
      vert(g, Math.cos(a) * ro, y + 0.005, Math.sin(a) * ro, u2, v2, c1.clone().multiplyScalar(0.96));
    }
    for (let j = 0; j < radial; j++) {
      const a0 = s2 + j * 2;
      g.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
}

function buildVolva(g: Geo, sp: Species, stage: GrowthStage, stemH: number, stemW: number, rng: RNG) {
  const vis = sp.visual;
  if (vis.volva === 'none') return;
  const st = STAGE[stage];
  const c = new THREE.Color(vis.fleshColor);
  const radial = 28;
  if (vis.volva === 'sack') {
    const h = stemH * 0.26;
    const ro = stemW * 1.65;
    const start = g.pos.length / 3;
    const pts: Pt[] = [[0.35, 1], [0.75, 0.97], [1.0, 0.75], [0.98, 0.32], [0.72, 0.06], [0.3, 0]];
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const rr = pts[i][0] * ro * (1 + noise2(a * 3, i) * 0.04);
        const [u, v] = tileUV(UV_TILE.extra, 0.5 + Math.cos(a) * 0.3, i / pts.length * 0.7);
        vert(g, Math.cos(a) * rr, pts[i][1] * h + 0.002, Math.sin(a) * rr, u, v, c.clone().multiplyScalar(0.86 + 0.08 * noise2(a * 2, i)));
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a0 = start + i * (radial + 1) + j;
        g.idx.push(a0, a0 + radial + 1, a0 + 1, a0 + 1, a0 + radial + 1, a0 + radial + 2);
      }
    }
  } else {
    // girdles / rim at the base
    const bands = vis.volva === 'girdles' ? 3 : 2;
    for (let b = 0; b < bands; b++) {
      const y = stemH * (0.015 + b * 0.035);
      const ro = stemW * (0.9 - b * 0.1) * (1 + b * 0.18);
      const start = g.pos.length / 3;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const rr = ro * (1 + noise2(a * 4 + b, b) * 0.08);
        vert(g, Math.cos(a) * stemW * 0.5, y + stemW * 0.12, Math.sin(a) * stemW * 0.5, 0.5, 0.5, c);
        const [u, v] = tileUV(UV_TILE.extra, 0.5, 0.4);
        vert(g, Math.cos(a) * rr, y, Math.sin(a) * rr, u, v, c.clone().multiplyScalar(0.9));
      }
      for (let j = 0; j < radial; j++) {
        const a0 = start + j * 2;
        g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
  }
}

function buildWarts(g: Geo, sp: Species, capR: number, capH: number, variant: number, rng: RNG) {
  const wc = sp.visual.warts;
  if (!wc) return;
  const count = sp.id === 'amanita-muscaria' ? 42 : sp.id === 'amanita-pantherina' ? 34 : 22;
  const c = new THREE.Color(wc);
  const prof = PROFILES[sp.visual.capShape] || PROFILES.convex;
  const sampleY = (r01: number) => {
    for (let i = 0; i < prof.length - 1; i++) {
      if (r01 >= prof[i][0] && r01 <= prof[i + 1][0]) {
        const t = (r01 - prof[i][0]) / (prof[i + 1][0] - prof[i][0] || 1);
        return lerp(prof[i][1], prof[i + 1][1], t) * capH;
      }
    }
    return 0;
  };
  for (let i = 0; i < count; i++) {
    const a = rng.f() * TAU;
    const r01 = Math.sqrt(rng.f()) * 0.92;
    const rr = r01 * capR;
    const y = sampleY(r01) + rng.range(0.001, 0.004);
    const size = rng.range(0.004, 0.012) * (1 - r01 * 0.4);
    const start = g.pos.length / 3;
    const segs = 6;
    const rings = 4;
    for (let ri = 0; ri <= rings; ri++) {
      const phi = (ri / rings) * Math.PI * 0.55;
      const sr = Math.sin(phi) * size;
      const sy = Math.cos(phi) * size * 0.62;
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * TAU;
        const [u, v] = tileUV(UV_TILE.extra, j / segs, 0.85);
        vert(
          g,
          Math.cos(a) * rr + Math.cos(th) * sr,
          y + sy,
          Math.sin(a) * rr + Math.sin(th) * sr,
          u,
          v,
          c.clone().multiplyScalar(0.92 + rng.f() * 0.1)
        );
      }
    }
    for (let ri = 0; ri < rings; ri++) {
      for (let j = 0; j < segs; j++) {
        const a0 = start + ri * (segs + 1) + j;
        g.idx.push(a0, a0 + segs + 1, a0 + 1, a0 + 1, a0 + segs + 1, a0 + segs + 2);
      }
    }
  }
}

/* ---------------- special forms ---------------- */

function buildCoral(g: Geo, sp: Species, stage: GrowthStage, variant: number, rng: RNG) {
  const c = new THREE.Color(sp.visual.capColor);
  const scale = STAGE[stage].capR;
  const branch = (x: number, y: number, z: number, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const end = new THREE.Vector3(x, y, z).addScaledVector(dir, len);
    const radial = 6;
    const rings = 3;
    const start = g.pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const rr = rad * (1 - t * 0.55);
      const px = lerp(x, end.x, t);
      const py = lerp(y, end.y, t);
      const pz = lerp(z, end.z, t);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        const [u, v] = tileUV(UV_TILE.stem, j / radial, t * 0.5);
        vert(
          g,
          px + Math.cos(a) * rr,
          py,
          pz + Math.sin(a) * rr,
          u,
          v,
          c.clone().multiplyScalar(0.94 + rng.f() * 0.08)
        );
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radial; j++) {
        const a0 = start + i * (radial + 1) + j;
        g.idx.push(a0, a0 + radial + 1, a0 + 1, a0 + 1, a0 + radial + 1, a0 + radial + 2);
      }
    }
    // spines along the upper part
    for (let i = 0; i < 26; i++) {
      const t = rng.range(0.25, 1);
      const px = lerp(x, end.x, t);
      const py = lerp(y, end.y, t);
      const pz = lerp(z, end.z, t);
      const a = rng.f() * TAU;
      const sl = rng.range(0.006, 0.016);
      const sx = px + Math.cos(a) * rad * 0.6;
      const sz = pz + Math.sin(a) * rad * 0.6;
      const s0 = g.pos.length / 3;
      const [u1, v1] = tileUV(UV_TILE.extra, 0.3, 0.9);
      vert(g, sx - 0.0015, py, sz, u1, v1, c);
      vert(g, sx + 0.0015, py, sz, u1, v1, c);
      const [u2, v2] = tileUV(UV_TILE.extra, 0.4, 0.95);
      vert(g, sx, py - sl, sz + 0.0015, u2, v2, c);
      const [u3, v3] = tileUV(UV_TILE.extra, 0.5, 0.95);
      vert(g, sx, py - sl, sz - 0.0015, u3, v3, c);
      g.idx.push(s0, s0 + 1, s0 + 2, s0 + 1, s0 + 3, s0 + 2);
      g.idx.push(s0, s0 + 2, s0 + 3);
    }
    if (depth > 0) {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const d = dir.clone();
        d.x += rng.range(-0.9, 0.9);
        d.z += rng.range(-0.9, 0.9);
        d.y += rng.range(-0.05, 0.5);
        d.normalize();
        branch(end.x, end.y, end.z, d, len * rng.range(0.55, 0.8), rad * 0.66, depth - 1);
      }
    }
  };
  const baseR = 0.02 * scale;
  branch(0, 0, 0, new THREE.Vector3(0, 1, 0), 0.035 * scale, baseR, 3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng.range(-0.4, 0.4);
    branch(0, 0.02, 0, new THREE.Vector3(Math.cos(a) * 0.8, 1, Math.sin(a) * 0.8).normalize(), 0.03 * scale, baseR * 0.85, 2);
  }
  void variant;
}

function buildBrainCap(g: Geo, sp: Species, stage: GrowthStage, variant: number, rng: RNG) {
  const vis = sp.visual;
  const st = STAGE[stage];
  const R = (vis.capDiameter[1] / 2) * 0.0115 * st.capR;
  const H = R * 1.1 * st.capH;
  const c = new THREE.Color(vis.capColor);
  const seed = variant * 3.1;
  const radial = 56;
  const rings = 20;
  const start = g.pos.length / 3;
  for (let i = 0; i < rings; i++) {
    const phi = (i / (rings - 1)) * Math.PI * 0.78;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const lobe = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 7 - seed) * 0.06;
      const rr = Math.sin(phi) * R * lobe;
      const yy = Math.cos(phi) * H;
      const n = fbm2(Math.cos(a) * 3 + seed, phi * 5, 3);
      const [u, v] = tileUV(UV_TILE.cap, 0.5 + Math.cos(a) * Math.sin(phi) * 0.48, 0.5 + Math.sin(a) * Math.sin(phi) * 0.48);
      const col = c.clone().multiplyScalar(0.82 + n * 0.22);
      vert(g, Math.cos(a) * rr * (1 + n * 0.12), yy + n * H * 0.16, Math.sin(a) * rr * (1 + n * 0.12), u, v, col);
    }
  }
  const base = new THREE.Color(vis.hymenColor);
  const [ub, vb] = tileUV(UV_TILE.gills, 0.5, 0.5);
  const center = g.pos.length / 3;
  vert(g, 0, H * 0.1, 0, ub, vb, base);
  const ringStart = g.pos.length / 3;
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * TAU;
    vert(g, Math.cos(a) * R * 0.8, -H * 0.05, Math.sin(a) * R * 0.8, ub, vb, base);
  }
  for (let j = 0; j < radial; j++) {
    g.idx.push(center, ringStart + j, ringStart + j + 1);
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = start + i * (radial + 1) + j;
      const b0 = a0 + 1;
      const c0 = a0 + radial + 1;
      const d0 = c0 + 1;
      g.idx.push(a0, c0, b0, b0, c0, d0);
    }
  }
  void rng;
}

/* ---------------- assembly ---------------- */

const geometryCache = new Map<string, THREE.BufferGeometry>();

export function buildMushroomGeometry(sp: Species, stage: GrowthStage, variant: number, shape: ShapeMods = NO_SHAPE): THREE.BufferGeometry {
  const sk = shape === NO_SHAPE ? '' : `:${shape.capMul.toFixed(2)},${shape.stemWMul.toFixed(2)},${shape.stemHMul.toFixed(2)},${shape.count ?? '-'},${+shape.fused},${+shape.symmetric}`;
  const key = `${sp.id}:${stage}:${variant}${sk}`;
  const hit = geometryCache.get(key);
  if (hit) return hit;
  SHAPE = shape;
  try {
    return buildGeometryInner(sp, stage, variant, key);
  } finally {
    SHAPE = NO_SHAPE;
  }
}

function buildGeometryInner(sp: Species, stage: GrowthStage, variant: number, key: string): THREE.BufferGeometry {
  const rng = new RNG(strSeed(key));
  const g = newGeo();

  if (sp.form === 'coral' && sp.id === 'hericium-coralloides') {
    buildCoral(g, sp, stage, variant, rng);
  } else if (sp.form === 'brain') {
    buildBrainCap(g, sp, stage, variant, rng);
    const capEnd = g.pos.length;
    const R = (sp.visual.capDiameter[1] / 2) * 0.0115 * STAGE[stage].capR;
    const stem = buildStem(g, sp, stage, rng, 0, R);
    // lift only the cap onto the stem (previously the stem was lifted too and floated above the cap)
    for (let i = 1; i < capEnd; i += 3) g.pos[i] += stem.h * 0.9;
  } else {
    const cluster = sp.visual.cluster;
    const n = SHAPE.count ? clamp(SHAPE.count, 1, 16) : sp.form === 'shelf' ? rng.int(2, 4) : clamp(rng.int(cluster[0], cluster[1]), 1, 6);
    for (let k = 0; k < n; k++) {
      const body = newGeo();
      const damage = stage === 'damaged' ? { a0: rng.range(0, TAU), a1: 0 } : undefined;
      if (damage) damage.a1 = damage.a0 + rng.range(0.4, 1.1);
      const cap = buildCap(body, sp, stage, variant + k, new RNG(strSeed(key + k)), damage);
      const capEnd = body.pos.length;
      const stem = buildStem(body, sp, stage, new RNG(strSeed(key + 's' + k)), cap.rimY, cap.R);
      buildRing(body, sp, stage, stem.h, stem.w, new RNG(strSeed(key + 'r' + k)));
      buildVolva(body, sp, stage, stem.h, stem.w, new RNG(strSeed(key + 'v' + k)));
      const wartStart = body.pos.length;
      buildWarts(body, sp, cap.R, cap.H, variant + k, new RNG(strSeed(key + 'w' + k)));

      // Cap and warts are built around y=0 (rim level); stem, ring and volva already sit on the ground.
      // Lift only the cap so it rests on the stem apex (stem top tucked a little into the cap flesh).
      const lift = stem.h - cap.H * 0.14;
      for (let i = 1; i < capEnd; i += 3) body.pos[i] += lift;
      for (let i = wartStart + 1; i < body.pos.length; i += 3) body.pos[i] += lift;

      let m = new THREE.Matrix4();
      if (SHAPE.fused && n === 2) {
        // fused twins: one shared base, the two fruit bodies splay apart
        const side = k === 0 ? 1 : -1;
        m.makeRotationY(rng.f() * TAU * 0.1);
        const sc = k === 1 ? 0.8 : 1;
        m.premultiply(new THREE.Matrix4().makeScale(sc, sc, sc));
        m.premultiply(new THREE.Matrix4().makeRotationX(side * rng.range(0.42, 0.58)));
        m.setPosition(0, 0, side * cap.R * 0.16);
      } else if (n > 1) {
        const a = (k / n) * TAU + rng.range(-0.4, 0.4);
        const dist = sp.form === 'shelf' ? 0.02 : cap.R * 0.85 * rng.range(0.6, 1.1) * (n > 6 ? 1 + (k % 3) * 0.55 : 1);
        const s = sp.form === 'shelf' ? rng.range(0.7, 1) : rng.range(0.7, 0.98);
        m.makeRotationY(rng.f() * TAU);
        m.scale(new THREE.Vector3(s, s, s));
        m.setPosition(Math.cos(a) * dist, rng.range(-0.004, 0.004), Math.sin(a) * dist);
        if (sp.form === 'shelf') {
          const tilt = new THREE.Matrix4().makeRotationX(rng.range(-0.25, 0.25));
          m.premultiply(tilt);
        }
      } else {
        m.makeRotationY(rng.f() * TAU);
      }
      if (sp.visual.eccentric && sp.form === 'shelf') {
        const t = new THREE.Matrix4().makeRotationZ(Math.PI * 0.44);
        m.premultiply(t);
      }
      mergeInto(g, body, m);
    }
  }

  // some hatchling moss/debris at the base for grounding
  if (sp.substrate.includes('moss') || sp.substrate.includes('litter')) {
    const mc = new THREE.Color('#3f4a2c');
    for (let i = 0; i < 5; i++) {
      const a = rng.f() * TAU;
      const r = rng.range(0.005, 0.035);
      const start = g.pos.length / 3;
      for (let j = 0; j <= 5; j++) {
        const aa = (j / 5) * TAU;
        vert(
          g,
          Math.cos(a) * r + Math.cos(aa) * 0.003,
          0.001,
          Math.sin(a) * r + Math.sin(aa) * 0.003,
          0.5,
          1,
          mc
        );
      }
      g.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geometryCache.set(key, geo);
  return geo;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const allMaterials: THREE.MeshStandardMaterial[] = [];

export function materialForSpecies(sp: Species, variant: number, wet: boolean): THREE.MeshStandardMaterial {
  const key = `${sp.id}:${variant}`;
  let mat = materialCache.get(key);
  if (!mat) {
    const atlas = mushroomAtlas(sp, variant);
    mat = new THREE.MeshStandardMaterial({
      map: atlas.map,
      bumpMap: atlas.bump,
      bumpScale: 0.35,
      roughness: sp.visual.sticky ? 0.55 : 0.86,
      metalness: 0,
      vertexColors: true,
      color: new THREE.Color(1 / DETAIL_SCALE, 1 / DETAIL_SCALE, 1 / DETAIL_SCALE), // undo detail-map scaling
      side: THREE.DoubleSide,
      transparent: false,
    });
    mat.userData.baseRoughness = mat.roughness;
    materialCache.set(key, mat);
    allMaterials.push(mat);
  }
  mat.roughness = wet ? Math.max(0.16, mat.userData.baseRoughness * 0.4) : mat.userData.baseRoughness;
  return mat;
}

export function setAllWet(wet: boolean) {
  for (const m of allMaterials) {
    m.roughness = wet ? Math.max(0.14, (m.userData.baseRoughness ?? 0.85) * 0.38) : m.userData.baseRoughness ?? 0.85;
    m.needsUpdate = false;
  }
}

export interface MushroomVisual {
  group: THREE.Group;
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
}

export function buildMushroomVisual(
  sp: Species,
  stage: GrowthStage,
  variant: number,
  wet: boolean,
  scaleJitter: number,
  shape: ShapeMods = NO_SHAPE
): MushroomVisual {
  const group = new THREE.Group();
  const geo = buildMushroomGeometry(sp, stage, variant, shape);
  const mat = materialForSpecies(sp, variant % 3, wet);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const s = scaleJitter;
  mesh.scale.setScalar(s);
  group.add(mesh);

  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTextureRef(),
    transparent: true,
    depthWrite: false,
    color: 0x000000,
    opacity: 0.5,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  const radius = (sp.visual.capDiameter[1] / 100) * s * 0.7;
  shadow.scale.setScalar(Math.max(0.12, radius * 2));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = 1;
  group.add(shadow);

  return { group, mesh, shadow };
}

import { shadowTexture as shadowTextureRef } from './textures';

export function disposeMushroomCache() {
  for (const g of geometryCache.values()) g.dispose();
  geometryCache.clear();
  for (const m of materialCache.values()) {
    (m.map as THREE.Texture)?.dispose();
    m.dispose();
  }
  materialCache.clear();
  allMaterials.length = 0;
}
