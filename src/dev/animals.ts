/* Dev-only: renders every animal model for visual checks. */
import * as THREE from 'three';
import { buildAnimal, type AnimalKind } from '../three/animals';

const kinds: [AnimalKind, number][] = [
  ['reddeer', 1], ['reddeer', 0], ['roedeer', 1], ['roedeer', 0], ['boar', 0], ['piglet', 0], ['fox', 0], ['hare', 0],
  ['squirrel', 0], ['hedgehog', 0], ['songbird', 0], ['jay', 0], ['woodpecker', 0], ['owl', 0], ['butterfly', 0], ['butterfly', 2], ['snail', 0], ['frog', 0],
];
const cols = 6, tile = 220, rows = Math.ceil(kinds.length / cols);
const W = cols * tile, H = rows * tile;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const labels = document.getElementById('labels')!;
kinds.forEach(([k, v], i) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2f24);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f1f, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  const r = buildAnimal(k, v);
  scene.add(r.root);
  const box = new THREE.Box3().setFromObject(r.root);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z) * 1.6 + 0.02;
  const cam = new THREE.PerspectiveCamera(35, 1, 0.002, 50);
  cam.position.set(c.x + d * 1.1, c.y + d * 0.35, c.z + d * 0.9);
  cam.lookAt(c);
  const x = (i % cols) * tile, y = Math.floor(i / cols) * tile;
  renderer.setViewport(x, H - y - tile, tile, tile);
  renderer.setScissor(x, H - y - tile, tile, tile);
  renderer.render(scene, cam);
  const el = document.createElement('div');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.textContent = `${k} ${v} · h=${size.y.toFixed(2)}m`;
  labels.appendChild(el);
});
(window as unknown as { galleryDone: boolean }).galleryDone = true;
