/* Minimal in-game HUD. */

import { el, icon, weatherIcon, clear } from './dom';
import { isSk } from '../i18n';

export interface HudState {
  level: number;
  levelName: string;
  xpPct: number;
  xpText: string;
  time: string;
  weather: string;
  temperature: number;
  biome: string;
  mode: string;
  basket: number;
  capacity: number;
  weight: number;
  stamina: number;
  crouched: boolean;
  compass: number;
  prompt: string | null;
  promptAction: string | null;
  objective: string | null;
  objectiveProgress: number | null;
  survival: { energy: number; provisions: number; distance: number; dusk: string } | null;
  gps: string | null;
  night: boolean;
}

export class HUD {
  root: HTMLElement;
  private levelChip: HTMLElement;
  private xpFill: HTMLElement;
  private clock: HTMLElement;
  private weather: HTMLElement;
  private temp: HTMLElement;
  private biome: HTMLElement;
  private mode: HTMLElement;
  private basket: HTMLElement;
  private weight: HTMLElement;
  private staminaWrap: HTMLElement;
  private staminaFill: HTMLElement;
  private promptEl: HTMLElement;
  private promptAction: HTMLElement;
  private objectiveEl: HTMLElement;
  private compassStrip: HTMLElement;
  private reticle: HTMLElement;
  private survivalEl: HTMLElement;
  private gpsEl: HTMLElement;
  private toasts: HTMLElement;
  private hint: HTMLElement;
  private lastToast = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.className = 'hud hidden';
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-level">
            <div class="lvl-num"></div>
            <div class="lvl-body">
              <div class="lvl-name"></div>
              <div class="xpbar"><i></i></div>
              <div class="lvl-xp"></div>
            </div>
          </div>
        </div>
        <div class="hud-objective"></div>
        <div class="hud-right">
          <div class="hud-time">
            <div class="clock"></div>
            <div class="wx"><span class="wx-ico"></span><span class="wx-label"></span></div>
            <div class="temp"></div>
          </div>
          <div class="compass" data-no-tr><div class="compass-strip"></div><div class="compass-needle"></div></div>
          <div class="hud-location">
            <span class="loc-icon">${icon('pin', 13)}</span>
            <span class="loc-name"></span>
            <span class="mode-chip"></span>
          </div>
        </div>
      </div>
      <div class="reticle"></div>
      <div class="hud-bottom">
        <div class="hud-basket">
          <span class="b-ico">${icon('basket', 17)}</span>
          <span class="b-count"></span>
          <span class="b-sep"></span>
          <span class="b-weight"></span>
        </div>
        <div class="hud-prompt-wrap">
          <div class="hud-prompt"></div>
          <div class="hud-hint"></div>
        </div>
        <div class="hud-stamina"><div class="stam-bar"><i></i></div><span class="stam-label">Stamina</span></div>
      </div>
      <div class="hud-survival"></div>
      <div class="hud-gps"></div>
      <div class="hud-toasts"></div>
    `;
    this.levelChip = root.querySelector('.lvl-num')!;
    this.xpFill = root.querySelector('.xpbar i')!;
    this.clock = root.querySelector('.clock')!;
    this.weather = root.querySelector('.wx')!;
    this.temp = root.querySelector('.temp')!;
    this.biome = root.querySelector('.loc-name')!;
    this.mode = root.querySelector('.mode-chip')!;
    this.basket = root.querySelector('.b-count')!;
    this.weight = root.querySelector('.b-weight')!;
    this.staminaWrap = root.querySelector('.hud-stamina')!;
    this.staminaFill = root.querySelector('.stam-bar i')!;
    this.promptEl = root.querySelector('.hud-prompt')!;
    this.promptAction = root.querySelector('.hud-hint')!;
    this.objectiveEl = root.querySelector('.hud-objective')!;
    this.compassStrip = root.querySelector('.compass-strip')!;
    this.reticle = root.querySelector('.reticle')!;
    this.survivalEl = root.querySelector('.hud-survival')!;
    this.gpsEl = root.querySelector('.hud-gps')!;
    this.toasts = root.querySelector('.hud-toasts')!;
    this.hint = root.querySelector('.lvl-xp')!;
    this.buildCompass();
  }

  private buildCompass() {
    const marks: string[] = [];
    const labels: Record<number, string> = isSk
      ? { 0: 'S', 45: 'SV', 90: 'V', 135: 'JV', 180: 'J', 225: 'JZ', 270: 'Z', 315: 'SZ' }
      : { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const label = labels[d];
        marks.push(`<div class="compass-tick ${label ? 'major' : ''}" style="left:${(rep * 360 + d) * 2}px">${label ? `<span>${label}</span>` : ''}</div>`);
      }
    }
    this.compassStrip.innerHTML = marks.join('');
  }

  show() {
    this.root.classList.remove('hidden');
  }
  hide() {
    this.root.classList.add('hidden');
  }

  update(s: HudState) {
    this.levelChip.textContent = String(s.level);
    this.xpFill.style.width = `${Math.round(s.xpPct * 100)}%`;
    this.hint.textContent = s.xpText;
    this.clock.textContent = s.time;
    const wxIcon = this.weather.querySelector('.wx-ico')!;
    wxIcon.innerHTML = weatherIcon(s.weather, 15);
    (this.weather.querySelector('.wx-label') as HTMLElement).textContent = s.weather;
    this.temp.textContent = `${Math.round(s.temperature)}°C`;
    this.biome.textContent = s.biome;
    this.mode.textContent = s.mode;
    this.basket.textContent = `${s.basket} / ${s.capacity}`;
    this.weight.textContent = `${Math.round(s.weight)} g`;
    this.basket.classList.toggle('full', s.basket >= s.capacity);
    this.staminaFill.style.width = `${Math.round(s.stamina)}%`;
    this.staminaWrap.classList.toggle('low', s.stamina < 25);
    this.staminaWrap.classList.toggle('hidden', s.stamina > 99.5);
    this.reticle.classList.toggle('crouch', s.crouched);
    if (s.prompt) {
      this.promptEl.textContent = s.prompt;
      this.promptEl.classList.add('show');
      this.promptAction.textContent = s.promptAction || '';
      this.promptAction.classList.toggle('show', !!s.promptAction);
    } else {
      this.promptEl.classList.remove('show');
      this.promptAction.classList.remove('show');
    }
    if (s.objective) {
      this.objectiveEl.innerHTML = `<span class="obj-label">Objective</span><span class="obj-text">${s.objective}</span>${s.objectiveProgress !== null ? `<span class="obj-prog">${Math.round(s.objectiveProgress * 100)}%</span>` : ''}`;
      this.objectiveEl.classList.add('show');
    } else {
      this.objectiveEl.classList.remove('show');
    }
    this.compassStrip.style.transform = `translateX(${-s.compass * 2}px)`;
    this.root.classList.toggle('night', s.night);
    if (s.survival) {
      this.survivalEl.innerHTML = `
        <div class="surv-row"><span>Energy</span><div class="surv-bar"><i style="width:${Math.round(s.survival.energy)}%"></i></div></div>
        <div class="surv-row small"><span>Provisions <b>${s.survival.provisions}</b></span><span>${s.survival.dusk}</span><span>${s.survival.distance.toFixed(0)} m</span></div>
      `;
      this.survivalEl.classList.add('show');
    } else {
      this.survivalEl.classList.remove('show');
    }
    this.gpsEl.textContent = s.gps || '';
    this.gpsEl.classList.toggle('show', !!s.gps);
  }

  toast(title: string, body: string, kind: 'info' | 'good' | 'bad' | 'level') {
    const now = performance.now();
    if (now - this.lastToast < 120) return;
    this.lastToast = now;
    const t = el('div', { class: `toast ${kind}` });
    t.innerHTML = `<div class="toast-mark"></div><div><div class="toast-title">${title}</div>${body ? `<div class="toast-body">${body}</div>` : ''}</div>`;
    this.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 400);
    }, kind === 'level' ? 5200 : 3400);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  clearToasts() {
    clear(this.toasts);
  }

  flashPrompt(text: string) {
    this.promptEl.textContent = text;
    this.promptEl.classList.add('show', 'flash');
    setTimeout(() => this.promptEl.classList.remove('flash'), 300);
  }
}
