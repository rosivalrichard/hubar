/* Dev-only: renders every species side by side for visual checks. Open /gallery.html?stage=mature&view=side */
import * as THREE from 'three';
import { ALL_SPECIES } from '../data/species';
import { buildMushroomVisual, type GrowthStage } from '../three/mushroom';
import { NO_SHAPE, type ShapeMods } from '../game/specimens';
const SHAPES: Record<string, Partial<ShapeMods>> = {
  wide: { capMul: 1.7, stemHMul: 0.95 },
  thick: { stemWMul: 2.1, stemHMul: 0.9 },
  twins: { count: 2, fused: true },
  cluster: { count: 11 },
  symmetric: { symmetric: true },
};

const q = new URLSearchParams(location.search);
const stage = (q.get('stage') || 'mature') as GrowthStage;
const view = q.get('view') || 'side';
const only = q.get('only');
const list = only ? ALL_SPECIES.filter((s) => only.split(',').includes(s.id)) : ALL_SPECIES;
const cols = Number(q.get('cols') || 6);
const tile = Number(q.get('tile') || 220);
const rows = Math.ceil(list.length / cols);
const W = cols * tile;
const H = rows * tile;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setScissorTest(true);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const labels = document.getElementById('labels')!;
list.forEach((sp, i) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2f24);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f1f, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(0.6, 1.2, 0.8);
  sun.castShadow = true;
  sun.shadow.bias = Number(q.get('bias') ?? -0.0004);
  sun.shadow.normalBias = Number(q.get('nbias') ?? 0.02);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -0.6; sun.shadow.camera.right = sun.shadow.camera.top = 0.6;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2, 32), new THREE.MeshStandardMaterial({ color: 0x3b3326, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const shapeName = q.get('shape') || '';
  const shape: ShapeMods = SHAPES[shapeName] ? { ...NO_SHAPE, ...SHAPES[shapeName] } : NO_SHAPE;
  const v = buildMushroomVisual(sp, stage, Number(q.get('variant') || 0), false, 1, shape);
  scene.add(v.group);
  const box = new THREE.Box3().setFromObject(v.mesh);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.9 + 0.02;
  const cam = new THREE.PerspectiveCamera(35, 1, 0.005, 20);
  const el = view === 'top' ? 1.2 : view === 'under' ? -0.25 : 0.28;
  cam.position.set(c.x + r * 2.2 * Math.cos(el), c.y + r * 2.2 * Math.sin(el), c.z + r * 0.6);
  cam.lookAt(c);
  sun.target = v.group;
  const x = (i % cols) * tile;
  const y = Math.floor(i / cols) * tile;
  renderer.setViewport(x, H - y - tile, tile, tile);
  renderer.setScissor(x, H - y - tile, tile, tile);
  renderer.render(scene, cam);
  const d = document.createElement('div');
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  d.textContent = `${sp.sk} · ${sp.form} · h=${size.y.toFixed(3)}`;
  labels.appendChild(d);
});
(window as unknown as { galleryDone: boolean }).galleryDone = true;

import { mushroomAtlas } from '../three/textures';
if (q.get('atlas')) {
  const sp = ALL_SPECIES.find((s) => s.id === q.get('atlas'))!;
  const at = mushroomAtlas(sp, 0);
  for (const t of [at.map, at.bump]) {
    const img = document.createElement('img');
    img.src = (t.image as HTMLCanvasElement).toDataURL();
    img.style.cssText = 'position:absolute;top:0;width:512px;left:' + (t === at.map ? 0 : 520) + 'px;z-index:9';
    document.body.appendChild(img);
  }
}
