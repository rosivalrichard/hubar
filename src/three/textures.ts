/* Procedural canvas textures. No external image assets: every surface is painted here. */

import * as THREE from 'three';
import { fbm2, noise2, hash2, TAU, clamp, lerp, RNG, strSeed, mixHex, shade } from '../core/util';
import type { Species } from '../data/species-types';

const canvasCache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: false })!;
}

function toTexture(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Organic mottled base fill, computed at half resolution for speed. */
function paintMottle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  variance: number,
  freq: number,
  seed: number,
  alpha = 1
) {
  const lw = Math.max(8, w >> 1);
  const lh = Math.max(8, h >> 1);
  const low = makeCanvas(lw, lh);
  const lctx = ctx2d(low);
  const img = lctx.createImageData(lw, lh);
  const [br, bg, bb] = hexRgb(base);
  const ox = (seed % 97) * 3.13;
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const nx = (x / lw) * freq + ox;
      const ny = (y / lh) * freq + ox * 0.7;
      const n = fbm2(nx, ny, 3, 2.1, 0.55);
      const n2 = noise2(nx * 7.3, ny * 7.3) * 0.35;
      const v = n * variance + n2 * variance * 0.5;
      const i = (y * lw + x) * 4;
      img.data[i] = clamp(br + v * 255, 0, 255);
      img.data[i + 1] = clamp(bg + v * 235, 0, 255);
      img.data[i + 2] = clamp(bb + v * 215, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

/** Build a greyscale bump map from an albedo canvas. */
function bumpFrom(canvas: HTMLCanvasElement, strength = 1): THREE.Texture {
  const w = canvas.width;
  const h = canvas.height;
  const out = makeCanvas(w, h);
  const octx = ctx2d(out);
  octx.drawImage(canvas, 0, 0);
  const img = octx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    l = clamp(128 + (l - 128) * 1.6 * strength, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = l;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return toTexture(out, false);
}

export interface TexPair {
  map: THREE.Texture;
  bump: THREE.Texture;
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

export type GroundKind = 'needles' | 'leaves' | 'sand' | 'moss' | 'mud' | 'mixed';

export function groundTextures(kind: GroundKind, base: string, base2: string): TexPair {
  const key = `ground:${kind}:${base}:${base2}`;
  const hit = canvasCache.get(key);
  if (hit) {
    return { map: hit, bump: canvasCache.get(key + ':bump')! };
  }
  const S = 512;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(key));

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  paintMottle(ctx, S, S, base, 0.16, 5, strSeed(key));

  // Large darker patches / damp soil
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 26; i++) {
    const x = rng.f() * S;
    const y = rng.f() * S;
    const r = rng.range(30, 110);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, shade(base2, 0.05));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  if (kind === 'needles' || kind === 'mixed') {
    const count = kind === 'mixed' ? 1600 : 3200;
    for (let i = 0; i < count; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      const a = rng.f() * TAU;
      const len = rng.range(6, 19);
      const col = mixHex('#6a4a26', '#a9743c', rng.f());
      ctx.strokeStyle = col;
      ctx.globalAlpha = rng.range(0.35, 0.85);
      ctx.lineWidth = rng.range(1, 2.1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'leaves' || kind === 'mixed') {
    // Leaf litter: many flattened shapes with veins
    const count = kind === 'mixed' ? 900 : 2000;
    for (let i = 0; i < count; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      const w = rng.range(7, 22);
      const h = w * rng.range(0.35, 0.6);
      const a = rng.f() * TAU;
      const cols = ['#7a5626', '#8d6530', '#5f4520', '#9a7434', '#6b4d24', '#a37c3e'];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = rng.range(0.4, 0.95);
      ctx.fillStyle = cols[Math.floor(rng.f() * cols.length)];
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#3d2b12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(w, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'sand') {
    for (let i = 0; i < 5000; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      ctx.fillStyle = rng.chance(0.5) ? '#b9a271' : '#8a7750';
      ctx.globalAlpha = rng.range(0.15, 0.5);
      ctx.fillRect(x, y, rng.range(1, 2.4), rng.range(1, 2.4));
    }
    ctx.globalAlpha = 1;
    // pine needles
    for (let i = 0; i < 900; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      const a = rng.f() * TAU;
      ctx.strokeStyle = mixHex('#7a5a2a', '#a98646', rng.f());
      ctx.globalAlpha = rng.range(0.3, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * rng.range(10, 24), y + Math.sin(a) * rng.range(10, 24));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'moss' || kind === 'mixed') {
    const count = kind === 'moss' ? 2400 : 1100;
    for (let i = 0; i < count; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      const r = rng.range(2, 9);
      const col = mixHex('#3f5426', '#7d9440', rng.f());
      ctx.fillStyle = col;
      ctx.globalAlpha = rng.range(0.2, 0.65);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * rng.range(0.5, 1.1), rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'mud') {
    for (let i = 0; i < 40; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      const r = rng.range(20, 90);
      ctx.globalAlpha = rng.range(0.15, 0.4);
      ctx.fillStyle = '#1f2416';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 700; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      ctx.fillStyle = mixHex('#4a5230', '#7d8a4a', rng.f());
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, y, 2, rng.range(2, 7));
    }
    ctx.globalAlpha = 1;
  }

  // twigs
  for (let i = 0; i < 45; i++) {
    const x = rng.f() * S;
    const y = rng.f() * S;
    const a = rng.f() * TAU;
    const len = rng.range(12, 60);
    ctx.strokeStyle = mixHex('#3a2a18', '#5c452a', rng.f());
    ctx.lineWidth = rng.range(1, 3);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 4, y + Math.sin(a) * len * 0.5 - 4, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // subtle overall vignette of dampness
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  const tex = toTexture(c, true, true);
  tex.repeat.set(14, 14);
  const bump = bumpFrom(c, 0.8);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(14, 14);
  canvasCache.set(key, tex);
  canvasCache.set(key + ':bump', bump);
  return { map: tex, bump };
}

/* ------------------------------------------------------------------ */
/* Bark                                                                */
/* ------------------------------------------------------------------ */

export type TreeKind = 'spruce' | 'beech' | 'oak' | 'pine' | 'birch';

export function barkTextures(kind: TreeKind): TexPair {
  const key = `bark:${kind}`;
  const hit = canvasCache.get(key);
  if (hit) return { map: hit, bump: canvasCache.get(key + ':bump')! };
  const S = 512;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(key));
  const palettes: Record<TreeKind, [string, string, string]> = {
    spruce: ['#4a3a2c', '#2c2118', '#6b5844'],
    beech: ['#8a8c7e', '#5c5e52', '#aeb0a2'],
    oak: ['#5a4a36', '#332a1d', '#7a6850'],
    pine: ['#7a5036', '#4a2c1b', '#a0714c'],
    birch: ['#e2e0d2', '#c9c6b6', '#5c5a4c'],
  };
  const [base, dark, light] = palettes[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  paintMottle(ctx, S, S, base, 0.14, 7, strSeed(key));

  if (kind === 'birch') {
    for (let i = 0; i < 90; i++) {
      const y = rng.f() * S;
      const w = rng.range(14, 90);
      const h = rng.range(3, 10);
      ctx.globalAlpha = rng.range(0.4, 0.9);
      ctx.fillStyle = rng.chance(0.7) ? '#2c2a22' : '#8a8676';
      ctx.beginPath();
      ctx.ellipse(rng.f() * S, y, w, h, rng.range(-0.1, 0.1), 0, TAU);
      ctx.fill();
    }
    // fine horizontal papery lines
    for (let i = 0; i < 220; i++) {
      ctx.globalAlpha = rng.range(0.06, 0.2);
      ctx.strokeStyle = '#a5a291';
      ctx.lineWidth = 1;
      const y = rng.f() * S;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S, y + rng.range(-3, 3));
      ctx.stroke();
    }
  } else {
    // vertical fissures
    for (let i = 0; i < 190; i++) {
      const x = rng.f() * S;
      const w = rng.range(1, kind === 'oak' ? 14 : 8);
      const h = rng.range(40, 260);
      const y = rng.f() * S;
      ctx.globalAlpha = rng.range(0.18, 0.6);
      ctx.fillStyle = rng.chance(0.65) ? dark : light;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + rng.range(-8, 8));
      ctx.lineTo(x + w * 0.6, y + h);
      ctx.lineTo(x - w * 0.4, y + h - rng.range(0, 20));
      ctx.closePath();
      ctx.fill();
    }
    // deep cracks
    for (let i = 0; i < 70; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      ctx.strokeStyle = 'rgba(20,14,8,0.55)';
      ctx.lineWidth = rng.range(1, 3.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      for (let j = 0; j < 5; j++) {
        cx += rng.range(-9, 9);
        cy += rng.range(12, 34);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // lichen for oak / spruce
    if (kind === 'oak' || kind === 'spruce') {
      for (let i = 0; i < 60; i++) {
        const x = rng.f() * S;
        const y = rng.f() * S;
        ctx.globalAlpha = rng.range(0.1, 0.3);
        ctx.fillStyle = '#8a9582';
        ctx.beginPath();
        ctx.ellipse(x, y, rng.range(4, 20), rng.range(3, 12), rng.f() * TAU, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  const tex = toTexture(c, true, true);
  tex.repeat.set(2, 2);
  const bump = bumpFrom(c, 1.2);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(2, 2);
  canvasCache.set(key, tex);
  canvasCache.set(key + ':bump', bump);
  return { map: tex, bump };
}

/* ------------------------------------------------------------------ */
/* Foliage / understory                                                */
/* ------------------------------------------------------------------ */

export function foliageTexture(kind: TreeKind, seasonTint = '#ffffff'): THREE.Texture {
  const key = `foliage:${kind}:${seasonTint}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 512;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(key));
  ctx.clearRect(0, 0, S, S);
  const tint = (hex: string) => {
    const t = new THREE.Color(hex);
    const tt = new THREE.Color(seasonTint);
    return `#${t.multiply(tt).getHexString()}`;
  };

  if (kind === 'spruce' || kind === 'pine') {
    const needleLen = kind === 'spruce' ? 16 : 30;
    const branches = kind === 'spruce' ? 26 : 16;
    for (let b = 0; b < branches; b++) {
      const cx = S * 0.5 + rng.range(-90, 90);
      const cy = S * 0.5 + rng.range(-90, 90);
      const a = rng.f() * TAU;
      const len = rng.range(50, 150);
      ctx.strokeStyle = tint('#3a2c1c');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
      const needles = Math.floor(len / 3.4);
      for (let i = 0; i < needles; i++) {
        const t = i / needles;
        const nx = cx + Math.cos(a) * len * t;
        const ny = cy + Math.sin(a) * len * t;
        for (const side of [-1, 1]) {
          const na = a + side * rng.range(0.7, 1.5);
          const nl = needleLen * rng.range(0.55, 1.1);
          ctx.strokeStyle = tint(rng.chance(0.5) ? '#33402a' : '#46543a');
          ctx.globalAlpha = rng.range(0.55, 1);
          ctx.lineWidth = rng.range(1.1, 2.2);
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + Math.cos(na) * nl, ny + Math.sin(na) * nl);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // broadleaf cluster
    const leafCols =
      kind === 'birch'
        ? ['#6f7a3c', '#8a9448', '#58632e', '#9aa354']
        : kind === 'beech'
          ? ['#5c5a2c', '#7a6a2c', '#8a6a2c', '#4a5228', '#96702e']
          : kind === 'oak'
            ? ['#48501f', '#5f6326', '#6e5a22', '#3c441c']
            : ['#3f4a2a', '#4f5a30', '#646a36', '#35402a'];
    const twigs = 30;
    for (let t = 0; t < twigs; t++) {
      const cx = S * 0.5 + rng.range(-110, 110);
      const cy = S * 0.5 + rng.range(-110, 110);
      const a = rng.f() * TAU;
      const len = rng.range(40, 120);
      ctx.strokeStyle = '#3a3020';
      ctx.lineWidth = rng.range(1, 2.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
      const leaves = Math.floor(rng.range(8, 22));
      for (let i = 0; i < leaves; i++) {
        const tt = rng.f();
        const x = cx + Math.cos(a) * len * tt + rng.range(-16, 16);
        const y = cy + Math.sin(a) * len * tt + rng.range(-16, 16);
        const w = rng.range(9, 26);
        const h = w * rng.range(0.5, 0.85);
        const ang = rng.f() * TAU;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.fillStyle = tint(leafCols[Math.floor(rng.f() * leafCols.length)]);
        ctx.globalAlpha = rng.range(0.55, 0.98);
        ctx.beginPath();
        ctx.ellipse(0, 0, w, h, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha *= 0.4;
        ctx.strokeStyle = '#2b2618';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function understoryTexture(kind: 'fern' | 'grass' | 'sedge' | 'heather' | 'moss'): THREE.Texture {
  const key = `under:${kind}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(key));
  ctx.clearRect(0, 0, S, S);
  if (kind === 'fern') {
    for (let f = 0; f < 9; f++) {
      const bx = S * 0.5 + rng.range(-40, 40);
      const by = S - 6;
      const tipX = bx + rng.range(-80, 80);
      const tipY = rng.range(10, 90);
      const segs = 22;
      for (let i = 0; i < segs; i++) {
        const t = i / segs;
        const x = lerp(bx, tipX, t);
        const y = lerp(by, tipY, t);
        const leafLen = lerp(34, 4, t) * rng.range(0.8, 1.1);
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(side * rng.range(0.7, 1.05));
          ctx.fillStyle = mixHex('#3c5526', '#718d3a', rng.f());
          ctx.globalAlpha = rng.range(0.65, 0.95);
          ctx.beginPath();
          ctx.ellipse(0, 0, leafLen, leafLen * 0.22, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = '#3a4a20';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }
  } else if (kind === 'grass') {
    for (let i = 0; i < 90; i++) {
      const x = rng.f() * S;
      const h = rng.range(50, 190);
      const bend = rng.range(-46, 46);
      ctx.strokeStyle = mixHex('#4a5a28', '#8a9a44', rng.f());
      ctx.globalAlpha = rng.range(0.4, 0.9);
      ctx.lineWidth = rng.range(1.4, 3.2);
      ctx.beginPath();
      ctx.moveTo(x, S);
      ctx.quadraticCurveTo(x + bend * 0.4, S - h * 0.5, x + bend, S - h);
      ctx.stroke();
    }
  } else if (kind === 'sedge') {
    for (let i = 0; i < 70; i++) {
      const x = rng.f() * S;
      const h = rng.range(80, 230);
      ctx.strokeStyle = mixHex('#4a5230', '#7a8250', rng.f());
      ctx.globalAlpha = rng.range(0.4, 0.85);
      ctx.lineWidth = rng.range(1.2, 2.6);
      ctx.beginPath();
      ctx.moveTo(x, S);
      ctx.lineTo(x + rng.range(-30, 30), S - h);
      ctx.stroke();
    }
  } else if (kind === 'heather') {
    for (let i = 0; i < 130; i++) {
      const x = rng.f() * S;
      const y = S - rng.range(0, 190);
      ctx.strokeStyle = mixHex('#4a4428', '#6a5a38', rng.f());
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.7;
      const a = rng.range(-1.4, -0.2);
      const len = rng.range(14, 52);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = mixHex('#5d3a4a', '#8a5068', rng.f());
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * len * (k / 4), y + Math.sin(a) * len * (k / 4), 2.2, 0, TAU);
        ctx.fill();
      }
    }
  } else {
    for (let i = 0; i < 400; i++) {
      const x = rng.f() * S;
      const y = rng.f() * S;
      ctx.fillStyle = mixHex('#3c4d24', '#6d8338', rng.f());
      ctx.globalAlpha = rng.range(0.3, 0.8);
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(2, 7), rng.range(2, 7), rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
  }
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function rockTexture(): TexPair {
  const key = 'rock';
  const hit = canvasCache.get(key);
  if (hit) return { map: hit, bump: canvasCache.get(key + ':bump')! };
  const S = 512;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(9182);
  ctx.fillStyle = '#6a6a62';
  ctx.fillRect(0, 0, S, S);
  paintMottle(ctx, S, S, '#6a6a62', 0.2, 6, 44);
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = rng.range(0.1, 0.35);
    ctx.fillStyle = rng.chance(0.5) ? '#8a8a80' : '#43433c';
    ctx.beginPath();
    ctx.ellipse(rng.f() * S, rng.f() * S, rng.range(8, 60), rng.range(6, 40), rng.f() * TAU, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = rng.range(0.2, 0.5);
    ctx.fillStyle = '#55603a';
    ctx.beginPath();
    ctx.arc(rng.f() * S, rng.f() * S, rng.range(3, 16), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = toTexture(c, true, true);
  tex.repeat.set(2, 2);
  const bump = bumpFrom(c, 1.4);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  canvasCache.set(key, tex);
  canvasCache.set(key + ':bump', bump);
  return { map: tex, bump };
}

/* ------------------------------------------------------------------ */
/* Mushroom atlas                                                      */
/* ------------------------------------------------------------------ */

export const UV_TILE: Record<'cap' | 'gills' | 'stem' | 'extra', [number, number]> = {
  cap: [0, 0.5],
  gills: [0.5, 0.5],
  stem: [0, 0],
  extra: [0.5, 0],
};

function drawCapPattern(
  ctx: CanvasRenderingContext2D,
  sp: Species,
  rng: RNG,
  size: number,
  base: string
) {
  const p = sp.visual.capPattern;
  const dark = shade(sp.visual.capColor, -0.35);
  const light = shade(sp.visual.capColor, 0.3);

  if (p === 'scales' || p === 'shaggy') {
    const rings = 5;
    for (let r = 0; r < rings; r++) {
      const rad = (r / rings) * size * 0.5 + 8;
      const count = 6 + r * 7;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + rng.range(-0.2, 0.2);
        const x = size * 0.5 + Math.cos(a) * rad * rng.range(0.75, 1.12);
        const y = size * 0.5 + Math.sin(a) * rad * rng.range(0.75, 1.12);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + rng.range(-0.4, 0.4));
        ctx.globalAlpha = rng.range(0.35, 0.8);
        ctx.fillStyle = p === 'shaggy' ? shade(base, -0.12) : p === 'scales' ? dark : dark;
        const w = rng.range(5, 16);
        ctx.beginPath();
        ctx.ellipse(0, 0, w, w * rng.range(0.3, 0.6), 0, 0, TAU);
        ctx.fill();
        if (p === 'shaggy') {
          ctx.globalAlpha *= 0.6;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, -2, w * 0.7, w * 0.22, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    // dark umbo
    const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.22);
    g.addColorStop(0, dark);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (p === 'concentric' || p === 'zoned') {
    for (let i = 0; i < 9; i++) {
      const r = (i / 9) * size * 0.55 + rng.range(2, 10);
      ctx.globalAlpha = rng.range(0.06, 0.2);
      ctx.strokeStyle = i % 2 === 0 ? dark : light;
      ctx.lineWidth = rng.range(2, 9);
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, r, 0, TAU);
      ctx.stroke();
    }
  } else if (p === 'fibrous') {
    for (let i = 0; i < 220; i++) {
      const a = rng.f() * TAU;
      const r0 = rng.range(4, size * 0.2);
      const r1 = rng.range(size * 0.28, size * 0.5);
      ctx.globalAlpha = rng.range(0.06, 0.22);
      ctx.strokeStyle = rng.chance(0.5) ? dark : light;
      ctx.lineWidth = rng.range(0.7, 2);
      ctx.beginPath();
      ctx.moveTo(size * 0.5 + Math.cos(a) * r0, size * 0.5 + Math.sin(a) * r0);
      ctx.lineTo(size * 0.5 + Math.cos(a + rng.range(-0.1, 0.1)) * r1, size * 0.5 + Math.sin(a + rng.range(-0.1, 0.1)) * r1);
      ctx.stroke();
    }
  } else if (p === 'cracked') {
    ctx.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {
      const x = rng.f() * size;
      const y = rng.f() * size;
      ctx.strokeStyle = '#a0442c';
      ctx.lineWidth = rng.range(2, 6);
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      for (let j = 0; j < 5; j++) {
        cx += rng.range(-18, 18);
        cy += rng.range(-18, 18);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,20,10,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else if (p === 'honeycomb') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2c1c0e';
    ctx.fillRect(0, 0, size, size);
    const cell = 26;
    for (let y = 0; y < size + cell; y += cell * 0.86) {
      for (let x = 0; x < size + cell; x += cell) {
        const off = (Math.round(y / (cell * 0.86)) % 2) * (cell * 0.5);
        const jx = rng.range(-3, 3);
        const jy = rng.range(-3, 3);
        const r = cell * rng.range(0.34, 0.46);
        const g = ctx.createRadialGradient(x + off + jx, y + jy, 1, x + off + jx, y + jy, r);
        g.addColorStop(0, '#3a2412');
        g.addColorStop(0.7, '#5a3c20');
        g.addColorStop(1, sp.visual.capColor);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + off + jx, y + jy, r, 0, TAU);
        ctx.fill();
      }
    }
  } else if (p === 'brain') {
    ctx.globalAlpha = 1;
    for (let i = 0; i < 34; i++) {
      ctx.strokeStyle = rng.chance(0.5) ? shade(sp.visual.capColor, -0.3) : shade(sp.visual.capColor, 0.18);
      ctx.lineWidth = rng.range(4, 13);
      ctx.globalAlpha = rng.range(0.3, 0.8);
      ctx.beginPath();
      let x = rng.range(0, size);
      let y = rng.range(0, size);
      ctx.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        x += rng.range(-40, 40);
        y += rng.range(-40, 40);
        ctx.quadraticCurveTo(x + rng.range(-20, 20), y + rng.range(-20, 20), x, y);
      }
      ctx.stroke();
    }
  } else if (p === 'mottled') {
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = rng.range(0.05, 0.18);
      ctx.fillStyle = rng.chance(0.5) ? dark : light;
      ctx.beginPath();
      ctx.ellipse(rng.f() * size, rng.f() * size, rng.range(6, 30), rng.range(4, 20), rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
  } else if (p === 'velvet') {
    for (let i = 0; i < 2600; i++) {
      ctx.globalAlpha = rng.range(0.04, 0.14);
      ctx.fillStyle = rng.chance(0.55) ? dark : light;
      ctx.fillRect(rng.f() * size, rng.f() * size, 1.4, 1.4);
    }
  } else if (p === 'warty') {
    for (let i = 0; i < 220; i++) {
      ctx.globalAlpha = rng.range(0.05, 0.16);
      ctx.fillStyle = '#f2ecda';
      ctx.beginPath();
      ctx.arc(rng.f() * size, rng.f() * size, rng.range(1, 4), 0, TAU);
      ctx.fill();
    }
  } else if (p === 'ridges') {
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = rng.range(0.08, 0.2);
      ctx.strokeStyle = dark;
      ctx.lineWidth = rng.range(2, 6);
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, rng.range(20, size * 0.5), rng.f() * TAU, rng.f() * TAU);
      ctx.stroke();
    }
  }
}

function drawHymenium(
  ctx: CanvasRenderingContext2D,
  sp: Species,
  rng: RNG,
  size: number
) {
  const cx = size / 2;
  const cy = size / 2;
  const col = sp.visual.hymenColor;
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, size, size);
  paintMottle(ctx, size, size, col, 0.08, 9, strSeed(sp.id + 'hymen'), 0.6);

  const g = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const type = sp.visual.gillType;
  if (type === 'gills') {
    const n = 92;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.004, 0.004);
      const inner = size * rng.range(0.1, 0.15);
      const outer = size * 0.5;
      ctx.globalAlpha = rng.range(0.5, 0.95);
      ctx.strokeStyle = shade(col, -0.4);
      ctx.lineWidth = rng.range(1.2, 2.6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
      // secondary short gills
      if (i % 2 === 0) {
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth *= 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a + 0.03) * inner * 2.2, cy + Math.sin(a + 0.03) * inner * 2.2);
        ctx.lineTo(cx + Math.cos(a + 0.03) * outer, cy + Math.sin(a + 0.03) * outer);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  } else if (type === 'pores') {
    const step = 12;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const jx = x + rng.range(-2, 2);
        const jy = y + rng.range(-2, 2);
        if (Math.hypot(jx - cx, jy - cy) > size * 0.49) continue;
        ctx.globalAlpha = rng.range(0.3, 0.7);
        ctx.strokeStyle = shade(col, -0.45);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(jx, jy, rng.range(3.4, 5.2), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = shade(col, 0.15);
        ctx.beginPath();
        ctx.arc(jx, jy, 2.2, 0, TAU);
        ctx.fill();
      }
    }
  } else if (type === 'ridges') {
    const n = 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.globalAlpha = rng.range(0.25, 0.55);
      ctx.strokeStyle = shade(col, -0.3);
      ctx.lineWidth = rng.range(5, 10);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size * 0.1, cy + Math.sin(a) * size * 0.1);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.12) * size * 0.3,
        cy + Math.sin(a + 0.12) * size * 0.3,
        cx + Math.cos(a) * size * 0.5,
        cy + Math.sin(a) * size * 0.5
      );
      ctx.stroke();
      // fork
      ctx.lineWidth *= 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size * 0.24, cy + Math.sin(a) * size * 0.24);
      ctx.lineTo(cx + Math.cos(a + 0.22) * size * 0.48, cy + Math.sin(a + 0.22) * size * 0.48);
      ctx.stroke();
    }
  } else if (type === 'spines') {
    for (let i = 0; i < 700; i++) {
      const a = rng.f() * TAU;
      const r = Math.sqrt(rng.f()) * size * 0.48;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.globalAlpha = rng.range(0.2, 0.55);
      ctx.strokeStyle = shade(col, -0.2);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(-3, 3), y + rng.range(4, 10));
      ctx.stroke();
    }
  } else if (type === 'wrinkles') {
    for (let i = 0; i < 30; i++) {
      ctx.globalAlpha = rng.range(0.1, 0.3);
      ctx.strokeStyle = shade(col, -0.35);
      ctx.lineWidth = rng.range(2, 8);
      ctx.beginPath();
      let x = rng.f() * size;
      let y = rng.f() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += rng.range(-26, 26);
        y += rng.range(-26, 26);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawStem(
  ctx: CanvasRenderingContext2D,
  sp: Species,
  rng: RNG,
  size: number
) {
  const v = sp.visual;
  ctx.fillStyle = v.stemColor;
  ctx.fillRect(0, 0, size, size);
  paintMottle(ctx, size, size, v.stemColor, 0.06, 10, strSeed(sp.id + 'stem'), 0.7);
  // longitudinal fibres
  for (let i = 0; i < 190; i++) {
    const x = rng.f() * size;
    ctx.globalAlpha = rng.range(0.05, 0.2);
    ctx.strokeStyle = rng.chance(0.6) ? v.stemColor2 : shade(v.stemColor, 0.2);
    ctx.lineWidth = rng.range(0.6, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rng.range(-6, 6), size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (v.stemSurface === 'scabers') {
    for (let i = 0; i < 70; i++) {
      const x = rng.f() * size;
      const y = rng.f() * size;
      ctx.globalAlpha = rng.range(0.4, 0.95);
      ctx.fillStyle = v.stemColor2;
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(2, 6), rng.range(1.5, 4), rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
  } else if (v.stemSurface === 'reticulate') {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = shade(v.stemColor, 0.35);
    for (let i = 0; i < 14; i++) {
      const y = (i / 14) * size;
      ctx.lineWidth = rng.range(1.5, 3.5);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin(x * 0.06 + i) * 8;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = shade(v.stemColor2, -0.1);
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(rng.f() * size, 0);
      ctx.lineTo(rng.f() * size, size);
      ctx.stroke();
    }
  } else if (v.stemSurface === 'banded') {
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = rng.range(0.15, 0.45);
      ctx.fillStyle = v.stemColor2;
      const y = rng.f() * size;
      const h = rng.range(6, 22);
      ctx.beginPath();
      ctx.ellipse(rng.f() * size, y, rng.range(20, 50), h, rng.range(-0.1, 0.1), 0, TAU);
      ctx.fill();
    }
  } else if (v.stemSurface === 'glandular') {
    for (let i = 0; i < 120; i++) {
      ctx.globalAlpha = rng.range(0.2, 0.6);
      ctx.fillStyle = shade(v.stemColor2, -0.15);
      ctx.beginPath();
      ctx.arc(rng.f() * size, rng.f() * size, rng.range(1, 3), 0, TAU);
      ctx.fill();
    }
  } else if (v.stemSurface === 'shaggy') {
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = rng.range(0.15, 0.4);
      ctx.fillStyle = shade(v.stemColor, -0.2);
      ctx.beginPath();
      ctx.ellipse(rng.f() * size, rng.f() * size, rng.range(3, 9), rng.range(2, 5), rng.f() * TAU, 0, TAU);
      ctx.fill();
    }
  }
  // base darkening
  const grad = ctx.createLinearGradient(0, size, 0, size * 0.55);
  grad.addColorStop(0, 'rgba(20,14,8,0.35)');
  grad.addColorStop(1, 'rgba(20,14,8,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

export function mushroomAtlas(sp: Species, variant: number): TexPair {
  const key = `mushatlas:${sp.id}:${variant}`;
  const hit = canvasCache.get(key);
  if (hit) return { map: hit, bump: canvasCache.get(key + ':bump')! };
  const S = 512;
  const T = 256;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(sp.id + ':' + variant));

  // tile backgrounds
  ctx.fillStyle = sp.visual.capColor;
  ctx.fillRect(0, 0, T, T);
  drawCapPattern(ctx, sp, rng, T, sp.visual.capColor);

  ctx.save();
  ctx.translate(T, 0);
  drawHymenium(ctx, sp, new RNG(strSeed(sp.id + 'h' + variant)), T);
  ctx.restore();

  ctx.save();
  ctx.translate(0, T);
  drawStem(ctx, sp, new RNG(strSeed(sp.id + 's' + variant)), T);
  ctx.restore();

  // extra tile: ring / volva / flesh
  ctx.save();
  ctx.translate(T, T);
  ctx.fillStyle = sp.visual.fleshColor;
  ctx.fillRect(0, 0, T, T);
  paintMottle(ctx, T, T, sp.visual.fleshColor, 0.04, 12, strSeed(sp.id + 'x'), 0.8);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = shade(sp.visual.fleshColor, -0.35);
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    ctx.moveTo(rng.f() * T, rng.f() * T);
    ctx.lineTo(rng.f() * T, rng.f() * T);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // gentle global shading so tile borders never show as seams
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(0, i * T, T, 1);
    ctx.fillRect(i * T, 0, 1, S);
  }
  ctx.globalAlpha = 1;

  const map = toTexture(c, true, false);
  const bump = bumpFrom(c, 1.1);
  canvasCache.set(key, map);
  canvasCache.set(key + ':bump', bump);
  return { map, bump };
}

/* ------------------------------------------------------------------ */
/* Sprite-ish helpers                                                  */
/* ------------------------------------------------------------------ */

export function shadowTexture(): THREE.Texture {
  const key = 'shadow';
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 128;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function mistTexture(): THREE.Texture {
  const key = 'mist';
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function rainStreakTexture(): THREE.Texture {
  const key = 'rainstreak';
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(16, 64);
  const ctx = ctx2d(c);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(220,235,255,0)');
  g.addColorStop(0.5, 'rgba(220,235,255,0.85)');
  g.addColorStop(1, 'rgba(220,235,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(4, 0, 8, 64);
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function leafSpriteTexture(kind: TreeKind): THREE.Texture {
  const key = `leafsprite:${kind}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 128;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const rng = new RNG(strSeed(key));
  ctx.clearRect(0, 0, S, S);
  const cols: Record<string, string[]> = {
    spruce: ['#3f4a2e', '#55633a', '#2f3a24'],
    pine: ['#4a5230', '#657039', '#39422a'],
    beech: ['#8a6a2c', '#a37a32', '#6b5222', '#5a4a26'],
    oak: ['#6b5a22', '#8a6d28', '#4f441c'],
    birch: ['#9a9448', '#b0a850', '#7a7638'],
  };
  const list = cols[kind];
  for (let i = 0; i < 14; i++) {
    ctx.save();
    ctx.translate(S / 2 + rng.range(-24, 24), S / 2 + rng.range(-24, 24));
    ctx.rotate(rng.f() * TAU);
    ctx.fillStyle = list[Math.floor(rng.f() * list.length)];
    ctx.globalAlpha = rng.range(0.7, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, rng.range(10, 22), rng.range(5, 12), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function dropletTexture(): THREE.Texture {
  const key = 'droplet';
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 64;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(S * 0.4, S * 0.35, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(200,225,235,0.35)');
  g.addColorStop(1, 'rgba(160,190,205,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S * 0.34, S * 0.42, 0, 0, TAU);
  ctx.fill();
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function compassTexture(): THREE.Texture {
  const key = 'compass';
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = makeCanvas(S);
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(230,226,210,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    const len = i % 6 === 0 ? 14 : 7;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.42, S / 2 + Math.sin(a) * S * 0.42);
    ctx.lineTo(S / 2 + Math.cos(a) * (S * 0.42 - len), S / 2 + Math.sin(a) * (S * 0.42 - len));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,226,210,0.9)';
  ctx.font = '600 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', S / 2, S * 0.14);
  const t = toTexture(c, true, false);
  canvasCache.set(key, t);
  return t;
}

export function disposeTextureCache() {
  for (const t of canvasCache.values()) t.dispose();
  canvasCache.clear();
}
