/* Procedural forest soundscape with Web Audio. No sample files. */

import { clamp, RNG } from '../core/util';

export type SfxName =
  | 'pick'
  | 'collect'
  | 'paper'
  | 'identify'
  | 'wrong'
  | 'levelup'
  | 'click'
  | 'sell'
  | 'achievement'
  | 'thunder'
  | 'camera'
  | 'knife'
  | 'page';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private rainGain!: GainNode;
  private leafGain!: GainNode;
  private trafficGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private rng = new RNG(6621);
  private birdTimer = 2;
  private insectTimer = 1.2;
  private owlTimer = 24;
  private started = false;
  volume = 0.75;
  muted = false;
  private biomeMood = 0.5;
  private timeOfDay = 12;
  private weatherRain = 0;
  private weatherWind = 0.3;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // reusable noise
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = white * 0.55 + last * 2.2;
    }
    this.noiseBuffer = buf;

    const makeNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      return src;
    };

    // wind bed
    const windSrc = makeNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    // wind whistle
    const whistleSrc = makeNoise();
    const whistleBand = ctx.createBiquadFilter();
    whistleBand.type = 'bandpass';
    whistleBand.frequency.value = 860;
    whistleBand.Q.value = 7;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;
    whistleSrc.connect(whistleBand).connect(this.whistleGain).connect(this.master);
    whistleSrc.start();

    // rain bed
    const rainSrc = makeNoise();
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 1100;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass';
    rainLp.frequency.value = 7200;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainHp).connect(rainLp).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    // leaves / undergrowth rustle
    const leafSrc = makeNoise();
    const leafBand = ctx.createBiquadFilter();
    leafBand.type = 'bandpass';
    leafBand.frequency.value = 2800;
    leafBand.Q.value = 1.4;
    this.leafGain = ctx.createGain();
    this.leafGain.gain.value = 0.006;
    leafSrc.connect(leafBand).connect(this.leafGain).connect(this.master);
    leafSrc.start();

    // distant rumble bed
    const rumbleSrc = makeNoise();
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 130;
    this.trafficGain = ctx.createGain();
    this.trafficGain.gain.value = 0;
    rumbleSrc.connect(rumbleLp).connect(this.trafficGain).connect(this.master);
    rumbleSrc.start();

    this.started = true;
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx!.currentTime, 0.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx!.currentTime, 0.1);
  }

  update(dt: number, params: { rain: number; wind: number; timeOfDay: number; biomeMood: number; indoor: boolean }) {
    if (!this.started || !this.ctx) return;
    this.weatherRain = params.rain;
    this.weatherWind = params.wind;
    this.timeOfDay = params.timeOfDay;
    this.biomeMood = params.biomeMood;
    const now = this.ctx.currentTime;
    const night = params.timeOfDay < 6 || params.timeOfDay > 19.5;
    const rainAmt = params.rain;
    const windAmt = params.wind;
    this.windGain.gain.setTargetAtTime(0.012 + windAmt * 0.05, now, 0.7);
    this.windFilter.frequency.setTargetAtTime(280 + windAmt * 420, now, 0.9);
    this.whistleGain.gain.setTargetAtTime(windAmt > 0.5 ? (windAmt - 0.5) * 0.024 : 0, now, 1.1);
    this.rainGain.gain.setTargetAtTime(rainAmt * 0.14, now, 0.6);
    this.leafGain.gain.setTargetAtTime(0.003 + windAmt * 0.016 * (1 - rainAmt * 0.5), now, 0.8);
    this.trafficGain.gain.setTargetAtTime(night ? 0.002 : 0.0, now, 2);

    this.birdTimer -= dt;
    this.insectTimer -= dt;
    this.owlTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = this.rng.range(1.4, 6.5) / (1 + rainAmt * 3);
      if (rainAmt < 0.55 && !night) this.birdCall();
      else if (rainAmt < 0.4 && night && this.rng.chance(0.15)) this.owlCall();
    }
    if (this.insectTimer <= 0) {
      this.insectTimer = this.rng.range(0.6, 2.2);
      if (rainAmt < 0.3) this.insect();
    }
    if (this.owlTimer <= 0) {
      this.owlTimer = this.rng.range(18, 44);
      if (night && rainAmt < 0.3) this.owlCall();
    }
  }

  private env(gain: GainNode, peak: number, attack: number, decay: number, when = 0) {
    const t = this.ctx!.currentTime + when;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private pan(value: number) {
    if (!this.ctx) return null;
    const p = this.ctx.createStereoPanner?.();
    if (p) p.pan.value = clamp(value, -1, 1);
    return p;
  }

  private birdCall() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const p = this.pan(this.rng.range(-0.9, 0.9));
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = this.rng.range(1900, 3600);
    const notes = this.rng.int(2, 5);
    osc.frequency.setValueAtTime(base, t0);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * this.rng.range(0.08, 0.16);
      osc.frequency.setValueAtTime(base * this.rng.range(0.9, 1.15), t);
      osc.frequency.exponentialRampToValueAtTime(base * this.rng.range(1.2, 1.7), t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * this.rng.range(0.7, 0.95), t + 0.1);
    }
    const level = this.rng.range(0.002, 0.009) * (1 - (this.weatherRain || 0) * 0.5);
    this.env(g, level, 0.02, notes * 0.16);
    osc.connect(g);
    if (p) {
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    osc.start(t0);
    osc.stop(t0 + notes * 0.16 + 0.3);
  }

  private owlCall() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t0);
    osc.frequency.exponentialRampToValueAtTime(290, t0 + 0.45);
    this.env(g, 0.012, 0.08, 0.6);
    const p = this.pan(this.rng.range(-0.8, 0.8));
    osc.connect(g);
    if (p) {
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 1);
  }

  private insect() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = this.rng.range(4200, 6200);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = this.rng.range(18, 42);
    lfoGain.gain.value = this.rng.range(0.0015, 0.004);
    lfo.connect(lfoGain).connect(g.gain);
    this.env(g, this.rng.range(0.0008, 0.0025), 0.3, this.rng.range(0.6, 1.8));
    const p = this.pan(this.rng.range(-1, 1));
    osc.connect(g);
    if (p) {
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + 2.4);
    lfo.stop(t0 + 2.4);
  }

  footstep(surface: string, running: boolean) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = this.rng.range(0.75, 1.25);
    const filter = ctx.createBiquadFilter();
    const map: Record<string, [BiquadFilterType, number, number]> = {
      leaves: ['bandpass', 2100, 1.1],
      needles: ['bandpass', 3200, 1.4],
      mud: ['lowpass', 380, 0.8],
      moss: ['lowpass', 620, 0.9],
      stones: ['bandpass', 1500, 2.2],
      grass: ['bandpass', 2600, 0.8],
    };
    const [type, freq, q] = map[surface] || map.leaves;
    filter.type = type;
    filter.frequency.value = freq * this.rng.range(0.8, 1.2);
    filter.Q.value = q;
    const g = ctx.createGain();
    this.env(g, running ? 0.1 : 0.062, 0.006, running ? 0.13 : 0.1);
    src.connect(filter).connect(g).connect(this.master);
    const offset = this.rng.range(0, 2);
    src.start(ctx.currentTime, offset, 0.3);
    // slight low thump
    const thump = ctx.createOscillator();
    const tg = ctx.createGain();
    thump.frequency.value = this.rng.range(58, 82);
    this.env(tg, running ? 0.05 : 0.03, 0.005, 0.09);
    thump.connect(tg).connect(this.master);
    thump.start();
    thump.stop(ctx.currentTime + 0.15);
  }

  sfx(name: SfxName) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      const t = t0 + delay;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    const noise = (dur: number, freq: number, type: BiquadFilterType, vol: number, delay = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = this.rng.range(0.9, 1.1);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      const t = t0 + delay;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master!);
      src.start(t, this.rng.range(0, 1.6), dur + 0.05);
    };
    switch (name) {
      case 'click':
        tone(880, 0.05, 'sine', 0.03, 660);
        break;
      case 'pick':
        noise(0.18, 900, 'bandpass', 0.09);
        tone(240, 0.1, 'sine', 0.03, 180);
        break;
      case 'collect':
        noise(0.22, 1600, 'bandpass', 0.06);
        tone(520, 0.12, 'sine', 0.035, 440);
        tone(660, 0.16, 'sine', 0.03, 590, 0.06);
        break;
      case 'paper':
        noise(0.16, 3400, 'highpass', 0.045);
        break;
      case 'page':
        noise(0.26, 2400, 'bandpass', 0.05);
        break;
      case 'knife':
        noise(0.1, 5200, 'highpass', 0.05);
        break;
      case 'camera':
        noise(0.05, 2200, 'bandpass', 0.06);
        noise(0.08, 1400, 'bandpass', 0.05, 0.09);
        break;
      case 'identify':
        tone(523, 0.2, 'sine', 0.05);
        tone(659, 0.24, 'sine', 0.045, undefined, 0.08);
        tone(784, 0.4, 'sine', 0.04, undefined, 0.16);
        break;
      case 'wrong':
        tone(196, 0.28, 'sawtooth', 0.035, 150);
        tone(147, 0.34, 'sine', 0.04, 120, 0.05);
        break;
      case 'levelup':
        [392, 523, 659, 784, 1047].forEach((f, i) => {
          tone(f, 0.5, 'sine', 0.05, undefined, i * 0.11);
          tone(f / 2, 0.5, 'triangle', 0.022, undefined, i * 0.11);
        });
        break;
      case 'achievement':
        tone(880, 0.5, 'sine', 0.04);
        tone(1320, 0.6, 'sine', 0.025, undefined, 0.1);
        break;
      case 'sell':
        tone(1180, 0.08, 'square', 0.018);
        tone(1560, 0.12, 'square', 0.014, undefined, 0.07);
        break;
      case 'thunder':
        noise(2.6, 160, 'lowpass', 0.28);
        noise(3.4, 90, 'lowpass', 0.2, 0.2);
        tone(48, 2.8, 'sine', 0.12, 34);
        break;
    }
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
