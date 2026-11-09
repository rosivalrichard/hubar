/* Weather director: sky, sun, fog, rain, mist, wind, wetness and time of day. */

import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, RNG, strSeed, mixHex, TAU } from '../core/util';
import type { Biome } from '../data/biomes';
import { mistTexture, rainStreakTexture } from '../three/textures';

export type WeatherKind = 'clear' | 'sunny' | 'overcast' | 'mist' | 'drizzle' | 'rain' | 'storm' | 'fog';

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear',
  sunny: 'Sunny',
  overcast: 'Overcast',
  mist: 'Morning mist',
  drizzle: 'Light rain',
  rain: 'Rain',
  storm: 'Thunderstorm',
  fog: 'Dense fog',
};

export const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: 'sun',
  sunny: 'sun',
  overcast: 'cloud',
  mist: 'mist',
  drizzle: 'drizzle',
  rain: 'rain',
  storm: 'storm',
  fog: 'mist',
};

export interface WeatherPeriod {
  hour: number;
  kind: WeatherKind;
  temperature: number;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform vec3 groundColor;
uniform float cloudCover;
uniform float time;
uniform float night;
uniform float haze;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.62));
  col = mix(groundColor, col, smoothstep(-0.16, 0.02, d.y));

  // sun / moon glow
  vec3 sd = normalize(sunDir);
  float sdot = max(dot(d, sd), 0.0);
  float disc = pow(sdot, 1400.0);
  float glow = pow(sdot, 9.0);
  col += sunColor * disc * 4.0;
  col += sunColor * glow * 0.28 * (1.0 - cloudCover * 0.7);

  // stars
  if (night > 0.02 && d.y > -0.02) {
    vec2 sp = d.xz / (max(d.y, 0.02) + 0.25) * 38.0;
    vec2 cell = floor(sp);
    float rnd = hash(cell);
    vec2 f = fract(sp) - 0.5;
    float star = smoothstep(0.16, 0.0, length(f)) * step(0.987, rnd);
    float twinkle = 0.55 + 0.45 * sin(time * 1.7 + rnd * 60.0);
    col += vec3(0.85, 0.9, 1.0) * star * night * twinkle * 1.6 * smoothstep(0.0, 0.25, d.y);
  }

  // clouds
  if (d.y > -0.02) {
    vec2 uv = d.xz / (d.y + 0.22) * 0.85 + vec2(time * 0.0035, time * 0.0012);
    float c1 = fbm(uv * 1.6);
    float c2 = fbm(uv * 3.1 + 3.7);
    float cloud = smoothstep(0.42 - cloudCover * 0.34, 0.82, c1 * 0.7 + c2 * 0.3);
    vec3 cloudLit = mix(vec3(0.42, 0.44, 0.44), vec3(0.86, 0.87, 0.84), 0.6);
    vec3 cloudCol = mix(cloudLit * (0.35 + 0.65 * (1.0 - night)), sunColor * 0.35 + cloudLit * 0.5, 0.35);
    float cover = clamp(cloudCover * 1.25 + 0.1, 0.0, 1.0);
    float hz = smoothstep(-0.02, 0.24, d.y);
    col = mix(col, cloudCol, cloud * cover * hz * 0.92);
  }

  // low haze band
  col = mix(col, horizonColor * 1.02, haze * smoothstep(0.28, -0.02, d.y));

  gl_FragColor = vec4(col, 1.0);
}
`;

export class WeatherSystem {
  kind: WeatherKind = 'overcast';
  targetKind: WeatherKind = 'overcast';
  cloud = 0.6;
  rain = 0;
  fog = 0.3;
  mist = 0.2;
  wind = 0.35;
  temperature = 13;
  wetness = 0.25;
  hour = 7.4;
  dayLength = 780; // seconds per in-game day
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  rainPoints: THREE.Points;
  private mistSprites: THREE.Sprite[] = [];
  private scene: THREE.Scene;
  private biome: Biome;
  private sunDir = new THREE.Vector3(0.3, 0.6, 0.4);
  private rng: RNG;
  private changeTimer = 90;
  private lightningTimer = 8;
  private lightning = 0;
  forecastPeriods: WeatherPeriod[] = [];
  onChange: ((kind: WeatherKind) => void) | null = null;
  onThunder: (() => void) | null = null;
  paused = false;
  private initialWetness: number;

  constructor(scene: THREE.Scene, biome: Biome, hour: number, seed: number, initial?: WeatherKind) {
    this.scene = scene;
    this.biome = biome;
    this.hour = hour;
    this.rng = new RNG(seed);
    this.initialWetness = clamp(biome.rainfall * 0.6, 0, 1);
    this.wetness = this.initialWetness;
    this.kind = initial ?? this.pickInitial();
    this.targetKind = this.kind;
    this.applyWeatherParams(this.kind, true);

    const skyGeo = new THREE.SphereGeometry(420, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#7c98a8') },
        horizonColor: { value: new THREE.Color('#cfd2c0') },
        groundColor: { value: new THREE.Color('#3a3a2c') },
        sunColor: { value: new THREE.Color('#ffe6bb') },
        sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4) },
        cloudCover: { value: 0.6 },
        time: { value: 0 },
        night: { value: 0 },
        haze: { value: 0.2 },
      },
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffe6bb, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    const sc = 46;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(new THREE.Color(biome.hemiSky), new THREE.Color(biome.hemiGround), 0.85);
    scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(0x9fb4a8, 0.25);
    this.fill.position.set(-40, 30, -30);
    scene.add(this.fill);

    this.buildRain();
    this.buildMist();
    this.rollForecast();
    this.scene.fog = new THREE.FogExp2(new THREE.Color(biome.fogColor).getHex(), biome.fogDensity);
    this.updateSky(0, new THREE.Vector3());
  }

  private pickInitial(): WeatherKind {
    const r = this.rng.f();
    const wet = this.biome.rainfall;
    if (r < 0.16 + wet * 0.18) return 'rain';
    if (r < 0.3 + wet * 0.2) return 'drizzle';
    if (r < 0.52) return 'overcast';
    if (r < 0.68) return 'mist';
    if (r < 0.8) return 'fog';
    if (r < 0.94) return 'clear';
    return 'sunny';
  }

  private nextWeather(): WeatherKind {
    const r = this.rng.f();
    const wet = this.biome.rainfall;
    if (this.kind === 'storm' && r < 0.6) return 'rain';
    if (this.kind === 'rain' && r < 0.4) return 'drizzle';
    if (this.kind === 'fog' && r < 0.45) return 'mist';
    if (this.kind === 'mist' && r < 0.4) return 'clear';
    if (this.kind === 'sunny' && r < 0.35) return 'clear';
    if (r < 0.1 + wet * 0.15) return 'storm';
    if (r < 0.3 + wet * 0.24) return 'rain';
    if (r < 0.46 + wet * 0.2) return 'drizzle';
    if (r < 0.66) return 'overcast';
    if (r < 0.78) return 'mist';
    if (r < 0.86) return 'fog';
    if (r < 0.96) return 'clear';
    return 'sunny';
  }

  private applyWeatherParams(kind: WeatherKind, instant = false) {
    const target = {
      clear: { cloud: 0.08, rain: 0, fog: 0.12, mist: 0.05, wind: 0.22 },
      sunny: { cloud: 0.16, rain: 0, fog: 0.1, mist: 0.04, wind: 0.28 },
      overcast: { cloud: 0.78, rain: 0, fog: 0.32, mist: 0.16, wind: 0.45 },
      mist: { cloud: 0.5, rain: 0, fog: 0.66, mist: 0.85, wind: 0.12 },
      drizzle: { cloud: 0.86, rain: 0.28, fog: 0.45, mist: 0.25, wind: 0.4 },
      rain: { cloud: 0.94, rain: 0.78, fog: 0.55, mist: 0.35, wind: 0.62 },
      storm: { cloud: 1, rain: 1, fog: 0.62, mist: 0.4, wind: 1 },
      fog: { cloud: 0.72, rain: 0, fog: 0.95, mist: 0.9, wind: 0.09 },
    }[kind];
    if (instant) {
      this.cloud = target.cloud;
      this.rain = target.rain;
      this.fog = target.fog;
      this.mist = target.mist;
      this.wind = target.wind;
    }
    this.kind = kind;
    this.onChange?.(kind);
  }

  rollForecast() {
    this.forecastPeriods = [];
    let k = this.kind;
    for (let i = 0; i < 6; i++) {
      this.forecastPeriods.push({
        hour: (Math.floor(this.hour / 3) * 3 + (i + 1) * 3) % 24,
        kind: k,
        temperature: Math.round(this.temperature + this.rng.range(-2, 2)),
      });
      const old = this.rng.f;
      void old;
      k = this.nextWeather();
    }
  }

  setWeather(kind: WeatherKind, instant = false) {
    this.targetKind = kind;
    if (instant) {
      this.applyWeatherParams(kind, true);
    } else {
      this.onChange?.(kind);
    }
    this.rollForecast();
  }

  get isNight() {
    return this.sunDir.y < 0.03;
  }

  get label() {
    return WEATHER_LABEL[this.kind];
  }

  get spawnFactor() {
    return 0.75 + this.wetness * 0.55;
  }

  timeString() {
    const h = Math.floor(this.hour) % 24;
    const m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt: number, cameraPos: THREE.Vector3) {
    if (this.paused) {
      this.updateSky(0, cameraPos);
      return;
    }
    // clock
    this.hour += (24 / this.dayLength) * dt;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.rollForecast();
    }

    // weather transitions
    this.applyWeatherParams(this.targetKind);
    const t = this.targetKind;
    const target = {
      clear: { cloud: 0.08, rain: 0, fog: 0.12, mist: 0.05, wind: 0.22 },
      sunny: { cloud: 0.16, rain: 0, fog: 0.1, mist: 0.04, wind: 0.28 },
      overcast: { cloud: 0.78, rain: 0, fog: 0.32, mist: 0.16, wind: 0.45 },
      mist: { cloud: 0.5, rain: 0, fog: 0.66, mist: 0.85, wind: 0.12 },
      drizzle: { cloud: 0.86, rain: 0.28, fog: 0.45, mist: 0.25, wind: 0.4 },
      rain: { cloud: 0.94, rain: 0.78, fog: 0.55, mist: 0.35, wind: 0.62 },
      storm: { cloud: 1, rain: 1, fog: 0.62, mist: 0.4, wind: 1 },
      fog: { cloud: 0.72, rain: 0, fog: 0.95, mist: 0.9, wind: 0.09 },
    }[t];
    this.cloud = damp(this.cloud, target.cloud, 0.35, dt);
    this.rain = damp(this.rain, target.rain, 0.5, dt);
    this.fog = damp(this.fog, target.fog, 0.3, dt);
    this.mist = damp(this.mist, target.mist, 0.25, dt);
    this.wind = damp(this.wind, target.wind, 0.4, dt);

    // wetness accumulates with rain and dries slowly
    if (this.rain > 0.1) {
      this.wetness = clamp(this.wetness + dt * (0.012 + this.rain * 0.02), 0, 1);
    } else {
      this.wetness = clamp(this.wetness - dt * 0.004 * (1 + this.temperature / 30), 0, 1);
    }

    // natural weather changes
    this.changeTimer -= dt;
    if (this.changeTimer <= 0) {
      this.changeTimer = this.rng.range(110, 240);
      this.targetKind = this.nextWeather();
      this.applyWeatherParams(this.targetKind);
      this.rollForecast();
    }

    this.updateSky(dt, cameraPos);
    this.updateRain(dt, cameraPos);
    this.updateMist(dt, cameraPos);

    // lightning
    if (this.kind === 'storm' && this.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.range(9, 22);
        this.lightning = 1;
        this.onThunder?.();
      }
    }
    this.lightning = Math.max(0, this.lightning - dt * 3.4);
    this.sun.intensity += this.lightning * 3.5;
  }

  private updateSky(dt: number, cameraPos: THREE.Vector3) {
    const dayT = clamp((this.hour - 6.4) / 12.6, 0, 1);
    const elev = Math.sin(dayT * Math.PI) * (0.52 + this.biome.elevation * 0.01);
    const azim = lerp(-1.25, 1.25, dayT);
    this.sunDir.set(Math.cos(azim) * Math.cos(elev), Math.sin(elev), Math.sin(azim) * Math.cos(elev) * 0.75).normalize();
    const dayF = clamp(this.sunDir.y * 3.2, 0, 1);
    const twilight = smoothstep(0.0, 0.32, this.sunDir.y) * smoothstep(0.62, 0.24, this.sunDir.y);
    const groundY = cameraPos.y > -900 ? this.biome.elevation : 0;
    this.sky.position.set(cameraPos.x, cameraPos.y - 2, cameraPos.z);
    void groundY;

    const u = this.skyMat.uniforms;
    const skyTopDay = new THREE.Color(this.biome.skyColor).multiplyScalar(0.92);
    const skyHorizonDay = new THREE.Color(this.biome.fogColor).lerp(new THREE.Color('#e2dcc4'), 0.35);
    const cTop = new THREE.Color('#0a1220');
    const cHorizon = new THREE.Color('#1a2230');
    const dawnHorizon = new THREE.Color('#c98a52');
    const dayTop = skyTopDay.clone().lerp(new THREE.Color('#5d6a6e'), this.cloud * 0.7);
    const dayHorizon = skyHorizonDay.clone().lerp(new THREE.Color('#9aa09a'), this.cloud * 0.6);

    const t = new THREE.Color();
    const h = new THREE.Color();
    const nightF = 1 - smoothstep(-0.06, 0.16, this.sunDir.y);
    t.copy(dayTop).lerp(cTop, nightF);
    h.copy(dayHorizon).lerp(cHorizon, nightF);
    h.lerp(dawnHorizon, twilight * 0.75);
    t.lerp(dawnHorizon.clone().multiplyScalar(0.5), twilight * 0.3);
    // fog / rain desaturation
    t.lerp(new THREE.Color('#6a7170'), this.fog * 0.25);
    h.lerp(new THREE.Color(this.biome.fogColor), this.fog * 0.35 + this.rain * 0.2);
    u.topColor.value.copy(t);
    u.horizonColor.value.copy(h);
    u.groundColor.value.copy(new THREE.Color(this.biome.groundColor2).multiplyScalar(0.55));
    const sunCol = new THREE.Color('#ffd9a0').lerp(new THREE.Color('#ff8a4a'), twilight);
    u.sunColor.value.copy(sunCol).multiplyScalar(1 - this.cloud * 0.65);
    u.sunDir.value.copy(this.sunDir);
    u.cloudCover.value = this.cloud;
    u.time.value += dt;
    u.night.value = nightF;
    u.haze.value = clamp(this.fog * 0.55 + this.mist * 0.25, 0, 0.85);

    // directional light follows the sun
    this.sun.color.copy(sunCol).lerp(new THREE.Color('#9fb6c8'), nightF);
    this.sun.intensity = (0.25 + dayF * 1.55) * (1 - this.cloud * 0.62) * (1 - this.rain * 0.25);
    this.sun.position.copy(this.sunDir).multiplyScalar(70).add(cameraPos);
    this.sun.target.position.copy(cameraPos);
    this.sun.target.updateMatrixWorld();
    this.hemi.intensity = 0.22 + dayF * 0.65 * (1 - this.cloud * 0.15);
    this.hemi.color.set(this.biome.hemiSky).lerp(new THREE.Color('#26313a'), nightF * 0.75);
    this.hemi.groundColor.set(this.biome.hemiGround);
    this.fill.intensity = 0.08 + dayF * 0.15;

    const fogColor = h.clone().lerp(new THREE.Color(this.biome.fogColor), 0.45);
    (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    (this.scene.fog as THREE.FogExp2).density =
      this.biome.fogDensity * (0.55 + this.fog * 2.1 + this.mist * 0.9) * (0.55 + dayF * 0.7);
    this.scene.background = null;
    this.sky.visible = true;
    this.sun.visible = true;
    this.temperature = this.biome.temperature + Math.sin((this.hour - 6) / 24 * TAU) * 3 - this.rain * 2.5;
    void mixHex;
  }

  private buildRain() {
    const count = 5200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rng = new RNG(7717);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-30, 30);
      pos[i * 3 + 1] = rng.range(-4, 26);
      pos[i * 3 + 2] = rng.range(-30, 30);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: rainStreakTexture(),
      size: 0.42,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      color: 0xdbe6ec,
      blending: THREE.NormalBlending,
    });
    this.rainPoints = new THREE.Points(geo, mat);
    this.rainPoints.frustumCulled = false;
    this.scene.add(this.rainPoints);
  }

  private updateRain(dt: number, cameraPos: THREE.Vector3) {
    const attr = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const speed = 16 + this.wind * 8;
    for (let i = 0; i < attr.count; i++) {
      arr[i * 3 + 1] -= speed * dt;
      arr[i * 3] -= this.wind * 3 * dt;
      if (arr[i * 3 + 1] < cameraPos.y - 4) {
        arr[i * 3] = cameraPos.x + (Math.random() - 0.5) * 40;
        arr[i * 3 + 1] = cameraPos.y + 22 + Math.random() * 8;
        arr[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 40;
      }
    }
    attr.needsUpdate = true;
    this.rainPoints.position.set(0, 0, 0);
    const m = this.rainPoints.material as THREE.PointsMaterial;
    m.opacity = clamp(this.rain * 0.8, 0, 0.7);
    this.rainPoints.visible = this.rain > 0.02;
    (this.rainPoints.geometry as THREE.BufferGeometry).setDrawRange(0, Math.floor(attr.count * clamp(this.rain * 1.2, 0, 1)));
  }

  private buildMist() {
    const rng = new RNG(4412);
    for (let i = 0; i < 22; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mistTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0xdfe4dc,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      s.scale.set(rng.range(14, 30), rng.range(5, 10), 1);
      s.position.set(rng.range(-40, 40), rng.range(0.3, 2.2), rng.range(-40, 40));
      s.userData.drift = rng.range(-0.25, 0.25);
      s.userData.baseY = s.position.y;
      s.userData.phase = rng.range(0, TAU);
      this.mistSprites.push(s);
      this.scene.add(s);
    }
  }

  private updateMist(dt: number, cameraPos: THREE.Vector3) {
    for (let i = 0; i < this.mistSprites.length; i++) {
      const s = this.mistSprites[i];
      s.position.x += s.userData.drift * dt * (0.4 + this.wind);
      if (s.position.x > cameraPos.x + 42) s.position.x -= 84;
      if (s.position.x < cameraPos.x - 42) s.position.x += 84;
      if (s.position.z > cameraPos.z + 42) s.position.z -= 84;
      if (s.position.z < cameraPos.z - 42) s.position.z += 84;
      s.position.y = cameraPos.y + 0.4 + Math.sin(performance.now() * 0.0002 + s.userData.phase) * 0.35;
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity = this.mist * 0.11 * (0.6 + 0.4 * Math.sin(performance.now() * 0.0003 + s.userData.phase));
    }
  }

  dispose() {
    this.scene.remove(this.sky, this.sun, this.hemi, this.fill, this.rainPoints);
    for (const s of this.mistSprites) {
      this.scene.remove(s);
      (s.material as THREE.SpriteMaterial).dispose();
    }
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();
  }
}
