import { tr } from '../i18n';
/* HUBÁR — game orchestrator: world lifecycle, player, interaction, modes. */

import * as THREE from 'three';
import { Input } from '../core/input';
import { Player } from './player';
import { Forest } from '../three/forest';
import { MushroomField, type MushroomEntity } from './spawner';
import { WeatherSystem, WEATHER_LABEL, type WeatherKind } from './weather';
import { AudioEngine } from './audio';
import { HUD } from '../ui/hud';
import { Menus } from '../ui/menus';
import { InspectPanel, type InspectHost, type ObsKind } from '../ui/inspect';
import { BIOME_BY_ID, type BiomeId } from '../data/biomes';
import { SPECIES_BY_ID, isDangerous, EDIBILITY_LABEL } from '../data/species';
import {
  S,
  addXP,
  addToBasket,
  basketCapacity,
  challengeEntry,
  checkAchievements,
  dailyChallenges,
  discoverSpecies,
  endRun,
  hasEquip,
  levelProgress,
  noteIdentification,
  noteNight,
  notePhoto,
  noteRunDiscovery,
  noteRunIdentification,
  notifyChallenge,
  on,
  saveNow,
  SPECIAL_CHALLENGES,
  startRun,
  syncRun,
  toast,
  type Mode,
  type ChallengeDef,
} from './state';
import { careerCheck, currentMission } from './career';
import { clamp, damp, strSeed } from '../core/util';
import { setAllWet } from '../three/mushroom';

type GameState = 'menu' | 'waiting' | 'playing' | 'paused' | 'inspect' | 'summary';

export interface ExpeditionConfig {
  mode: Mode;
  biome: BiomeId;
  isoDate: string;
  hour: number;
  weather: string;
  challengeId?: string | null;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  player: Player;
  audio = new AudioEngine();
  hud: HUD;
  menus: Menus;
  inspectPanel: InspectPanel;
  forest: Forest | null = null;
  weather: WeatherSystem | null = null;
  field: MushroomField | null = null;
  state: GameState = 'menu';
  mode: Mode = 'free';
  biomeId: BiomeId = 'mixed';
  isoDate = '2027-09-19';
  challengeTarget: string | null = null;
  target: MushroomEntity | null = null;
  renderQuality: 'low' | 'medium' | 'high' = 'medium';
  softwareGL = false;

  private clock = new THREE.Clock();
  private flashlight: THREE.SpotLight;
  private flashlightOn = false;
  private elapsed = 0;
  private menuFocus = new THREE.Vector3(0, 0.4, 8);
  private menuAngle = 0;
  private inspectEntity: MushroomEntity | null = null;
  private inspectCenter = new THREE.Vector3();
  private inspectBaseLook = new THREE.Vector3();
  private inspectLook = new THREE.Vector3();
  private inspectRadius = 0.3;
  private inspectRadiusTarget = 0.4;
  private inspectYaw = 0;
  private inspectPitch = 0.3;
  private sporeTimer: number | null = null;
  private saveTimer = 0;
  private syncTimer = 0;
  private flushDone = false;
  private wetApplied = false;
  private collapseGuard = false;
  private nightNoted = false;
  private lastPos = new THREE.Vector3();
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };
  private enterOverlay: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private resizeHandler: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      this.softwareGL = /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch {
      this.softwareGL = false;
    }
    this.renderQuality = this.softwareGL ? 'low' : S.settings.quality;
    if (this.softwareGL) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    }

    this.camera = new THREE.PerspectiveCamera(S.settings.fov, window.innerWidth / window.innerHeight, 0.025, 420);
    this.scene.add(this.camera);

    this.input = new Input(canvas);
    this.player = new Player(this.camera, this.input);
    this.hud = new HUD(document.getElementById('hud-root') as HTMLElement);
    this.menus = new Menus(document.getElementById('ui-root') as HTMLElement);
    this.menus.bind(this);
    this.inspectPanel = new InspectPanel(document.getElementById('ui-root') as HTMLElement);

    this.flashlight = new THREE.SpotLight(0xffe6bf, 0, 34, 0.52, 0.6, 1.15);
    this.flashlight.position.set(0.22, -0.1, -0.06);
    this.flashlight.target.position.set(0, -0.35, -9);
    this.camera.add(this.flashlight, this.flashlight.target);

    this.player.onFootstep = (surface, running) => this.audio.footstep(surface, running);
    this.input.onLockChange = (locked) => this.handleLock(locked);
    this.input.onKeyDown = (code) => this.handleKey(code);

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state === 'inspect') {
        this.dragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      } else if (this.state === 'playing' && !this.input.locked) {
        this.input.requestLock();
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || this.state !== 'inspect') return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.inspectYaw -= dx * 0.0075;
      this.inspectPitch = clamp(this.inspectPitch + dy * 0.005, -1.02, 1.2);
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.state !== 'inspect') return;
        this.inspectRadiusTarget = clamp(this.inspectRadiusTarget + e.deltaY * 0.0005, this.inspectRadius * 0.7, this.inspectRadius * 2.6);
      },
      { passive: true }
    );

    this.resizeHandler = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    window.addEventListener('resize', this.resizeHandler);

    on('toast', (p: any) => this.hud.toast(p.title, p.body, p.kind));
    on('challenge', (p: any) => {
      if (this.state === 'playing' && this.mode === 'challenge' && p?.def?.id === this.challengeTarget) {
        toast('Objective complete', 'The walk can end here. Returning to the cabin.', 'good');
        window.setTimeout(() => {
          if (this.state === 'playing') this.endExpedition();
        }, 2600);
      }
    });
    on('levelup', () => this.menus.refresh());
    on('money', () => this.menus.refresh());
  }

  /* ------------------------------------------------------------------ */

  boot() {
    document.getElementById('boot')?.classList.add('gone');
    this.buildShowcase();
    this.menus.showMain();
    this.hud.hide();
    this.state = 'menu';
    this.clock.start();
    this.tick();
    setTimeout(() => this.promptOrientation(), 1400);
  }

  private promptOrientation() {
    if (window.innerWidth < 760) {
      toast('A desktop forest', 'HUBÁR is designed for a mouse and keyboard. A larger screen gives the forest room to breathe.', 'info');
    }
  }

  private buildShowcase() {
    this.disposeWorld();
    const biome = BIOME_BY_ID.mixed;
    this.biomeId = 'mixed';
    this.isoDate = '2027-09-19';
    this.forest = new Forest(this.scene, { biome, seed: 7719, quality: this.renderQuality === 'high' ? 'medium' : this.renderQuality });
    this.weather = new WeatherSystem(this.scene, biome, 7.4, 7719, 'mist');
    this.weather.paused = false;
    this.field = new MushroomField(this.scene, this.forest, {
      biome,
      isoDate: this.isoDate,
      wetness: 0.72,
      temperature: 12,
      fog: 0.7,
      seed: 7719,
      targetCount: this.softwareGL ? 42 : 64,
    });
    const anchor = new THREE.Vector3(0, 0, 7);
    const near = this.field.mushrooms
      .filter((m) => Math.hypot(m.position.x, m.position.z) < 24)
      .sort((a, b) => a.position.distanceTo(anchor) - b.position.distanceTo(anchor))
      .slice(0, 3);
    if (near.length) {
      const c = near.reduce((v, m) => v.add(m.position), new THREE.Vector3()).multiplyScalar(1 / near.length);
      this.menuFocus.set(c.x, c.y + 0.16, c.z);
    } else {
      this.menuFocus.set(0, this.forest.heightAt(0, 7) + 0.2, 7);
    }
    this.player.spawnAt(0, 12, this.forest, 0);
    this.menuAngle = 0;
    this.state = 'menu';
  }

  private disposeWorld() {
    this.field?.dispose();
    this.field = null;
    this.weather?.dispose();
    this.weather = null;
    this.forest?.dispose();
    this.forest = null;
    this.target = null;
  }

  /* ------------------------------------------------------------------ */
  /* expedition lifecycle                                                */
  /* ------------------------------------------------------------------ */

  startExpedition(cfg: ExpeditionConfig) {
    this.audio.init();
    this.showLoading();
    window.setTimeout(() => {
      this.buildWorld(cfg, null);
      this.hideLoading();
      this.showEnterOverlay();
    }, 90);
  }

  resumeExpedition() {
    const run = S.run;
    if (!run) {
      this.menus.showMain();
      return;
    }
    this.audio.init();
    this.showLoading();
    window.setTimeout(() => {
      this.buildWorld(
        { mode: run.mode, biome: run.biome, isoDate: run.isoDate, hour: run.hour, weather: run.weather },
        { x: run.x, z: run.z, yaw: run.yaw, hour: run.hour }
      );
      this.hideLoading();
      this.showEnterOverlay();
    }, 90);
  }

  private buildWorld(cfg: ExpeditionConfig, resume: { x: number; z: number; yaw: number; hour: number } | null) {
    this.disposeWorld();
    const biome = BIOME_BY_ID[cfg.biome];
    this.mode = cfg.mode;
    this.biomeId = cfg.biome;
    this.isoDate = cfg.isoDate;
    this.flushDone = false;
    this.nightNoted = false;
    this.collapseGuard = false;
    this.sporeTimer = null;
    const seed = strSeed(cfg.biome + cfg.isoDate);
    this.renderQuality = this.softwareGL ? 'low' : S.settings.quality;
    this.forest = new Forest(this.scene, { biome, seed, quality: this.renderQuality });
    this.weather = new WeatherSystem(
      this.scene,
      biome,
      resume?.hour ?? cfg.hour,
      seed,
      (cfg.weather || undefined) as WeatherKind | undefined
    );
    this.weather.dayLength = Math.max(260, S.settings.dayLengthMinutes * 60);
    this.weather.paused = true;
    this.field = new MushroomField(this.scene, this.forest, {
      biome,
      isoDate: cfg.isoDate,
      wetness: this.weather.wetness,
      temperature: this.weather.temperature,
      fog: this.weather.fog,
      seed,
      targetCount: Math.round(biome.mushroomCount * (this.renderQuality === 'low' ? 0.5 : this.renderQuality === 'medium' ? 0.78 : 1)),
    });

    const x = resume?.x ?? this.forest.pathX(62) + 0.4;
    const z = resume?.z ?? 62;
    this.player.baseFov = S.settings.fov;
    this.player.bootsBonus = hasEquip('boots') ? 1 : 0;
    this.player.clothingBonus = hasEquip('raincoat') ? 1 : 0;
    this.player.spawnAt(x, z, this.forest, resume?.yaw ?? 0.05);
    this.player.setEnabled(false);
    this.lastPos.copy(this.player.position);
    this.camera.fov = S.settings.fov;
    this.camera.updateProjectionMatrix();
    this.input.sensitivity = S.settings.sensitivity;
    this.input.invertY = S.settings.invertY;
    this.input.enabled = false;

    if (!resume) {
      startRun({
        mode: cfg.mode,
        biome: cfg.biome,
        isoDate: cfg.isoDate,
        hour: cfg.hour,
        weather: this.weather.kind,
        x,
        z,
        yaw: this.player.yaw,
        provisions: S.provisions,
      });
      S.run!.challengeTarget = cfg.challengeId ?? null;
      this.challengeTarget = cfg.challengeId ?? null;
    } else {
      this.challengeTarget = S.run?.challengeTarget ?? cfg.challengeId ?? null;
      this.mode = S.run?.mode ?? cfg.mode;
    }

    this.weather.onThunder = () => this.audio.sfx('thunder');
    this.weather.onChange = () => this.hud.toast('The weather turns', this.weather!.label, 'info');
    this.setWetness(this.weather.wetness > 0.45);
    this.hud.clearToasts();
    this.hud.hide();
    this.menus.hide();
    this.state = 'waiting';
    this.audio.init();
    this.audio.setVolume(S.settings.volume);
    this.syncTimer = 0;
    this.saveTimer = 0;
    careerCheck();
    window.setTimeout(() => {
      if (this.state !== 'waiting') return;
      toast(biome.name, `${this.weather!.label} · ${Math.round(this.weather!.temperature)}°C · ${this.weather!.timeString()}`, 'info');
    }, 1600);
  }

  private showLoading() {
    this.hideLoading();
    const node = document.createElement('div');
    node.className = 'loading-screen';
    node.innerHTML = '<div class="loading-mark">HUBÁR</div><div class="loading-note">Reading the forest…</div><div class="loading-bar"><i></i></div>';
    document.body.appendChild(node);
    this.loadingEl = node;
  }

  private hideLoading() {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  private showEnterOverlay() {
    this.enterOverlay?.remove();
    const ov = document.createElement('div');
    ov.className = 'enter-overlay';
    const biome = BIOME_BY_ID[this.biomeId];
    const modeLabel = this.mode === 'survival' ? 'Survival' : this.mode === 'career' ? 'Career' : this.mode === 'challenge' ? 'Challenge' : 'Free exploration';
    ov.innerHTML = `
      <div class="enter-card">
        <div class="kicker">${modeLabel} · ${biome.sk}</div>
        <h2>${biome.name}</h2>
        <p>${biome.tagline}. ${this.weather?.label}, ${Math.round(this.weather?.temperature ?? 12)}°C.</p>
        <button class="btn primary lg enter-btn">Enter the forest</button>
        <div class="enter-keys"><span>WASD walk</span><span>Shift run</span><span>Ctrl crouch</span><span>E examine</span><span>Esc pause</span></div>
        <div class="enter-safety">A simulation, not a field guide. Never eat a wild mushroom on the strength of a game.</div>
      </div>
    `;
    ov.addEventListener('click', () => {
      this.audio.init();
      this.audio.setVolume(S.settings.volume);
      this.input.requestLock();
      ov.remove();
      this.enterOverlay = null;
      this.startPlay();
    });
    document.body.appendChild(ov);
    this.enterOverlay = ov;
  }

  private startPlay() {
    if (this.state !== 'waiting' && this.state !== 'paused') return;
    this.state = 'playing';
    if (this.weather) this.weather.paused = false;
    this.hud.show();
    this.player.setEnabled(true);
    this.input.enabled = true;
    this.audio.resume();
    this.input.clear();
    if (this.mode === 'survival' && S.run?.survival) {
      this.hud.toast('Survival', 'Provisions in your pack. Return to the cabin before dark.', 'info');
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.input.enabled = false;
    this.input.clear();
    this.player.setEnabled(false);
    if (this.weather) this.weather.paused = true;
    this.syncSave();
    this.hud.hide();
    this.menus.showPause();
    this.audio.sfx('click');
  }

  resumePlay() {
    this.menus.hide();
    this.hud.show();
    this.state = 'playing';
    this.input.enabled = true;
    this.player.setEnabled(true);
    if (this.weather) this.weather.paused = false;
    this.input.clear();
    this.input.requestLock();
    this.audio.resume();
  }

  endExpedition() {
    if (!S.run) {
      this.quitToMenu();
      return;
    }
    const run = S.run;
    const atCabin = this.forest ? this.player.position.distanceTo(this.forest.cabinPos) < 7 : false;
    if (run.mode === 'survival' && !atCabin) {
      S.basket = [];
      toast('The basket was lost', 'You left the forest away from the cabin. Nothing could be kept.', 'bad');
    }
    careerCheck();
    const res = endRun();
    this.state = 'summary';
    this.input.exitLock();
    this.input.enabled = false;
    this.player.setEnabled(false);
    if (this.weather) this.weather.paused = true;
    this.hud.hide();
    this.inspectPanel.close();
    this.audio.sfx('levelup');
    this.menus.showSummary(res);
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.exitLock();
    this.input.enabled = false;
    this.player.setEnabled(false);
    this.inspectPanel.close();
    this.hud.hide();
    this.buildShowcase();
    this.menus.showMain();
    this.audio.resume();
  }

  private syncSave() {
    if (!S.run || !this.weather) return;
    syncRun({
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
      hour: this.weather.hour,
      weather: this.weather.kind,
    });
  }

  /* ------------------------------------------------------------------ */
  /* input                                                               */
  /* ------------------------------------------------------------------ */

  private handleLock(locked: boolean) {
    if (locked) {
      if (this.state === 'waiting') this.startPlay();
      return;
    }
    if (this.state === 'playing') this.pause();
  }

  private handleKey(code: string) {
    if (code === 'Escape' && (this.state === 'summary' || this.state === 'menu')) return;
    if (this.state === 'playing') {
      if (code === 'KeyE') this.interact();
      else if (code === 'KeyF') this.quickPick();
      else if (code === 'KeyL') this.toggleFlashlight();
      else if (code === 'KeyR') this.weatherReport();
      else if (code === 'KeyP') this.eatProvision();
      else if (code === 'KeyJ' || code === 'Tab') this.pause();
    } else if (this.state === 'inspect') {
      if (code === 'Escape') this.closeInspection(false);
      else if (code === 'KeyE') this.collectCurrent();
      else if (code === 'KeyF') this.collectCurrent();
    } else if (this.state === 'paused') {
      if (code === 'Escape') this.resumePlay();
    }
  }

  /* ------------------------------------------------------------------ */
  /* interaction                                                         */
  /* ------------------------------------------------------------------ */

  private findTarget(): MushroomEntity | null {
    if (!this.field) return null;
    const hit = this.field.raycast(this.camera, 3.4);
    if (hit) return hit;
    if (this.player.forward().y < -0.45) return this.field.nearest(this.camera.position, 2.1);
    return null;
  }

  private interact() {
    if (!this.forest) return;
    if (this.mode === 'survival' && this.player.position.distanceTo(this.forest.cabinPos) < 6) {
      this.endExpedition();
      return;
    }
    if (this.target) this.openInspection(this.target);
  }

  private quickPick() {
    const m = this.target;
    if (!m) return;
    if (!m.identified) {
      this.hud.flashPrompt('Inspect it first — press E');
      this.audio.sfx('wrong');
      return;
    }
    if (S.basket.length >= basketCapacity()) {
      toast('Basket full', 'Sell the harvest before picking more.', 'bad');
      return;
    }
    this.grab(m);
    this.syncSave();
  }

  private grab(m: MushroomEntity) {
    const ok = addToBasket(m.species, {
      sizeCm: m.sizeCm,
      stage: m.stage,
      identified: m.identified,
      claimedId: m.identified ? m.species.id : null,
      wet: (this.weather?.wetness ?? 0) > 0.5,
    });
    if (!ok) return false;
    this.audio.sfx('collect');
    if (isDangerous(m.species) && m.identified) {
      toast('Poisonous species in the basket', 'It will be rejected at the market, and your reputation will suffer.', 'bad');
    }
    if (m.species.form === 'bolete' && m.sizeCm > S.records.bestBoleteCm) S.records.bestBoleteCm = m.sizeCm;
    if (S.basket.length >= basketCapacity()) notifyChallenge('basket-full', 1, {});
    checkAchievements();
    careerCheck();
    this.field?.collect(m);
    this.target = null;
    return true;
  }

  openInspection(m: MushroomEntity) {
    if (this.state !== 'playing') return;
    this.state = 'inspect';
    this.inspectEntity = m;
    this.player.setEnabled(false);
    this.player.velocity.set(0, 0, 0);
    this.input.exitLock();
    this.input.clear();
    this.audio.sfx('paper');
    this.player.hands.setTool('knife');
    this.player.hands.reachFor();

    const box = new THREE.Box3().setFromObject(m.visual.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.inspectCenter.copy(center);
    this.inspectRadius = clamp(Math.max(size.x, size.z, size.y) * 1.3, 0.16, 1.7);
    this.inspectRadiusTarget = this.inspectRadius;
    const dir = new THREE.Vector3(this.player.position.x - center.x, 0, this.player.position.z - center.z);
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
    this.inspectYaw = Math.atan2(dir.x, dir.z);
    this.inspectPitch = 0.3;
    this.inspectBaseLook.copy(center).add(new THREE.Vector3(0, -size.y * 0.3, 0));
    this.inspectLook.copy(center);
    this.inspectPanel.open(m, this.inspectHost());
    window.setTimeout(() => {
      if (this.state === 'inspect') this.inspectPanel.flash('Drag to turn the specimen. Scroll to lean in. Observe before you decide.');
    }, 450);
  }

  private inspectHost(): InspectHost {
    return {
      observe: (kind: ObsKind) => this.observe(kind),
      startSporePrint: () => this.startSporePrint(),
      identify: (id: string) => this.identify(id),
      collect: () => this.collectCurrent(),
      photograph: () => this.photograph(),
      leave: () => this.closeInspection(true),
      playSound: (n: string) => this.audio.sfx(n as never),
    };
  }

  private observe(kind: ObsKind) {
    if (!this.inspectEntity) return;
    if (kind === 'under') {
      this.inspectPitch = -0.62;
      this.inspectRadiusTarget = this.inspectRadius * 0.85;
      this.inspectLook.copy(this.inspectCenter);
    } else if (kind === 'base') {
      this.inspectPitch = -0.16;
      this.inspectRadiusTarget = this.inspectRadius * 1.35;
      this.inspectLook.copy(this.inspectBaseLook);
    } else if (kind === 'cap') {
      this.inspectPitch = 0.82;
      this.inspectRadiusTarget = this.inspectRadius;
      this.inspectLook.copy(this.inspectCenter);
    } else if (kind === 'stem') {
      this.inspectPitch = 0.1;
      this.inspectRadiusTarget = this.inspectRadius * 1.1;
      this.inspectLook.copy(this.inspectCenter);
    }
    this.audio.sfx(kind === 'smell' ? 'paper' : 'click');
    this.inspectPanel.reveal(kind);
  }

  private startSporePrint() {
    if (this.sporeTimer !== null) clearTimeout(this.sporeTimer);
    this.sporeTimer = window.setTimeout(() => {
      this.inspectPanel.reveal('spore');
      if (this.inspectEntity) toast('Spore print ready', this.inspectEntity.species.obs.spore, 'info');
      this.sporeTimer = null;
    }, 5000);
  }

  private identify(id: string) {
    const m = this.inspectEntity;
    if (!m || this.state !== 'inspect' || m.identified) return;
    const sp = m.species;
    const guessed = SPECIES_BY_ID[id];
    if (!guessed) return;
    if (id === sp.id) {
      m.identified = true;
      noteRunIdentification(true);
      noteIdentification(sp, true, null);
      const isNew = discoverSpecies(sp, m.sizeCm);
      noteRunDiscovery(sp.id);
      addXP(8 + sp.rarity * 4 + sp.difficulty * 2, 'Identification');
      if (isNew) notifyChallenge('discover', 1, { speciesId: sp.id });
      notifyChallenge('identify', 1, {
        correct: true,
        speciesId: sp.id,
        poisonous: isDangerous(sp),
        collected: false,
        sizeCm: m.sizeCm,
        rarity: sp.rarity,
      });
      if (S.run) notifyChallenge('identify-streak', 1, { streak: S.run.streak });
      if (isDangerous(sp)) {
        addXP(12, 'Poisonous species identified');
        this.hud.toast('Danger recognised', `${sp.sci} — ${EDIBILITY_LABEL[sp.edibility]}. Leave it where it is.`, 'good');
      }
      this.audio.sfx('identify');
      this.inspectPanel.showResult(true, sp, `${sp.intro} ${sp.toxin}`);
      checkAchievements();
      careerCheck();
      saveNow();
    } else {
      m.misidentified = true;
      noteRunIdentification(false);
      noteIdentification(sp, false, id);
      this.audio.sfx('wrong');
      notifyChallenge('identify', 1, { correct: false });
      this.inspectPanel.showResult(
        false,
        guessed,
        `That is ${guessed.sci}. Your specimen does not match it: read the cap, the underside and the base again before deciding.`
      );
      this.inspectPanel.flash('A wrong identification breaks your streak. The forest will not correct you.');
      saveNow();
    }
    this.inspectPanel.showCandidates();
  }

  private photograph() {
    const m = this.inspectEntity;
    if (!m) return;
    if (!hasEquip('camera')) {
      this.inspectPanel.flash('You need a field camera for that. The market sells one from level 2.');
      return;
    }
    m.photographed = true;
    notePhoto(m.species);
    if (S.run) S.run.photos++;
    addXP(6, 'Photograph');
    notifyChallenge('photo', 1, {});
    this.audio.sfx('camera');
    this.inspectPanel.flash(`Photographed. ${m.species.obs.cap}`);
    checkAchievements();
    saveNow();
  }

  private collectCurrent() {
    const m = this.inspectEntity;
    if (!m) return;
    if (S.basket.length >= basketCapacity()) {
      this.inspectPanel.flash('The basket is full. Sell the harvest before picking more.');
      toast('Basket full', 'No room for another specimen.', 'bad');
      return;
    }
    const identified = m.identified;
    const danger = isDangerous(m.species);
    if (!this.grab(m)) return;
    this.syncSave();
    this.closeInspection(true);
    if (!identified) {
      this.hud.toast('Unidentified specimen collected', 'The buyer will decide what it is. That is the risk.', 'info');
    } else if (danger) {
      this.hud.toast('Dangerous specimen collected', 'This will be rejected and cost you. Some lessons are expensive.', 'bad');
    }
  }

  closeInspection(requestLock: boolean) {
    if (this.state !== 'inspect') return;
    if (this.sporeTimer !== null) {
      clearTimeout(this.sporeTimer);
      this.sporeTimer = null;
    }
    this.inspectEntity = null;
    this.inspectPanel.close();
    this.player.setEnabled(true);
    this.state = 'playing';
    this.target = null;
    if (requestLock) this.input.requestLock();
  }

  private toggleFlashlight() {
    if (!hasEquip('flashlight')) {
      toast('No light', 'A headlamp is sold at the market from level 3.', 'info');
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 42 : 0;
    this.player.hands.setFlashlight(this.flashlightOn);
    this.player.hands.setTool(this.flashlightOn ? 'flashlight' : 'knife');
    this.audio.sfx('click');
    this.hud.flashPrompt(this.flashlightOn ? 'Headlamp on' : 'Headlamp off');
  }

  private weatherReport() {
    if (!hasEquip('weatherRadio')) {
      toast('No forecast', 'A weather radio is sold at the market from level 3.', 'info');
      return;
    }
    const f = this.weather?.forecastPeriods || [];
    toast(
      'Forecast',
      f.slice(0, 4).map((p) => `${String(p.hour).padStart(2, '0')}:00 ${tr(WEATHER_LABEL[p.kind] ?? p.kind)} ${Math.round(p.temperature)}°`).join(' · '),
      'info'
    );
  }

  private eatProvision() {
    const run = S.run;
    if (!run?.survival) return;
    if (run.survival.provisions <= 0) {
      toast('No provisions', 'Buy bread and water at the market.', 'bad');
      return;
    }
    if (run.survival.energy > 92) {
      toast('Not hungry', 'Save the provisions for the walk back.', 'info');
      return;
    }
    run.survival.provisions--;
    run.survival.energy = Math.min(100, run.survival.energy + 28);
    this.audio.sfx('paper');
    this.hud.flashPrompt('You eat and rest for a moment');
    saveNow();
  }

  private setWetness(wet: boolean) {
    if (wet === this.wetApplied) return;
    this.wetApplied = wet;
    setAllWet(wet);
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                                */
  /* ------------------------------------------------------------------ */

  private tick = () => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    if (this.state === 'menu') {
      this.updateMenuCamera(dt);
      this.weather?.update(dt, this.camera.position);
      this.forest?.update(dt, this.camera.position, this.weather?.wind ?? 0.3);
      this.audio.update(dt, {
        rain: this.weather?.rain ?? 0,
        wind: this.weather?.wind ?? 0.3,
        timeOfDay: this.weather?.hour ?? 8,
        biomeMood: 0.5,
        indoor: false,
      });
    } else if (this.state === 'playing' || this.state === 'waiting') {
      if (this.state === 'playing') {
        this.player.update(dt, this.forest!, this.weather?.wetness ?? 0.3);
        this.trackDistance();
      }
      this.weather?.update(dt, this.camera.position);
      this.forest?.update(dt, this.camera.position, this.weather?.wind ?? 0.3);
      if (this.state === 'playing') this.updateTarget();
      this.updateAtmosphere();
      this.updateSurvival(dt);
      this.audio.update(dt, {
        rain: this.weather?.rain ?? 0,
        wind: this.weather?.wind ?? 0.3,
        timeOfDay: this.weather?.hour ?? 10,
        biomeMood: 0.5,
        indoor: false,
      });
      this.updateHUD();
      this.saveTimer += dt;
      this.syncTimer += dt;
      if (this.syncTimer > 6) {
        this.syncTimer = 0;
        this.syncSave();
      }
      if (this.saveTimer > 20) {
        this.saveTimer = 0;
        saveNow();
      }
      if (this.weather && this.weather.hour > 19.4 && !this.nightNoted) {
        this.nightNoted = true;
        noteNight();
        toast('Night in the forest', 'The light is going. A headlamp would help.', 'info');
      }
    } else if (this.state === 'inspect') {
      this.input.takeMouse();
      this.updateInspectCamera(dt);
      this.weather?.update(dt * 0.3, this.camera.position);
      this.forest?.update(dt * 0.3, this.camera.position, this.weather?.wind ?? 0.3);
      this.audio.update(dt, {
        rain: this.weather?.rain ?? 0,
        wind: this.weather?.wind ?? 0.3,
        timeOfDay: this.weather?.hour ?? 10,
        biomeMood: 0.5,
        indoor: false,
      });
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private updateMenuCamera(dt: number) {
    if (!this.forest) return;
    this.menuAngle += dt * 0.045;
    const r = 2.1;
    const baseY = this.menuFocus.y;
    const x = this.menuFocus.x + Math.cos(this.menuAngle) * r;
    const z = this.menuFocus.z + Math.sin(this.menuAngle) * r;
    const y = baseY + 0.7 + Math.sin(this.elapsed * 0.32) * 0.018;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.menuFocus.x, baseY + 0.02, this.menuFocus.z);
    if (Math.abs(this.camera.fov - 54) > 0.01) {
      this.camera.fov = damp(this.camera.fov, 54, 3, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private trackDistance() {
    const d = Math.hypot(this.player.position.x - this.lastPos.x, this.player.position.z - this.lastPos.z);
    this.lastPos.copy(this.player.position);
    if (d < 0.4) {
      S.stats.distanceWalked += d;
      if (S.run?.survival) S.run.survival.distance += d;
    }
  }

  private updateTarget() {
    this.target = this.findTarget();
  }

  private updateAtmosphere() {
    if (!this.weather) return;
    this.setWetness(this.weather.wetness > 0.45);
    if (!this.flushDone && this.weather.rain > 0.75) {
      this.flushDone = true;
      this.field?.flush(10);
      toast('The forest is flushing', 'Rain has brought new fruit bodies out of the litter.', 'good');
    }
  }

  private updateSurvival(dt: number) {
    const run = S.run;
    if (!run?.survival || this.state !== 'playing') return;
    const night = (this.weather?.hour ?? 12) > 19 || (this.weather?.hour ?? 12) < 6;
    const rain = this.weather?.rain ?? 0;
    const activity = this.player.running ? 1.9 : 0.55;
    const drain = (0.3 + activity) * (night ? 1.5 : 1) * (1 + rain * 0.35) * (hasEquip('raincoat') ? 0.7 : 1);
    run.survival.energy = clamp(run.survival.energy - drain * dt * 0.55, 0, 100);
    if (run.survival.energy <= 0 && !this.collapseGuard) {
      this.collapseGuard = true;
      this.hud.toast('You collapse from exhaustion', 'The basket is lost. You wake at the cabin.', 'bad');
      S.basket = [];
      window.setTimeout(() => {
        if (this.state === 'playing') this.endExpedition();
      }, 1600);
    }
  }

  private updateHUD() {
    if (!this.weather || !this.forest) return;
    const lp = levelProgress(S.profile.xp);
    const biome = BIOME_BY_ID[this.biomeId];
    const obj = this.objective();
    const nearCabin = this.player.position.distanceTo(this.forest.cabinPos) < 7;
    let prompt: string | null = null;
    let action: string | null = null;
    if (this.mode === 'survival' && nearCabin) {
      prompt = 'The cabin';
      action = 'E · End the walk';
    } else if (this.target) {
      prompt = this.target.identified ? this.target.species.sci : 'Unidentified specimen';
      action = this.target.identified ? 'E · Examine   F · Pick' : 'E · Examine specimen';
    } else if (nearCabin) {
      prompt = 'Cabin';
      action = 'Your basket and bed';
    }
    this.hud.update({
      level: lp.level,
      levelName: lp.name,
      xpPct: lp.pct,
      xpText: `${S.profile.xp} XP`,
      time: this.weather.timeString(),
      weather: this.weather.label,
      temperature: this.weather.temperature,
      biome: biome.name,
      mode: this.mode === 'free' ? 'Free exploration' : this.mode === 'career' ? 'Career' : this.mode === 'challenge' ? 'Challenge' : 'Survival',
      basket: S.basket.length,
      capacity: basketCapacity(),
      weight: S.basket.reduce((s, i) => s + (SPECIES_BY_ID[i.speciesId]?.weight || 0), 0),
      stamina: this.player.stamina,
      crouched: this.player.crouching,
      compass: ((-this.player.yaw * 180) / Math.PI + 360) % 360,
      prompt,
      promptAction: action,
      objective: obj?.title ?? null,
      objectiveProgress: obj?.progress ?? null,
      survival: S.run?.survival
        ? {
            energy: S.run.survival.energy,
            provisions: S.run.survival.provisions,
            distance: this.player.position.distanceTo(this.forest.cabinPos),
            dusk: this.weather.hour < 19 ? `dusk in ${Math.max(0, Math.round(19 - this.weather.hour))} h` : 'after dusk',
          }
        : null,
      gps: hasEquip('gps') ? `${this.player.position.x.toFixed(1)} / ${this.player.position.z.toFixed(1)} · ${biome.sk}` : null,
      night: this.weather.isNight,
    });
  }

  private objective(): { title: string; progress: number } | null {
    if (this.mode === 'challenge' && this.challengeTarget) {
      const def: ChallengeDef | undefined = [...dailyChallenges(), ...SPECIAL_CHALLENGES].find((d) => d.id === this.challengeTarget);
      if (def) {
        const entry = challengeEntry(def);
        return { title: def.title, progress: entry.progress / def.target };
      }
    }
    if (this.mode === 'career') {
      const m = currentMission();
      if (m) return { title: m.mission.title, progress: m.progress / m.mission.target };
    }
    if (this.mode === 'survival' && S.run?.survival) {
      return { title: 'Return to the cabin before dark', progress: S.run.survival.energy / 100 };
    }
    return null;
  }

  private updateInspectCamera(dt: number) {
    this.inspectRadiusTarget = clamp(this.inspectRadiusTarget, this.inspectRadius * 0.6, this.inspectRadius * 2.4);
    const radius = damp(this.inspectRadius, this.inspectRadiusTarget, 6, dt);
    const pos = new THREE.Vector3(
      Math.sin(this.inspectYaw) * Math.cos(this.inspectPitch),
      Math.sin(this.inspectPitch),
      Math.cos(this.inspectYaw) * Math.cos(this.inspectPitch)
    )
      .multiplyScalar(radius)
      .add(this.inspectCenter);
    this.camera.position.lerp(pos, 1 - Math.exp(-9 * dt));
    const look = new THREE.Vector3().lerpVectors(this.inspectCenter, this.inspectLook, 0.85);
    const m = new THREE.Matrix4().lookAt(this.camera.position, look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.camera.quaternion.slerp(q, 1 - Math.exp(-9 * dt));
    this.camera.fov = damp(this.camera.fov, 58, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposeWorld();
    this.audio.dispose();
    this.input.dispose();
    this.player.dispose();
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
  }
}
