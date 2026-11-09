/* First-person controller: walking, running, crouching, collision and camera motion. */

import * as THREE from 'three';
import { Input } from '../core/input';
import { clamp, damp, lerp, smoothstep, TAU } from '../core/util';
import { Hands } from '../three/hands';
import type { Forest } from '../three/forest';

export type FootSurface = 'leaves' | 'needles' | 'mud' | 'moss' | 'stones' | 'grass';

export class Player {
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0;
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  stamina = 100;
  maxStamina = 100;
  crouching = false;
  running = false;
  moving = false;
  speed = 0;
  eyeHeight = 1.68;
  currentEye = 1.68;
  bobPhase = 0;
  hands: Hands;
  disabled = false;
  baseFov = 72;
  bootsBonus = 0;
  clothingBonus = 0;
  onFootstep: ((surface: FootSurface, running: boolean) => void) | null = null;
  onStaminaChange: (() => void) | null = null;
  private stepAccumulator = 0;
  private groundY = 0;
  private bobAmp = 0;
  private roll = 0;
  private lastMoveDir = new THREE.Vector3();
  private footTimer = 0;

  constructor(camera: THREE.PerspectiveCamera, private input: Input) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    camera.fov = this.baseFov;
    camera.updateProjectionMatrix();
    this.hands = new Hands(camera);
    this.hands.setTool('knife');
  }

  spawnAt(x: number, z: number, forest: Forest, yaw = Math.PI) {
    this.position.set(x, forest.heightAt(x, z), z);
    this.groundY = this.position.y;
    this.yaw = yaw;
    this.pitch = -0.04;
    this.velocity.set(0, 0, 0);
    this.currentEye = this.eyeHeight;
    this.bobPhase = 0;
    this.stamina = this.maxStamina;
    this.updateCamera(forest);
  }

  private updateCamera(forest: Forest) {
    const bob = Math.sin(this.bobPhase);
    const crouchEye = this.crouching ? 1.08 : this.eyeHeight;
    this.currentEye = damp(this.currentEye, crouchEye, 10, 1 / 60);
    const bobY = this.bobAmp * Math.abs(bob) * 0.5;
    const lateral = this.bobAmp * bob * 0.12;
    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * lateral,
      this.position.y + this.currentEye + bobY,
      this.position.z - Math.sin(this.yaw) * lateral
    );
    this.roll = damp(this.roll, this.running ? Math.sin(this.bobPhase) * 0.012 : 0, 8, 1 / 60);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll);
    this.camera.fov = damp(this.camera.fov, this.baseFov + (this.running ? 6 : 0) - (this.crouching ? 3 : 0), 6, 1 / 60);
    this.camera.updateProjectionMatrix();
    void forest;
  }

  update(dt: number, forest: Forest, wetness: number) {
    if (this.disabled) {
      this.updateCamera(forest);
      return;
    }
    // look
    const { dx, dy } = this.input.takeMouse();
    const sens = 0.0021 * this.input.sensitivity;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * (this.input.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.35);
    this.hands.addSway(-dx * 0.02, dy * 0.02);

    // movement intent
    let forward = 0;
    let strafe = 0;
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) forward += 1;
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) forward -= 1;
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) strafe += 1;
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) strafe -= 1;
    forward -= this.input.moveY;
    strafe += this.input.moveX;
    const wantsCrouch = this.input.isDown('ControlLeft') || this.input.isDown('KeyC');
    this.crouching = wantsCrouch;
    const wantsRun = (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) && !this.crouching && this.stamina > 2;

    const moveLen = Math.hypot(forward, strafe);
    const norm = moveLen > 1 ? 1 / moveLen : moveLen > 0.08 ? 1 : 0; // analog stick: partial tilt = slower walk
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * -forward * norm + Math.cos(this.yaw) * strafe * norm,
      0,
      Math.cos(this.yaw) * -forward * norm - Math.sin(this.yaw) * strafe * norm
    );
    this.moving = moveLen > 0.08;

    let baseSpeed = this.crouching ? 1.05 : wantsRun ? 5.1 : 2.65;
    baseSpeed *= 1 + this.bootsBonus * 0.035;
    if (wetness > 0.6) baseSpeed *= 0.94;
    const slope = forest.slopeAt(this.position.x, this.position.z);
    if (slope > 0.8) baseSpeed *= clamp(1 - (slope - 0.8) * 0.4, 0.45, 1);
    if (this.stamina <= 0.5) baseSpeed *= 0.82;

    this.running = wantsRun && this.moving;

    // stamina
    if (this.running) {
      this.stamina = clamp(this.stamina - 9 * dt, 0, this.maxStamina);
      this.onStaminaChange?.();
    } else if (!this.moving || !wantsRun) {
      const regen = this.crouching ? 16 : 11;
      this.stamina = clamp(this.stamina + regen * dt, 0, this.maxStamina);
      this.onStaminaChange?.();
    }

    // accelerate
    const targetVel = dir.multiplyScalar(baseSpeed);
    const accel = this.moving ? 12 : 16;
    this.velocity.x = damp(this.velocity.x, targetVel.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, targetVel.z, accel, dt);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed < 0.05) this.speed = 0;

    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const resolved = this.resolveCollisions(nextX, nextZ, forest);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // ground follow
    const gy = forest.heightAt(this.position.x, this.position.z);
    this.groundY = damp(this.groundY, gy, 16, dt);
    this.position.y = this.groundY;

    // head bob & footsteps
    const targetAmp = this.speed > 0.4 ? (this.running ? 0.11 : this.crouching ? 0.04 : 0.07) : 0;
    this.bobAmp = damp(this.bobAmp, targetAmp, 7, dt);
    const cadence = this.running ? 2.55 : this.crouching ? 1.5 : 1.95;
    this.bobPhase += dt * cadence * Math.min(1, this.speed / 2.2) * TAU;
    if (this.bobPhase > TAU * 1000) this.bobPhase -= TAU * 1000;

    this.footTimer += dt;
    const stepInterval = this.running ? 0.31 : this.crouching ? 0.62 : 0.47;
    if (this.moving && this.footTimer > stepInterval) {
      this.footTimer = 0;
      this.onFootstep?.(this.surfaceAt(forest), this.running);
    }

    this.updateCamera(forest);
    this.hands.update(dt, this.speed, this.bobPhase, this.crouching);
    if (this.hands.tool === 'none' && this.speed > 0.4) this.hands.setTool('knife');
  }

  private resolveCollisions(x: number, z: number, forest: Forest): { x: number; z: number } {
    const radius = 0.33;
    let px = x;
    let pz = z;
    for (const c of forest.colliders) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        px += dx * push;
        pz += dz * push;
      } else if (d <= 0.0001) {
        px += min;
      }
    }
    const rr = Math.hypot(px, pz);
    if (rr > 92) {
      px = (px / rr) * 92;
      pz = (pz / rr) * 92;
    }
    if (forest.isWater(px, pz)) {
      // wading is slow but allowed; keep the player out of deep water
      if (forest.waterLevel > -900) {
        const h = forest.heightAt(px, pz);
        if (h < forest.waterLevel - 0.25) return { x: this.position.x, z: this.position.z };
      }
    }
    // stay on walkable slope
    if (forest.slopeAt(px, pz) > 1.7) return { x: this.position.x, z: this.position.z };
    return { x: px, z: pz };
  }

  surfaceAt(forest: Forest): FootSurface {
    if (forest.isWater(this.position.x, this.position.z)) return 'mud';
    if (forest.isPath(this.position.x, this.position.z, 2.4)) return forest.biome.ground === 'sand' ? 'stones' : 'mud';
    const g = forest.biome.ground;
    if (g === 'needles') return 'needles';
    if (g === 'leaves') return 'leaves';
    if (g === 'moss') return 'moss';
    if (g === 'sand') return 'stones';
    return 'leaves';
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.copy(this.camera.position);
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  isCrouching() {
    return this.crouching;
  }

  setEnabled(v: boolean) {
    this.disabled = !v;
    if (!v) this.velocity.set(0, 0, 0);
  }

  dispose() {
    this.hands.dispose();
  }
}

export const _unused = { lerp, smoothstep };
