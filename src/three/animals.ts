/* Procedural low-poly wildlife models with animatable parts. No external assets. */

import * as THREE from 'three';

export type AnimalKind =
  | 'reddeer'
  | 'roedeer'
  | 'boar'
  | 'piglet'
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

export interface AnimalRig {
  root: THREE.Group; // positioned on the ground, faces +Z
  body: THREE.Group; // bobs / rolls
  head: THREE.Group | null;
  legs: THREE.Group[]; // FL, FR, HL, HR (pivot at hip)
  tail: THREE.Group | null;
  wings: THREE.Group[]; // L, R (pivot at shoulder)
  curl: THREE.Group | null; // hedgehog ball
  height: number; // shoulder / standing height in metres
}

const matCache = new Map<string, THREE.Material>();
function mat(color: string, rough = 0.95): THREE.Material {
  const k = color + rough;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    matCache.set(k, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function sphere(seg = 12) {
  const k = 's' + seg;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    geoCache.set(k, g);
  }
  return g;
}
function cyl(top: number, bottom: number, seg = 8) {
  const k = `c${top.toFixed(2)}:${bottom.toFixed(2)}:${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(top, bottom, 1, seg, 1);
    g.translate(0, -0.5, 0); // hangs down from its pivot
    geoCache.set(k, g);
  }
  return g;
}
function cone(seg = 8) {
  const k = 'k' + seg;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.ConeGeometry(1, 1, seg);
    geoCache.set(k, g);
  }
  return g;
}

function blob(color: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, seg = 12, rough = 0.95) {
  const m = new THREE.Mesh(sphere(seg), mat(color, rough));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = sx > 0.12;
  return m;
}

function limb(color: string, len: number, rTop: number, rBot: number, hoof?: string) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(cyl(1, rBot / rTop, 7), mat(color));
  m.scale.set(rTop, len, rTop);
  m.castShadow = len > 0.3;
  g.add(m);
  if (hoof) {
    const h = blob(hoof, rBot * 1.1, rBot * 0.8, rBot * 1.3, 0, -len, rBot * 0.2, 6);
    g.add(h);
  }
  return g;
}

function rig(height: number): AnimalRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, head: null, legs: [], tail: null, wings: [], curl: null, height };
}

/* ---------------- quadrupeds ---------------- */

interface QuadSpec {
  len: number; // body length
  girth: number; // body radius
  leg: number; // leg length (hip to ground)
  legR: number;
  coat: string;
  belly: string;
  legCol: string;
  hoof?: string;
  neck: number;
  neckUp: number; // radians up from horizontal
  headLen: number;
  headR: number;
  snout: string;
  ear: number;
  earCol?: string;
  tail: number;
  tailR: number;
  tailCol?: string;
  tailTip?: string;
  rump?: string;
  antlers?: 'red' | 'roe' | null;
  tusks?: boolean;
  stripes?: string;
}

function quadruped(s: QuadSpec): AnimalRig {
  const r = rig(s.leg + s.girth);
  const hipY = s.leg;
  r.body.position.y = hipY;
  // torso: chest a bit higher and deeper than the hindquarters
  r.body.add(blob(s.coat, s.girth, s.girth * 0.95, s.len * 0.5, 0, s.girth * 0.25, 0, 14));
  r.body.add(blob(s.coat, s.girth * 1.02, s.girth * 1.05, s.girth * 1.1, 0, s.girth * 0.32, s.len * 0.3, 12));
  r.body.add(blob(s.belly, s.girth * 0.8, s.girth * 0.55, s.len * 0.42, 0, -s.girth * 0.18, 0.02, 10));
  if (s.rump) r.body.add(blob(s.rump, s.girth * 0.62, s.girth * 0.62, s.girth * 0.3, 0, s.girth * 0.3, -s.len * 0.46, 10));
  if (s.stripes) {
    for (let i = -2; i <= 2; i++) r.body.add(blob(s.stripes, s.girth * 0.18, s.girth * 0.05, s.len * 0.42, i * s.girth * 0.3, s.girth * 1.12 - Math.abs(i) * s.girth * 0.12, 0, 6));
  }

  // legs
  const lx = s.girth * 0.55;
  const fz = s.len * 0.32;
  const hz = -s.len * 0.32;
  for (const [x, z] of [[lx, fz], [-lx, fz], [lx, hz], [-lx, hz]] as [number, number][]) {
    const l = limb(s.legCol, s.leg + s.girth * 0.1, s.legR, s.legR * 0.55, s.hoof);
    l.position.set(x, s.girth * 0.1, z);
    r.body.add(l);
    r.legs.push(l);
  }

  // neck + head
  const neck = new THREE.Group();
  neck.position.set(0, s.girth * 0.55, s.len * 0.42);
  neck.rotation.x = -s.neckUp;
  r.body.add(neck);
  if (s.neck > 0.01) {
    const nm = blob(s.coat, s.girth * 0.5, s.girth * 0.55, s.neck * 0.62, 0, 0, s.neck * 0.45, 10);
    neck.add(nm);
  }
  const head = new THREE.Group();
  head.position.set(0, 0, s.neck);
  head.rotation.x = s.neckUp * 0.85; // head roughly level
  neck.add(head);
  head.add(blob(s.coat, s.headR, s.headR * 0.95, s.headLen * 0.5, 0, 0, s.headLen * 0.3, 10));
  const muzzle = blob(s.snout, s.headR * 0.62, s.headR * 0.6, s.headLen * 0.35, 0, -s.headR * 0.15, s.headLen * 0.78, 8);
  head.add(muzzle);
  head.add(blob('#121212', s.headR * 0.12, s.headR * 0.12, s.headR * 0.12, s.headR * 0.62, s.headR * 0.28, s.headLen * 0.45, 6, 0.3));
  head.add(blob('#121212', s.headR * 0.12, s.headR * 0.12, s.headR * 0.12, -s.headR * 0.62, s.headR * 0.28, s.headLen * 0.45, 6, 0.3));
  for (const side of [1, -1]) {
    const e = new THREE.Mesh(cone(6), mat(s.earCol ?? s.coat));
    e.scale.set(s.ear * 0.4, s.ear, s.ear * 0.18);
    e.position.set(side * s.headR * 0.6, s.headR * 0.8, s.headLen * 0.05);
    e.rotation.z = -side * 0.5;
    head.add(e);
  }
  if (s.tusks) {
    for (const side of [1, -1]) {
      const t = new THREE.Mesh(cone(5), mat('#e9e2cf', 0.5));
      t.scale.set(0.012, 0.07, 0.012);
      t.position.set(side * s.headR * 0.45, -s.headR * 0.2, s.headLen * 0.85);
      t.rotation.x = -0.6;
      head.add(t);
    }
  }
  if (s.antlers) {
    const ac = mat('#cdbb98', 0.8);
    const main = s.antlers === 'red' ? 0.75 : 0.22;
    for (const side of [1, -1]) {
      const beam = new THREE.Group();
      beam.position.set(side * s.headR * 0.4, s.headR * 0.8, s.headLen * 0.1);
      beam.rotation.set(-0.35, 0, -side * 0.38);
      head.add(beam);
      const b = new THREE.Mesh(cyl(1, 0.6, 6), ac);
      b.scale.set(main * 0.05, main, main * 0.05);
      b.rotation.x = Math.PI;
      beam.add(b);
      const tines = s.antlers === 'red' ? 4 : 2;
      for (let i = 1; i <= tines; i++) {
        const t = new THREE.Mesh(cyl(1, 0.5, 5), ac);
        const len = main * (s.antlers === 'red' ? 0.32 : 0.45);
        t.scale.set(main * 0.03, len, main * 0.03);
        t.position.set(0, (i / (tines + 0.5)) * main, 0);
        t.rotation.set(Math.PI - 0.9, 0, side * 0.1);
        beam.add(t);
      }
    }
  }
  r.head = neck; // animate the neck pivot (grazing lowers the whole neck)

  // tail
  if (s.tail > 0.01) {
    const tg = new THREE.Group();
    tg.position.set(0, s.girth * 0.55, -s.len * 0.5);
    r.body.add(tg);
    const t = blob(s.tailCol ?? s.coat, s.tailR, s.tailR, s.tail * 0.5, 0, 0, -s.tail * 0.45, 8);
    tg.add(t);
    if (s.tailTip) tg.add(blob(s.tailTip, s.tailR * 0.8, s.tailR * 0.8, s.tail * 0.16, 0, 0, -s.tail * 0.92, 6));
    tg.rotation.x = 0.5;
    r.tail = tg;
  }
  return r;
}

/* ---------------- small creatures ---------------- */

function bird(body: string, wing: string, head: string, size: number, extra?: (r: AnimalRig) => void): AnimalRig {
  const r = rig(size);
  r.body.position.y = size * 0.45;
  r.body.add(blob(body, size * 0.32, size * 0.3, size * 0.5, 0, 0, 0, 10));
  const h = new THREE.Group();
  h.position.set(0, size * 0.25, size * 0.38);
  r.body.add(h);
  h.add(blob(head, size * 0.24, size * 0.24, size * 0.24, 0, 0, 0, 10));
  const beak = new THREE.Mesh(cone(5), mat('#2b2620', 0.6));
  beak.scale.set(size * 0.05, size * 0.16, size * 0.05);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -size * 0.02, size * 0.26);
  h.add(beak);
  h.add(blob('#0d0d0d', size * 0.04, size * 0.04, size * 0.04, size * 0.13, size * 0.06, size * 0.14, 6, 0.3));
  h.add(blob('#0d0d0d', size * 0.04, size * 0.04, size * 0.04, -size * 0.13, size * 0.06, size * 0.14, 6, 0.3));
  r.head = h;
  for (const side of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(side * size * 0.22, size * 0.12, size * 0.05);
    r.body.add(w);
    const wm = blob(wing, size * 0.42, size * 0.05, size * 0.26, side * size * 0.34, 0, -size * 0.05, 8);
    w.add(wm);
    w.userData.side = side;
    w.rotation.y = side * 1.25; // folded back along the body; flight sets this to 0 and flaps around z
    r.wings.push(w);
  }
  const t = new THREE.Group();
  t.position.set(0, size * 0.05, -size * 0.42);
  r.body.add(t);
  t.add(blob(wing, size * 0.14, size * 0.04, size * 0.3, 0, 0, -size * 0.22, 6));
  t.rotation.x = 0.25;
  r.tail = t;
  for (const side of [1, -1]) {
    const l = limb('#3a3026', size * 0.32, size * 0.025, size * 0.02);
    l.position.set(side * size * 0.1, -size * 0.2, size * 0.02);
    r.body.add(l);
    r.legs.push(l);
  }
  extra?.(r);
  return r;
}

function squirrel(): AnimalRig {
  const r = rig(0.14);
  r.body.position.y = 0.09;
  r.body.add(blob('#8b3d1e', 0.06, 0.065, 0.11, 0, 0.02, 0, 10));
  r.body.add(blob('#e9dcc4', 0.045, 0.05, 0.08, 0, -0.01, 0.03, 8));
  const h = new THREE.Group();
  h.position.set(0, 0.06, 0.1);
  r.body.add(h);
  h.add(blob('#8b3d1e', 0.045, 0.045, 0.05, 0, 0, 0.01, 10));
  h.add(blob('#101010', 0.01, 0.01, 0.01, 0.03, 0.015, 0.035, 6, 0.3));
  h.add(blob('#101010', 0.01, 0.01, 0.01, -0.03, 0.015, 0.035, 6, 0.3));
  for (const side of [1, -1]) {
    const e = new THREE.Mesh(cone(5), mat('#7a3216'));
    e.scale.set(0.012, 0.04, 0.008);
    e.position.set(side * 0.025, 0.05, -0.005);
    h.add(e);
  }
  r.head = h;
  // big bushy tail curling up over the back
  const tail = new THREE.Group();
  tail.position.set(0, 0.03, -0.1);
  r.body.add(tail);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    tail.add(blob('#8e4422', 0.028 + t * 0.012, 0.028 + t * 0.012, 0.032, 0, Math.sin(t * 2.4) * 0.12, -Math.cos(t * 2.4) * 0.05 - 0.02, 8));
  }
  r.tail = tail;
  for (const [x, z, len] of [[0.035, 0.06, 0.07], [-0.035, 0.06, 0.07], [0.04, -0.06, 0.09], [-0.04, -0.06, 0.09]] as [number, number, number][]) {
    const l = limb('#7a3216', len, 0.014, 0.01);
    l.position.set(x, -0.01, z);
    r.body.add(l);
    r.legs.push(l);
  }
  return r;
}

function hedgehog(): AnimalRig {
  const r = rig(0.12);
  r.body.position.y = 0.06;
  const spines = blob('#5b4a38', 0.1, 0.075, 0.14, 0, 0.02, -0.01, 12, 1);
  r.body.add(spines);
  // spine tips
  const tipMat = mat('#d8cbb2');
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 * 3.7;
    const t = (i % 10) / 10;
    const c = new THREE.Mesh(cone(4), tipMat);
    c.scale.set(0.006, 0.03, 0.006);
    const y = 0.02 + Math.sin(t * Math.PI * 0.5 + 0.2) * 0.07;
    c.position.set(Math.cos(a) * 0.08 * (1 - t * 0.3), y, Math.sin(a) * 0.11 * (1 - t * 0.3) - 0.01);
    c.lookAt(c.position.clone().multiplyScalar(2));
    c.rotateX(Math.PI / 2);
    r.body.add(c);
  }
  const h = new THREE.Group();
  h.position.set(0, -0.005, 0.12);
  r.body.add(h);
  h.add(blob('#b79c7c', 0.04, 0.035, 0.05, 0, 0, 0.01, 8));
  h.add(blob('#121212', 0.012, 0.012, 0.012, 0, -0.005, 0.06, 6, 0.3));
  r.head = h;
  for (const [x, z] of [[0.05, 0.05], [-0.05, 0.05], [0.05, -0.06], [-0.05, -0.06]] as [number, number][]) {
    const l = limb('#3e3226', 0.04, 0.012, 0.01);
    l.position.set(x, -0.02, z);
    r.body.add(l);
    r.legs.push(l);
  }
  r.curl = r.body;
  return r;
}

function butterfly(color: string, edge: string): AnimalRig {
  const r = rig(0.03);
  r.body.add(blob('#1d1a16', 0.006, 0.006, 0.022, 0, 0, 0, 6));
  for (const side of [1, -1]) {
    const w = new THREE.Group();
    r.body.add(w);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.03, 0.03, 0.05, 0.01, 0.045, -0.012);
    shape.bezierCurveTo(0.035, -0.035, 0.012, -0.03, 0, 0);
    const g = new THREE.ShapeGeometry(shape, 6);
    g.rotateX(-Math.PI / 2);
    if (side < 0) g.scale(-1, 1, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8, emissive: edge, emissiveIntensity: 0.08 }));
    w.add(m);
    r.wings.push(w);
  }
  return r;
}

function snail(): AnimalRig {
  const r = rig(0.03);
  r.body.add(blob('#8e8270', 0.012, 0.008, 0.035, 0, 0.007, 0.005, 8, 0.4));
  const shell = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.008, 8, 14, Math.PI * 1.9), mat('#9b6b3d', 0.5));
  shell.position.set(0, 0.02, -0.005);
  shell.rotation.y = Math.PI / 2;
  r.body.add(shell);
  r.body.add(blob('#7c5530', 0.01, 0.01, 0.01, 0, 0.02, -0.005, 8, 0.5));
  for (const side of [1, -1]) {
    const t = new THREE.Mesh(cyl(1, 0.6, 4), mat('#8e8270', 0.4));
    t.scale.set(0.0015, 0.014, 0.0015);
    t.position.set(side * 0.004, 0.024, 0.035);
    t.rotation.x = Math.PI - 0.5;
    r.body.add(t);
  }
  return r;
}

function frog(): AnimalRig {
  const r = rig(0.04);
  r.body.position.y = 0.02;
  r.body.add(blob('#5d6b34', 0.03, 0.02, 0.038, 0, 0.005, 0, 10, 0.5));
  r.body.add(blob('#c9b98a', 0.024, 0.012, 0.03, 0, -0.006, 0.004, 8, 0.6));
  r.body.add(blob('#c8a83a', 0.008, 0.008, 0.008, 0.016, 0.02, 0.022, 6, 0.3));
  r.body.add(blob('#c8a83a', 0.008, 0.008, 0.008, -0.016, 0.02, 0.022, 6, 0.3));
  for (const [x, z, len] of [[0.022, 0.02, 0.02], [-0.022, 0.02, 0.02], [0.028, -0.025, 0.03], [-0.028, -0.025, 0.03]] as [number, number, number][]) {
    const l = limb('#4f5b2c', len, 0.006, 0.005);
    l.position.set(x, 0, z);
    l.rotation.z = x > 0 ? -0.9 : 0.9;
    r.body.add(l);
    r.legs.push(l);
  }
  return r;
}

export function buildAnimal(kind: AnimalKind, variant = 0): AnimalRig {
  switch (kind) {
    case 'reddeer':
      return quadruped({ len: 1.55, girth: 0.32, leg: 0.92, legR: 0.05, coat: '#7a4a2c', belly: '#a98a68', legCol: '#5f3a22', hoof: '#1d1712', neck: 0.6, neckUp: 1.05, headLen: 0.42, headR: 0.12, snout: '#3b2a1e', ear: 0.15, tail: 0.12, tailR: 0.04, rump: '#d8c49e', antlers: variant % 2 ? 'red' : null });
    case 'roedeer':
      return quadruped({ len: 0.95, girth: 0.2, leg: 0.55, legR: 0.03, coat: variant % 3 === 2 ? '#6d5a46' : '#9a5a2f', belly: '#c9a985', legCol: '#7c4a28', hoof: '#1d1712', neck: 0.34, neckUp: 1.05, headLen: 0.26, headR: 0.075, snout: '#2a211a', ear: 0.11, tail: 0.02, tailR: 0.02, rump: '#efe6d6', antlers: variant % 2 ? 'roe' : null });
    case 'boar':
      return quadruped({ len: 1.15, girth: 0.33, leg: 0.42, legR: 0.055, coat: '#3a322b', belly: '#2d2722', legCol: '#2a241f', hoof: '#111', neck: 0.08, neckUp: -0.15, headLen: 0.5, headR: 0.17, snout: '#5a4a40', ear: 0.11, earCol: '#2d2621', tail: 0.2, tailR: 0.02, tusks: true });
    case 'piglet':
      return quadruped({ len: 0.38, girth: 0.11, leg: 0.14, legR: 0.02, coat: '#7b5a3c', belly: '#5f472f', legCol: '#3d2e22', hoof: '#111', neck: 0.02, neckUp: -0.1, headLen: 0.17, headR: 0.06, snout: '#6d5848', ear: 0.04, tail: 0.06, tailR: 0.008, stripes: '#d8bf8f' });
    case 'fox':
      return quadruped({ len: 0.55, girth: 0.11, leg: 0.3, legR: 0.022, coat: '#c0632a', belly: '#f0e6d6', legCol: '#2a1f18', neck: 0.14, neckUp: 0.6, headLen: 0.2, headR: 0.065, snout: '#efe4d2', ear: 0.08, earCol: '#2a1f18', tail: 0.42, tailR: 0.06, tailCol: '#c56a2f', tailTip: '#f4efe6' });
    case 'hare':
      return quadruped({ len: 0.42, girth: 0.11, leg: 0.16, legR: 0.025, coat: '#8a7556', belly: '#ddd2bd', legCol: '#7b6748', neck: 0.05, neckUp: 0.7, headLen: 0.13, headR: 0.06, snout: '#a1906f', ear: 0.15, earCol: '#7b6748', tail: 0.05, tailR: 0.03, tailCol: '#f1ece3' });
    case 'squirrel':
      return squirrel();
    case 'hedgehog':
      return hedgehog();
    case 'songbird':
      return bird(variant % 2 ? '#8a6a52' : '#6f7a52', variant % 2 ? '#5a4636' : '#4d5a3a', variant % 2 ? '#3a4a6a' : '#5c6b44', 0.13);
    case 'jay':
      return bird('#b39a86', '#2f4f8a', '#cbb7a5', 0.2);
    case 'woodpecker':
      return bird('#151515', '#f2f2f2', '#121212', 0.2, (r) => {
        r.head!.add(blob('#c8202a', 0.03, 0.025, 0.03, 0, 0.03, -0.02, 6));
        r.body.add(blob('#c8202a', 0.04, 0.03, 0.04, 0, -0.03, -0.08, 6));
      });
    case 'owl': {
      const r = bird('#7a5c40', '#6b4e34', '#7d5f43', 0.36);
      r.head!.scale.setScalar(1.35);
      r.head!.add(blob('#d9c7a5', 0.05, 0.05, 0.02, 0.04, 0.0, 0.07, 8));
      r.head!.add(blob('#d9c7a5', 0.05, 0.05, 0.02, -0.04, 0.0, 0.07, 8));
      r.body.rotation.x = -1.1; // upright perching posture
      r.head!.rotation.x = 1.1;
      return r;
    }
    case 'butterfly': {
      const pal = [
        ['#e0782a', '#2a1a10'],
        ['#f2efe2', '#8a8a7a'],
        ['#6f8fd8', '#203060'],
        ['#e3c840', '#5a4a10'],
      ][variant % 4];
      return butterfly(pal[0], pal[1]);
    }
    case 'snail':
      return snail();
    case 'frog':
      return frog();
  }
}
