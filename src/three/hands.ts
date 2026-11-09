/* First-person viewmodel: hands, sleeves, knife and basket. Rendered on top of the world. */

import * as THREE from 'three';
import { damp, lerp, clamp, TAU } from '../core/util';

const SKIN = '#b9907a';
const SKIN_DARK = '#a87f68';

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function makeHand(mirror: boolean, skinMat: THREE.Material, sleeveMat: THREE.Material) {
  const g = new THREE.Group();
  const side = mirror ? -1 : 1;

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skinMat);
  palm.scale.set(1.15, 0.55, 1.25);
  g.add(palm);

  const wrist = capsule(0.042, 0.09, skinMat);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, -0.005, 0.085);
  g.add(wrist);

  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.3, 10), skinMat);
  forearm.rotation.x = Math.PI / 2;
  forearm.position.set(0, -0.01, 0.26);
  g.add(forearm);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.082, 0.34, 10), sleeveMat);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(0, -0.012, 0.4);
  g.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14), sleeveMat);
  cuff.position.set(0, -0.01, 0.235);
  cuff.rotation.x = Math.PI / 2;
  g.add(cuff);

  // fingers curl forward/down, thumb to the side
  const fingerAngles = [-0.35, -0.12, 0.12, 0.34];
  fingerAngles.forEach((a, i) => {
    const len = i === 0 ? 0.055 : i === 3 ? 0.062 : 0.07;
    const f = new THREE.Group();
    f.position.set(side * a * 0.07 * 2.0, 0.005, -0.055);
    f.rotation.z = a * 0.5;
    const seg1 = capsule(0.0135, len, skinMat);
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = -len / 2;
    f.add(seg1);
    const knuckle = new THREE.Group();
    knuckle.position.z = -len - 0.008;
    knuckle.rotation.x = -0.55;
    const seg2 = capsule(0.012, len * 0.85, skinMat);
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = -len * 0.42;
    knuckle.add(seg2);
    f.add(knuckle);
    f.userData.knuckle = knuckle;
    g.add(f);
  });

  const thumb = capsule(0.016, 0.06, skinMat);
  thumb.rotation.z = side * 0.8;
  thumb.rotation.x = 0.7;
  thumb.position.set(side * -0.055, 0.0, -0.03);
  g.add(thumb);

  return g;
}

export class Hands {
  group = new THREE.Group();
  private left: THREE.Group;
  private right: THREE.Group;
  private knife: THREE.Group;
  private basket: THREE.Group;
  private flashlight: THREE.Group;
  private lastBob = 0;
  private sway = new THREE.Vector2();
  private reach = 0;
  private reachDir = 1;
  private mode: 'idle' | 'walk' | 'run' | 'crouch' = 'idle';
  private basketOpen = 0;
  private flashlightOn = false;
  tool: 'none' | 'knife' | 'basket' | 'flashlight' | 'camera' = 'none';

  constructor(camera: THREE.Camera) {
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72, metalness: 0 });
    const darkMat = new THREE.MeshStandardMaterial({ color: SKIN_DARK, roughness: 0.75 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: '#3a4234', roughness: 0.92 });
    const leather = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.28, metalness: 0.85 });
    const weave = new THREE.MeshStandardMaterial({ color: '#6a5230', roughness: 0.95 });
    const weaveDark = new THREE.MeshStandardMaterial({ color: '#4a3820', roughness: 0.95 });
    const glass = new THREE.MeshStandardMaterial({ color: '#e8f0d8', emissive: '#c9d8a8', emissiveIntensity: 0.4, roughness: 0.2 });

    this.left = makeHand(true, skinMat, sleeveMat);
    this.right = makeHand(false, skinMat, sleeveMat);
    this.right.scale.setScalar(0.96);
    this.left.position.set(-0.23, -0.24, -0.42);
    this.right.position.set(0.235, -0.26, -0.44);
    this.left.rotation.set(-0.12, 0.18, 0.06);
    this.right.rotation.set(-0.1, -0.2, -0.05);

    // knife in the right hand
    this.knife = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.1, 10), leather);
    handle.rotation.x = Math.PI / 2;
    this.knife.add(handle);
    const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 10), steel);
    bolster.rotation.x = Math.PI / 2;
    bolster.position.z = -0.055;
    this.knife.add(bolster);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.135, 0.004);
    bladeShape.quadraticCurveTo(0.15, 0.012, 0.138, 0.02);
    bladeShape.lineTo(0, 0.026);
    bladeShape.lineTo(0, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.004, bevelEnabled: false });
    bladeGeo.translate(0, -0.013, -0.002);
    const blade = new THREE.Mesh(bladeGeo, steel);
    blade.rotation.x = -Math.PI / 2;
    blade.position.z = -0.06;
    this.knife.add(blade);
    this.knife.position.set(0.035, -0.02, -0.08);
    this.knife.rotation.set(0.15, 0.2, 0.1);
    this.knife.visible = false;
    this.right.add(this.knife);

    // basket in the left hand
    this.basket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, 0.2, 16, 1, true), weave);
    body.position.y = 0.1;
    this.basket.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.125, 16), weaveDark);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.002;
    this.basket.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 24), weaveDark);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    this.basket.add(rim);
    for (let i = 0; i < 6; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.14 - i * 0.005, 0.006, 4, 24), weaveDark);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.03 + i * 0.03;
      this.basket.add(band);
    }
    const basketHandle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.011, 6, 24, Math.PI), weaveDark);
    basketHandle.position.y = 0.2;
    this.basket.add(basketHandle);
    this.basket.position.set(0.04, 0.06, -0.02);
    this.basket.rotation.set(0.1, 0, 0.18);
    this.left.add(this.basket);

    // flashlight in the left hand
    this.flashlight = new THREE.Group();
    const flBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.17, 12), new THREE.MeshStandardMaterial({ color: '#2c2e2a', roughness: 0.6, metalness: 0.4 }));
    flBody.rotation.x = Math.PI / 2;
    this.flashlight.add(flBody);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.03, 12), glass);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.095;
    this.flashlight.add(lens);
    this.flashlight.position.set(0.03, 0.02, -0.08);
    this.flashlight.visible = false;
    this.left.add(this.flashlight);

    // camera tool
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.07), new THREE.MeshStandardMaterial({ color: '#242620', roughness: 0.55 }));
    const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.05, 14), new THREE.MeshStandardMaterial({ color: '#12140f', roughness: 0.2, metalness: 0.3 }));
    camLens.rotation.x = Math.PI / 2;
    camLens.position.z = -0.05;
    camBody.add(camLens);
    camBody.position.set(0.02, 0.02, -0.07);
    camBody.visible = false;
    this.right.add(camBody);
    this.right.userData.camera = camBody;

    // viewmodel rendering: always on top
    this.group.add(this.left, this.right);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.renderOrder = 998;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          mat.depthTest = false;
          mat.depthWrite = false;
        }
      }
    });
    this.group.position.set(0, 0, 0);
    camera.add(this.group);
    this.setSleeves('#3a4234');
  }

  setSleeves(color: string) {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry?.type === 'CylinderGeometry') {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.color && Math.abs(mat.roughness - 0.92) < 0.01) mat.color.set(color);
      }
    });
  }

  setTool(tool: Hands['tool']) {
    this.tool = tool;
    this.knife.visible = tool === 'knife';
    this.basket.visible = tool === 'basket';
    this.flashlight.visible = tool === 'flashlight';
    const cam = this.right.userData.camera as THREE.Mesh;
    if (cam) cam.visible = tool === 'camera';
  }

  setFlashlight(on: boolean) {
    this.flashlightOn = on;
    this.flashlight.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissive) {
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.4 : 0;
      }
    });
  }

  reachFor() {
    this.reach = 1;
    this.reachDir = 1;
  }

  update(dt: number, speed: number, bobPhase: number, crouch: boolean) {
    this.mode = crouch ? 'crouch' : speed > 4.2 ? 'run' : speed > 0.4 ? 'walk' : 'idle';
    const bob = Math.sin(bobPhase);
    const bob2 = Math.cos(bobPhase * 2);
    this.lastBob = bob;

    if (this.reach > 0) {
      this.reach = Math.max(0, this.reach - dt * 2.6);
    }
    const reachCurve = Math.sin(clamp(1 - this.reach, 0, 1) * Math.PI);

    let y = 0;
    let x = 0;
    let dz = 0;
    let rz = 0;
    if (this.mode === 'walk') {
      y = Math.abs(bob) * 0.016;
      x = bob * 0.012;
      rz = bob * 0.02;
      dz = BobPulse(bobPhase);
    } else if (this.mode === 'run') {
      y = Math.abs(bob) * 0.032;
      x = bob * 0.02;
      rz = bob * 0.035;
    } else if (this.mode === 'crouch') {
      y = -0.06 + Math.abs(bob) * 0.008;
      x = bob * 0.006;
    } else {
      const breath = Math.sin(performance.now() * 0.0011);
      y = breath * 0.006;
      x = Math.sin(performance.now() * 0.0007) * 0.004;
      rz = breath * 0.008;
    }
    const swayScale = this.mode === 'run' ? 1.6 : 1;
    this.left.position.x = -0.23 + x * 0.6 + this.sway.x * 0.01 * swayScale;
    this.left.position.y = -0.24 + y - this.sway.y * 0.007 * swayScale;
    this.left.position.z = -0.42 - dz + reachCurve * 0.1;
    this.left.rotation.z = 0.06 + rz * 0.5;
    this.left.rotation.x = -0.12 + this.sway.y * 0.01 + reachCurve * 0.5;

    this.right.position.x = 0.235 + x * 0.7 - this.sway.x * 0.012 * swayScale;
    this.right.position.y = -0.26 + y - this.sway.y * 0.008 * swayScale;
    this.right.position.z = -0.44 - dz + reachCurve * 0.18;
    this.right.rotation.z = -0.05 - rz * 0.6;
    this.right.rotation.x = -0.1 + this.sway.y * 0.012 + reachCurve * 0.8;

    this.sway.x = damp(this.sway.x, 0, 6, dt);
    this.sway.y = damp(this.sway.y, 0, 6, dt);

    if (this.basket) {
      const target = this.tool === 'basket' ? 1 : 0;
      this.basketOpen = damp(this.basketOpen, target, 6, dt);
      this.left.visible = this.tool !== 'camera';
    }
    this.right.visible = this.tool !== 'basket';
  }

  addSway(dx: number, dy: number) {
    this.sway.x = clamp(this.sway.x + dx, -8, 8);
    this.sway.y = clamp(this.sway.y + dy, -8, 8);
  }

  dispose() {
    this.group.removeFromParent();
  }
}

function BobPulse(phase: number) {
  const p = ((phase % TAU) + TAU) % TAU;
  return p < Math.PI ? Math.sin(p) * 0.02 : Math.sin(p - Math.PI) * 0.02;
}
