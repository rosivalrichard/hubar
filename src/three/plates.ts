/* Offscreen specimen plates rendered from the actual mushroom meshes. */

import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/species';
import type { Species } from '../data/species-types';
import { buildMushroomGeometry, materialForSpecies } from './mushroom';
import { shadowTexture } from './textures';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let pivot: THREE.Group | null = null;
const cache = new Map<string, string>();
let failed = false;

function init() {
  if (renderer || failed) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(512, 512, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(28, 1, 0.005, 12);
    pivot = new THREE.Group();
    scene.add(pivot);

    const key = new THREE.DirectionalLight(0xfff0d6, 3.1);
    key.position.set(-1.2, 2.2, 1.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8c8, 1.2);
    fill.position.set(1.8, 0.8, 1.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe8dcc0, 2.2);
    rim.position.set(0.4, 1.4, -2.2);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xc4d2c8, 0x3a3226, 1.4));
  } catch (e) {
    failed = true;
    console.warn('plate renderer unavailable', e);
  }
}

export type PlateView = 'side' | 'under';

export function speciesPlate(speciesId: string, view: PlateView = 'side', size = 512): string {
  const key = `${speciesId}:${view}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const sp: Species = SPECIES_BY_ID[speciesId];
  if (!sp) return '';
  init();
  if (!renderer || !scene || !camera || !pivot) return '';
  pivot.clear();
  const stage = view === 'under' ? 'mature' : 'mature';
  const geo = buildMushroomGeometry(sp, stage, 1);
  const mat = materialForSpecies(sp, 1, false);
  const mesh = new THREE.Mesh(geo, mat);
  pivot.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.4, depthWrite: false, color: 0x000000 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.002;
  pivot.add(shadow);

  const box = new THREE.Box3().setFromObject(mesh);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(0.035, sphere.radius);
  shadow.scale.setScalar(radius * 3.4);
  pivot.position.set(0, -sphere.center.y + radius * 0.02, 0);
  pivot.rotation.set(0, 0.55, 0);
  const dist = radius * 3.1;
  if (view === 'under') {
    camera.position.set(-dist * 0.25, -dist * 0.12, dist * 0.92);
  } else {
    camera.position.set(-dist * 0.42, dist * 0.52, dist * 0.86);
  }
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.003, dist * 0.1);
  camera.far = dist * 8;
  camera.updateProjectionMatrix();
  renderer.setSize(size, size, false);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function plateAvailable() {
  init();
  return !!renderer;
}
