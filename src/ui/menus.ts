/* Main menu, expedition setup, pause, results and settings screens. */

import { el, icon, money, weatherIcon, timeAgo } from './dom';
import {
  S,
  ACHIEVEMENTS,
  EQUIPMENT,
  LEVELS,
  addMoney,
  basketCapacity,
  basketValue,
  buyEquipment,
  challengeList,
  checkAchievements,
  discoveredCount,
  isBiomeUnlocked,
  levelForXp,
  levelProgress,
  saveNow,
  toast,
} from '../game/state';
import { ALL_SPECIES, SPECIES_BY_ID, SPECIES_COUNT } from '../data/species';
import { BIOMES, BIOME_BY_ID, type BiomeId } from '../data/biomes';
import { dateKey, formatMoney } from '../core/util';
import { currentMission, careerCheck } from '../game/career';
import { Library } from './library';
import type { Mode } from '../game/state';
import { LANG, isSk, setLang, tr, type Lang } from '../i18n';

export interface GameApi {
  startExpedition(cfg: { mode: Mode; biome: BiomeId; isoDate: string; hour: number; weather: string; challengeId?: string | null }): void;
  resumeExpedition(): void;
  resumePlay(): void;
  endExpedition(): void;
  quitToMenu(): void;
  audio: { sfx(name: string): void };
}

const SEASONS = [
  { id: 'spring', label: 'Spring', sub: 'April · morels', date: '2027-04-24' },
  { id: 'summer', label: 'High summer', sub: 'July · boletes', date: '2027-07-18' },
  { id: 'autumn', label: 'Early autumn', sub: 'September · peak season', date: '2027-09-19' },
  { id: 'late', label: 'Late autumn', sub: 'October · oysters, milkcaps', date: '2027-10-26' },
];

const START_TIMES = [
  { label: 'Dawn', hour: 6.1 },
  { label: 'Morning', hour: 8.4 },
  { label: 'Afternoon', hour: 14.2 },
  { label: 'Dusk', hour: 17.4 },
];

const WEATHERS = [
  { id: 'natural', label: 'Natural', icon: 'cloud' },
  { id: 'clear', label: 'Clear', icon: 'sun' },
  { id: 'overcast', label: 'Overcast', icon: 'cloud' },
  { id: 'drizzle', label: 'Light rain', icon: 'drizzle' },
  { id: 'rain', label: 'Rain', icon: 'rain' },
  { id: 'mist', label: 'Mist', icon: 'mist' },
  { id: 'fog', label: 'Fog', icon: 'mist' },
];

export class Menus {
  root: HTMLElement;
  library: Library;
  game: GameApi | null = null;
  screen = 'main';
  private selectedMode: Mode = 'free';
  private selectedBiome: BiomeId = 'spruce';
  private selectedSeason = 'autumn';
  private selectedTime = 'Morning';
  private selectedWeather = 'natural';
  private selectedChallenge: string | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.library = new Library(() => {
      if (S.run) this.showPause();
      else this.showMain();
    });
    this.buildIntro();
  }

  bind(game: GameApi) {
    this.game = game;
  }

  private bindLang(wrap: HTMLElement) {
    wrap.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        const l = b.dataset.lang as Lang;
        if (l === LANG) return;
        this.sfx();
        saveNow();
        setLang(l);
        location.reload();
      })
    );
  }

  private sfx(n = 'click') {
    this.game?.audio.sfx(n);
  }

  private buildIntro() {
    // no-op: all screens are rebuilt on demand
  }

  hide() {
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
  }

  showMain() {
    this.screen = 'main';
    const p = levelProgress(S.profile.xp);
    const disc = discoveredCount();
    const run = S.run;
    const daily = challengeList('daily');
    const mission = currentMission();
    const recent = this.lastDiscovery();
    const wrap = el('div', { class: 'screen main-screen' });
    wrap.innerHTML = `
      <div class="screen-bg"></div>
      <div class="menu-scrim"></div>
      <div class="main-shell">
        <aside class="brand-col">
          <div class="brand-block">
            <div class="lang-switch" data-no-tr>${(['sk', 'en'] as Lang[]).map((l) => `<button class="${LANG === l ? 'on' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>
            <h1 class="wordmark">HUBÁR</h1>
            <div class="wordmark-sub">Mushroom Hunter</div>
            <p class="brand-tagline">A quiet walk through Slovak forests. Real species, real confusion, real consequences.</p>
          </div>
          <div class="profile-mini">
            <div class="pm-level">${p.level}</div>
            <div class="pm-body">
              <div class="pm-name">${p.name}</div>
              <div class="pm-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
              <div class="pm-meta">${S.profile.xp.toLocaleString()} XP${p.next ? ` · ${(p.next.xp - S.profile.xp).toLocaleString()} to ${p.next.name}` : ' · Master'}</div>
            </div>
            <div class="pm-money">${formatMoney(S.profile.money)}</div>
          </div>
          <nav class="main-nav">
            <button data-act="expedition" class="nav-item primary">${icon('compass', 18)}<span>New expedition</span>${icon('arrow', 16)}</button>
            <button data-act="continue" class="nav-item ${run ? '' : 'disabled'}">${icon('leaf', 18)}<span>Continue in the forest</span>${run ? `<em>${BIOME_BY_ID[run.biome]?.name || ''}</em>` : '<em>no active walk</em>'}</button>
            <button data-act="encyclopedia" class="nav-item">${icon('book', 18)}<span>Encyclopedia</span><em>${disc} / ${SPECIES_COUNT}</em></button>
            <button data-act="collections" class="nav-item">${icon('basket', 18)}<span>Collections</span><em>${disc} found</em></button>
            <button data-act="challenges" class="nav-item">${icon('target', 18)}<span>Challenges</span><em>${S.stats.challengesCompleted} done</em></button>
            <button data-act="achievements" class="nav-item">${icon('star', 18)}<span>Achievements</span><em>${Object.keys(S.achievements).length} / ${ACHIEVEMENTS.length}</em></button>
            <button data-act="market" class="nav-item">${icon('coin', 18)}<span>Market &amp; equipment</span><em>${S.basket.length} in basket</em></button>
            <button data-act="knowledge" class="nav-item">${icon('eye', 18)}<span>Knowledge test</span><em>best ${S.records.knowledgeBest}/10</em></button>
            <button data-act="settings" class="nav-item">${icon('info', 18)}<span>Settings</span></button>
          </nav>
          <div class="brand-foot">
            <p>An educational simulation. Never identify a real mushroom for the table with this game.</p>
          </div>
        </aside>
        <main class="main-panel">
          <div class="panel-topline">
            <span>${dateKey()}</span>
            <span>Season of ${this.seasonName()}</span>
            <span>${S.stats.daysPlayed.length} days in the forest</span>
          </div>
          <section class="hero-card">
            <div class="hero-copy">
              <div class="kicker">${run ? 'Expedition in progress' : 'The forest is waiting'}</div>
              <h2>${run ? `${BIOME_BY_ID[run.biome]?.name}, ${run.weather}` : 'Walk slowly. Look down.'}</h2>
              <p>${run
                ? `A walk started ${timeAgo(run.startedAt)} in the ${BIOME_BY_ID[run.biome]?.name.toLowerCase()}. Your basket holds ${S.basket.length} specimens.`
                : 'Rain, temperature and season decide what fruits. Mushrooms appear where their host trees and dead wood are — not where you expect them.'}</p>
              <div class="hero-actions">
                <button class="btn primary lg" data-act="${run ? 'continue' : 'expedition'}">${run ? 'Return to the forest' : 'Start an expedition'}${icon('arrow', 17)}</button>
                <button class="btn ghost lg" data-act="encyclopedia">${icon('book', 17)} Open field guide</button>
              </div>
            </div>
            <div class="hero-side">
              <div class="stat-line"><span>Species discovered</span><b>${disc}</b></div>
              <div class="stat-line"><span>Correct identifications</span><b>${S.stats.identifiedCorrect}</b></div>
              <div class="stat-line"><span>Mushrooms collected</span><b>${S.stats.mushroomsCollected}</b></div>
              <div class="stat-line"><span>Distance walked</span><b>${(S.stats.distanceWalked / 1000).toFixed(1)} km</b></div>
              <div class="season-progress">
                <div class="sp-label">Encyclopedia</div>
                <div class="sp-bar"><i style="width:${Math.round((disc / SPECIES_COUNT) * 100)}%"></i></div>
                <div class="sp-note">${Math.round((disc / SPECIES_COUNT) * 100)}% of all species</div>
              </div>
            </div>
          </section>
          <div class="panel-grid">
            <section class="panel-card">
              <div class="card-head"><div><div class="kicker">Today</div><h3>Daily challenges</h3></div><button class="text-btn" data-act="challenges">All challenges ${icon('arrow', 13)}</button></div>
              <div class="mini-list">
                ${daily.map(({ def, entry }) => `
                  <div class="mini-item ${entry.completed ? 'done' : ''}">
                    <span class="mini-check">${entry.completed ? icon('check', 13) : ''}</span>
                    <span class="mini-title">${def.title}<small>${def.desc}</small></span>
                    <span class="mini-prog">${Math.min(entry.progress, def.target)}/${def.target}</span>
                  </div>
                `).join('')}
              </div>
            </section>
            <section class="panel-card">
              <div class="card-head"><div><div class="kicker">Career</div><h3>${mission ? mission.mission.title : 'All missions complete'}</h3></div><span class="career-step">${mission ? `${mission.index + 1} / 10` : '—'}</span></div>
              ${mission ? `
                <p class="card-desc">${mission.mission.desc}</p>
                <div class="wide-bar"><i style="width:${Math.round((mission.progress / mission.mission.target) * 100)}%"></i></div>
                <div class="bar-note">${mission.progress} / ${mission.mission.target} · +${mission.mission.rewardXp} XP</div>
              ` : '<p class="card-desc">You have finished the career. The forest is yours now — chase the special challenges.</p>'}
              <div class="fact-line">${icon('leaf', 15)} <span>${recent}</span></div>
            </section>
          </div>
          <footer class="menu-disclaimer">
            <b>Read this.</b> HUBÁR is a game. Its models, descriptions and habitat notes are simplified for play. Several of the species shown can kill a person. Never eat a wild mushroom without an expert, in-person identification.
          </footer>
        </main>
      </div>
    `;
    this.mount(wrap);
    this.bindLang(wrap);
    this.wireActions(wrap);
  }

  private seasonName() {
    const d = new Date(dateKey() + 'T12:00:00');
    const m = d.getMonth();
    return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  }

  private lastDiscovery() {
    const found = ALL_SPECIES.filter((s) => S.species[s.id]?.discovered && S.species[s.id]?.firstFound);
    if (!found.length) return 'A field journal is only useful once you start writing in it.';
    found.sort((a, b) => (S.species[b.id].firstFound || '').localeCompare(S.species[a.id].firstFound || ''));
    const sp = found[0];
    return `Last new species: ${sp.sci} — ${sp.sk}, found ${timeAgo(new Date(S.species[sp.id].firstFound!).getTime())}.`;
  }

  private mount(node: HTMLElement) {
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.root.appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
  }

  private wireActions(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        this.sfx('click');
        if (act === 'expedition') this.showExpedition('free');
        else if (act === 'continue') this.continueRun();
        else if (act === 'encyclopedia') this.library.show('encyclopedia');
        else if (act === 'collections') this.library.show('collections');
        else if (act === 'challenges') this.library.show('challenges');
        else if (act === 'achievements') this.library.show('achievements');
        else if (act === 'market') this.library.show('market');
        else if (act === 'knowledge') this.library.show('knowledge');
        else if (act === 'settings') this.showSettings();
        else if (act === 'resume') this.game?.resumePlay();
        else if (act === 'main') this.showMain();
        else if (act === 'end') this.game?.endExpedition();
      });
    });
  }

  refresh() {
    if (this.screen === 'main') this.showMain();
  }

  private continueRun() {
    if (!S.run) {
      toast('No active walk', 'Start a new expedition.', 'info');
      return;
    }
    this.game?.resumeExpedition();
  }

  /* ------------------------------------------------------------------ */

  showExpedition(mode: Mode) {
    this.screen = 'expedition';
    this.selectedMode = mode;
    if (!isBiomeUnlocked(this.selectedBiome)) {
      const first = BIOMES.find((b) => isBiomeUnlocked(b.id));
      this.selectedBiome = (first?.id || 'spruce') as BiomeId;
    }
    const wrap = el('div', { class: 'screen expedition-screen' });
    wrap.innerHTML = `
      <div class="screen-bg"></div>
      <div class="sheet">
        <header class="sheet-head">
          <button class="btn ghost back-btn" data-back>${icon('back', 16)} Main menu</button>
          <div class="sheet-title">
            <div class="kicker">Prepare the walk</div>
            <h2>New expedition</h2>
          </div>
          <div class="lvl-note">${levelForXp(S.profile.xp).level} · ${levelForXp(S.profile.xp).name}</div>
        </header>
        <div class="mode-tabs">
          ${this.modeTab('free', 'Free exploration', 'No limits. Walk, look, learn.')}
          ${this.modeTab('career', 'Career', 'Follow the field journal missions.')}
          ${this.modeTab('challenge', 'Challenge', 'One objective. One walk.')}
          ${this.modeTab('survival', 'Survival', 'Carry provisions, watch the light, return before dark.')}
        </div>
        <div class="expedition-grid">
          <section class="biome-section">
            <div class="section-label">Forest</div>
            <div class="biome-grid">
              ${BIOMES.map((b) => this.biomeCard(b.id)).join('')}
            </div>
          </section>
          <aside class="setup-side">
            <div class="setup-block">
              <div class="section-label">Season</div>
              <div class="seg">

                ${SEASONS.map((s) => `<button class="seg-btn ${this.selectedSeason === s.id ? 'on' : ''}" data-season="${s.id}"><b>${s.label}</b><span>${s.sub}</span></button>`).join('')}
              </div>
            </div>
            <div class="setup-block">
              <div class="section-label">Start of walk</div>
              <div class="chips">
                ${START_TIMES.map((t) => `<button class="chip ${this.selectedTime === t.label ? 'on' : ''}" data-time="${t.label}">${t.label}</button>`).join('')}
              </div>
            </div>
            <div class="setup-block">
              <div class="section-label">Weather</div>
              <div class="chips">
                ${WEATHERS.map((w) => `<button class="chip ${this.selectedWeather === w.id ? 'on' : ''}" data-weather="${w.id}">${weatherIcon(w.icon, 14)} ${w.label}</button>`).join('')}
              </div>
            </div>
            ${mode === 'challenge' ? `
            <div class="setup-block challenge-select">
              <div class="section-label">Objective</div>
              <div class="challenge-list-mini">
                ${challengeList('daily').map(({ def, entry }) => `<button class="challenge-option ${this.selectedChallenge === def.id ? 'on' : ''}" data-challenge="${def.id}"><b>${def.title}</b><span>${def.desc}</span><em>${entry.completed ? 'already complete' : `+${def.rewardXp} XP`}</em></button>`).join('')}
                ${challengeList('special').slice(0, 3).map(({ def, entry }) => `<button class="challenge-option ${this.selectedChallenge === def.id ? 'on' : ''}" data-challenge="${def.id}"><b>${def.title}</b><span>${def.desc}</span><em>${entry.completed ? 'already complete' : `+${def.rewardXp} XP`}</em></button>`).join('')}
              </div>
              <div class="key-note">A challenge run ends when you complete the objective or stop at the cabin.</div>
            </div>` : ''}
            <div class="setup-block">
              <div class="section-label">Your kit</div>
              <div class="kit-row">${EQUIPMENT.filter((e) => S.equipment[e.id]).map((e) => `<span class="kit-item" title="${e.name}">${icon(e.icon, 16)}</span>`).join('')}</div>
              <div class="key-note">Basket ${S.basket.length} / ${basketCapacity()} · Provisions ${S.provisions}</div>
            </div>
            <button class="btn primary xl start-btn" data-start>${icon('compass', 18)} Enter the forest</button>
            <div class="key-note center">Mouse to look · WASD to walk · Shift run · Ctrl crouch</div>
          </aside>
        </div>
      </div>
    `;
    this.mount(wrap);
    (wrap.querySelector('[data-back]') as HTMLElement).addEventListener('click', () => {
      this.sfx();
      this.showMain();
    });
    wrap.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.showExpedition(b.dataset.mode as Mode);
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-biome]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.biome as BiomeId;
        if (!isBiomeUnlocked(id)) {
          const b2 = BIOME_BY_ID[id];
          toast('Forest locked', `Reach level ${b2.unlockLevel} to walk here.`, 'bad');
          return;
        }
        this.sfx();
        this.selectedBiome = id;
        this.showExpedition(this.selectedMode);
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-season]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.selectedSeason = b.dataset.season!;
        this.showExpedition(this.selectedMode);
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-time]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.selectedTime = b.dataset.time!;
        this.showExpedition(this.selectedMode);
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-weather]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.selectedWeather = b.dataset.weather!;
        this.showExpedition(this.selectedMode);
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-challenge]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.selectedChallenge = b.dataset.challenge!;
        this.showExpedition(this.selectedMode);
      })
    );
    (wrap.querySelector('[data-start]') as HTMLElement).addEventListener('click', () => this.startSelected());
  }

  private modeTab(mode: Mode, label: string, desc: string) {
    return `<button class="mode-tab ${this.selectedMode === mode ? 'on' : ''}" data-mode="${mode}"><b>${label}</b><span>${desc}</span></button>`;
  }

  private biomeCard(id: BiomeId) {
    const b = BIOME_BY_ID[id];
    const locked = !isBiomeUnlocked(id);
    const found = ALL_SPECIES.filter((s) => s.biomes.includes(id) && S.species[s.id]?.discovered).length;
    const total = ALL_SPECIES.filter((s) => s.biomes.includes(id)).length;
    return `
      <button class="biome-card ${this.selectedBiome === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-biome="${id}" style="--accent:${b.accent}">
        <div class="biome-wash"></div>
        <div class="biome-head"><span class="biome-name">${b.name}</span>${isSk ? '' : `<span class="biome-sk">${b.sk}</span>`}</div>
        <div class="biome-tag">${b.tagline}</div>
        <div class="biome-foot">
          <span>${found} / ${total} species</span>
          <span>${locked ? `${icon('skull', 13)} level ${b.unlockLevel}` : `${b.mushroomCount} fruit bodies`}</span>
        </div>
        ${locked ? '<div class="lock-badge">locked</div>' : ''}
      </button>
    `;
  }

  private startSelected() {
    if (!this.game) return;
    if (this.selectedMode === 'challenge' && !this.selectedChallenge) {
      toast('Choose an objective', 'Pick a challenge for this walk.', 'bad');
      return;
    }
    const season = SEASONS.find((s) => s.id === this.selectedSeason)!;
    const time = START_TIMES.find((t) => t.label === this.selectedTime)!;
    if (!isBiomeUnlocked(this.selectedBiome)) {
      toast('Forest locked', 'Your level is not high enough yet.', 'bad');
      return;
    }
    const cfg = {
      mode: this.selectedMode,
      biome: this.selectedBiome,
      isoDate: season.date,
      hour: time.hour,
      weather: this.selectedWeather === 'natural' ? '' : this.selectedWeather,
      challengeId: this.selectedMode === 'challenge' ? this.selectedChallenge : null,
    };
    this.hide();
    this.game.startExpedition(cfg);
  }

  /* ------------------------------------------------------------------ */

  showPause() {
    this.screen = 'pause';
    const p = levelProgress(S.profile.xp);
    const run = S.run;
    if (!run) {
      this.showMain();
      return;
    }
    const wrap = el('div', { class: 'screen pause-screen' });
    wrap.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="pause-card">
        <div class="kicker">Expedition paused</div>
        <h2>${BIOME_BY_ID[run.biome]?.name || run.biome}</h2>
        <div class="pause-meta">
          <span>${icon('clock', 14)} ${Math.floor(run.hour)}:${String(Math.floor((run.hour % 1) * 60)).padStart(2, '0')}</span>
          <span>${icon('basket', 14)} ${S.basket.length} / ${basketCapacity()}</span>
          <span>${icon('leaf', 14)} ${run.discoveries.length} species</span>
          <span>${icon('coin', 14)} ${formatMoney(basketValue())} basket value</span>
        </div>
        <div class="pause-actions">
          <button class="btn primary lg" data-act="resume">${icon('arrow', 17)} Back to the forest</button>
          <button class="btn ghost" data-open="encyclopedia">${icon('book', 16)} Encyclopedia</button>
          <button class="btn ghost" data-open="collections">${icon('basket', 16)} Basket &amp; collections</button>
          <button class="btn ghost" data-open="challenges">${icon('target', 16)} Challenges</button>
          <button class="btn ghost" data-open="market">${icon('coin', 16)} Market</button>
          <button class="btn ghost" data-act="settings">${icon('info', 16)} Settings</button>
          <button class="btn danger" data-act="end">End the walk</button>
        </div>
        <div class="pause-foot">
          <span>Level ${p.level} · ${p.name}</span>
          <span>Score this walk: ${run.correctIds * 10 + run.discoveries.length * 25 + run.edibleCollected * 6}</span>
        </div>
      </div>
    `;
    this.mount(wrap);
    (wrap.querySelector('[data-act="resume"]') as HTMLElement).addEventListener('click', () => {
      this.sfx();
      this.hide();
      this.game?.resumePlay();
    });
    (wrap.querySelector('[data-act="end"]') as HTMLElement).addEventListener('click', () => {
      this.sfx();
      this.game?.endExpedition();
    });
    (wrap.querySelector('[data-act="settings"]') as HTMLElement).addEventListener('click', () => this.showSettings());
    wrap.querySelectorAll<HTMLElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => this.library.show(b.dataset.open as never))
    );
  }

  showSettings() {
    this.screen = 'settings';
    const s = S.settings;
    const wrap = el('div', { class: 'screen settings-screen' });
    wrap.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="sheet narrow">
        <header class="sheet-head">
          <button class="btn ghost back-btn" data-back>${icon('back', 16)} Back</button>
          <div class="sheet-title"><div class="kicker">Configuration</div><h2>Settings</h2></div>
        </header>
        <div class="settings-list">
          <div class="setting">
            <div><b>Language</b><span>Game and encyclopedia language. The game reloads.</span></div>
            <div class="chips" data-no-tr>
              ${(['sk', 'en'] as Lang[]).map((l) => `<button class="chip ${LANG === l ? 'on' : ''}" data-lang="${l}">${l === 'sk' ? 'Slovenčina' : 'English'}</button>`).join('')}
            </div>
          </div>
          <div class="setting">
            <div><b>Mouse sensitivity</b><span>Look speed in the forest</span></div>
            <input type="range" min="0.3" max="2.2" step="0.05" value="${s.sensitivity}" data-set="sensitivity" />
            <em data-val="sensitivity">${s.sensitivity.toFixed(2)}</em>
          </div>
          <div class="setting">
            <div><b>Field of view</b><span>Degrees of view</span></div>
            <input type="range" min="62" max="88" step="1" value="${s.fov}" data-set="fov" />
            <em data-val="fov">${s.fov}°</em>
          </div>
          <div class="setting">
            <div><b>Volume</b><span>Forest ambience and feedback</span></div>
            <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume" />
            <em data-val="volume">${Math.round(s.volume * 100)}%</em>
          </div>
          <div class="setting">
            <div><b>Day length</b><span>Real minutes per in-game day</span></div>
            <input type="range" min="6" max="30" step="1" value="${s.dayLengthMinutes}" data-set="dayLengthMinutes" />
            <em data-val="dayLengthMinutes">${s.dayLengthMinutes} min</em>
          </div>
          <div class="setting">
            <div><b>Graphics quality</b><span>Shadows, foliage density, draw distance. Applies on the next walk.</span></div>
            <div class="chips">
              ${['low', 'medium', 'high'].map((q) => `<button class="chip ${s.quality === q ? 'on' : ''}" data-quality="${q}">${q}</button>`).join('')}
            </div>
          </div>
          <div class="setting toggle-row">
            <div><b>Invert mouse Y</b><span>Invert vertical look</span></div>
            <button class="toggle ${s.invertY ? 'on' : ''}" data-toggle="invertY"><i></i></button>
          </div>
          <div class="setting toggle-row">
            <div><b>In-game hints</b><span>Show contextual control prompts</span></div>
            <button class="toggle ${s.hints ? 'on' : ''}" data-toggle="hints"><i></i></button>
          </div>
          <div class="setting toggle-row">
            <div><b>Subtitles</b><span>Ambient sound descriptions</span></div>
            <button class="toggle ${s.subtitles ? 'on' : ''}" data-toggle="subtitles"><i></i></button>
          </div>
        </div>
        <div class="danger-zone">
          <div><b>Reset all progress</b><span>Erases the encyclopedia, money, equipment and records.</span></div>
          <button class="btn danger" data-reset>Reset save</button>
        </div>
      </div>
    `;
    this.mount(wrap);
    (wrap.querySelector('[data-back]') as HTMLElement).addEventListener('click', () => {
      this.sfx();
      if (S.run) this.showPause();
      else this.showMain();
    });
    wrap.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.set as keyof typeof s;
        const val = parseFloat(inp.value);
        (s as any)[key] = val;
        const out = wrap.querySelector(`[data-val="${key}"]`) as HTMLElement;
        if (key === 'volume') out.textContent = `${Math.round(val * 100)}%`;
        else if (key === 'dayLengthMinutes') out.textContent = `${val} min`;
        else if (key === 'fov') out.textContent = `${val}°`;
        else out.textContent = val.toFixed(2);
        if (key === 'volume') this.game?.audio.sfx('click');
        saveNow();
      });
    });
    wrap.querySelectorAll<HTMLElement>('[data-quality]').forEach((b) =>
      b.addEventListener('click', () => {
        s.quality = b.dataset.quality as typeof s.quality;
        saveNow();
        this.sfx();
        wrap.querySelectorAll('[data-quality]').forEach((x) => x.classList.toggle('on', x === b));
      })
    );
    wrap.querySelectorAll<HTMLElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.toggle as 'invertY' | 'hints' | 'subtitles';
        s[key] = !s[key];
        b.classList.toggle('on', s[key]);
        saveNow();
        this.sfx();
      })
    );
    this.bindLang(wrap);
    (wrap.querySelector('[data-reset]') as HTMLElement).addEventListener('click', () => {
      if (confirm(tr('Erase all progress? This cannot be undone.'))) {
        import('../game/state').then((m) => {
          m.resetSave();
          location.reload();
        });
      }
    });
  }

  showSummary(data: { score: number; xpGained: number; moneyGained: number; summary: any }) {
    this.screen = 'summary';
    const run = data.summary;
    const wrap = el('div', { class: 'screen summary-screen' });
    const speciesFound = (run?.discoveries || []).map((id: string) => SPECIES_BY_ID[id]).filter(Boolean);
    wrap.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="sheet narrow summary-sheet">
        <div class="kicker">Back at the cabin</div>
        <h2>Expedition complete</h2>
        <div class="summary-score">
          <div class="score-main"><span>Score</span><b>${data.score}</b></div>
          <div class="score-grid">
            <div><span>Species found</span><b>${run?.discoveries.length || 0}</b></div>
            <div><span>Correct IDs</span><b>${run?.correctIds || 0}</b></div>
            <div><span>Mistakes</span><b>${run?.wrongIds || 0}</b></div>
            <div><span>Edible collected</span><b>${run?.edibleCollected || 0}</b></div>
            <div><span>XP earned</span><b>+${data.xpGained}</b></div>
            <div><span>Money change</span><b>${data.moneyGained >= 0 ? '+' : ''}${formatMoney(data.moneyGained)}</b></div>
          </div>
        </div>
        ${speciesFound.length ? `<div class="summary-species"><div class="section-label">Species recorded</div><div class="species-chips">${speciesFound.map((s: any) => `<span class="species-chip">${s.sci}</span>`).join('')}</div></div>` : ''}
        <div class="summary-basket">
          <div class="section-label">Basket</div>
          ${S.basket.length ? `<div class="key-note">${S.basket.length} specimens, estimated value ${formatMoney(basketValue())}. Sell them at the market to see what you actually picked.</div>` : '<div class="key-note">The basket is empty.</div>'}
        </div>
        <div class="summary-actions">
          <button class="btn primary lg" data-act2="market">${icon('coin', 17)} Go to the market</button>
          <button class="btn ghost" data-act2="main">${icon('back', 16)} Return to the cabin</button>
          <button class="btn ghost" data-act2="again">${icon('compass', 16)} Another walk</button>
        </div>
        <p class="summary-note">Every specimen is examined by the buyer. Poisonous mushrooms in the basket cost you money and reputation.</p>
      </div>
    `;
    this.mount(wrap);
    wrap.querySelectorAll<HTMLElement>('[data-act2]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        const a = b.dataset.act2;
        if (a === 'market') this.library.show('market');
        else if (a === 'main') this.showMain();
        else if (a === 'again') this.showExpedition('free');
      })
    );
  }

  updateAfterSale() {
    this.refresh();
  }
}
