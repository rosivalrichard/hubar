/* Encyclopedia, collections, challenges, achievements and the library shell. */

import { el, icon } from './dom';
import { isSk, LOCALE } from '../i18n';
import { RARITY_NAME, RARITY_COLOR, KIND_LABEL, type Rarity, type SpecialKind } from '../game/specimens';
import { WEATHER_LABEL, type WeatherKind } from '../game/weather';
import { WILDLIFE_IDS, WILDLIFE_NAME } from '../game/wildlife';
import {
  S,
  ACHIEVEMENTS,
  challengeList,
  discoveredCount,
  speciesRecord,
  biomeProgress,
} from '../game/state';
import {
  ALL_SPECIES,
  SPECIES_BY_ID,
  EDIBILITY_LABEL,
  edibilityColor,
  isEdible,
  isDangerous,
  seasonText,
  SPECIES_COUNT,
} from '../data/species';
import { BIOMES, BIOME_BY_ID, type BiomeId } from '../data/biomes';
import { speciesPlate } from '../three/plates';
import { buildMarket } from './market';
import { buildQuiz } from './quiz';
import { formatMoney } from '../core/util';

export type LibraryKind = 'encyclopedia' | 'collections' | 'museum' | 'challenges' | 'achievements' | 'market' | 'knowledge';

export class Library {
  onBack: () => void;
  private kind: LibraryKind = 'encyclopedia';
  private scrollY = 0;

  constructor(onBack: () => void) {
    this.onBack = onBack;
  }

  show(kind: LibraryKind) {
    this.kind = kind;
    const root = document.getElementById('ui-root') as HTMLElement;
    root.innerHTML = '';
    root.classList.remove('hidden');
    let node: HTMLElement;
    if (kind === 'market') node = buildMarket(this.onBack, (n) => this.sfx(n), () => this.rerender());
    else if (kind === 'knowledge') node = buildQuiz(this.onBack, (n) => this.sfx(n));
    else node = this.buildScreen(kind);
    root.appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
  }

  private sfx(name?: string) {
    const g = (window as unknown as { hubarGame?: { audio?: { sfx: (n: string) => void } } }).hubarGame;
    g?.audio?.sfx(name || 'click');
  }

  private rerender() {
    this.show(this.kind);
  }

  private navBar(active: LibraryKind) {
    const items: { id: LibraryKind; label: string; icon: string }[] = [
      { id: 'encyclopedia', label: 'Encyclopedia', icon: 'book' },
      { id: 'collections', label: 'Collections', icon: 'basket' },
      { id: 'museum', label: 'Museum', icon: 'star' },
      { id: 'challenges', label: 'Challenges', icon: 'target' },
      { id: 'achievements', label: 'Achievements', icon: 'star' },
      { id: 'market', label: 'Market', icon: 'coin' },
      { id: 'knowledge', label: 'Knowledge', icon: 'eye' },
    ];
    return `<nav class="library-nav">${items
      .map((i) => `<button class="lib-tab ${i.id === active ? 'on' : ''}" data-lib="${i.id}">${icon(i.icon, 15)} ${i.label}</button>`)
      .join('')}</nav>`;
  }

  private head(title: string, kicker: string, extra = '') {
    return `<header class="library-head">
      <button class="btn ghost back-btn" data-back>${icon('back', 16)} Back</button>
      <div class="sheet-title"><div class="kicker">${kicker}</div><h2>${title}</h2></div>
      ${extra}
      ${this.navBar(this.kind)}
    </header>`;
  }

  private wireShell(root: HTMLElement) {
    (root.querySelector('[data-back]') as HTMLElement)?.addEventListener('click', () => this.onBack());
    root.querySelectorAll<HTMLElement>('[data-lib]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx();
        this.show(b.dataset.lib as LibraryKind);
      })
    );
  }

  private buildScreen(kind: LibraryKind): HTMLElement {
    const root = el('div', { class: 'screen library-screen' });
    if (kind === 'encyclopedia') return this.encyclopedia(root);
    if (kind === 'collections') return this.collections(root);
    if (kind === 'museum') return this.museum(root);
    if (kind === 'challenges') return this.challenges(root);
    return this.achievements(root);
  }

  /* ------------------------------------------------------------------ */

  private encyclopedia(root: HTMLElement): HTMLElement {
    const discovered = ALL_SPECIES.filter((s) => speciesRecord(s.id).discovered);
    let selected = (discovered[0] || ALL_SPECIES[0]).id;
    let q = '';
    let cat: 'all' | 'edible' | 'poison' | 'found' | 'missing' = 'all';
    let biome: BiomeId | 'all' = 'all';
    let season = 'all';

    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        ${this.head('The Field Archive', 'Encyclopedia', `<div class="head-count">${discoveredCount()} / ${SPECIES_COUNT} species named</div>`)}
        <div class="enc-grid">
          <aside class="enc-list">
            <div class="enc-search"><span>${icon('eye', 15)}</span><input class="search-input" placeholder="Search species, Slovak or English name…" /></div>
            <div class="enc-filters">
              <div class="chips compact">
                <button class="chip on" data-cat="all">All</button>
                <button class="chip" data-cat="edible">Edible</button>
                <button class="chip" data-cat="poison">Poisonous</button>
                <button class="chip" data-cat="found">Found</button>
                <button class="chip" data-cat="missing">Missing</button>
              </div>
              <select class="select-input" data-biome>
                <option value="all">All forests</option>
                ${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}
              </select>
              <select class="select-input" data-season>
                <option value="all">All seasons</option>
                <option value="spring">Spring</option>
                <option value="summer">Summer</option>
                <option value="autumn">Autumn</option>
                <option value="winter">Winter</option>
              </select>
            </div>
            <div class="enc-rows"></div>
          </aside>
          <section class="enc-detail"></section>
        </div>
      </div>
    `;
    const rowsEl = root.querySelector('.enc-rows') as HTMLElement;
    const detailEl = root.querySelector('.enc-detail') as HTMLElement;

    const inSeason = (months: number[], s: string) => {
      if (s === 'all') return true;
      if (s === 'spring') return months.some((m) => m >= 3 && m <= 5);
      if (s === 'summer') return months.some((m) => m >= 6 && m <= 8);
      if (s === 'autumn') return months.some((m) => m >= 9 && m <= 11);
      return months.some((m) => m === 12 || m <= 2);
    };

    const renderRows = () => {
      let list = ALL_SPECIES.slice();
      if (q) list = list.filter((s) => (s.sci + ' ' + s.sk + ' ' + s.en).toLowerCase().includes(q.toLowerCase()));
      if (cat === 'edible') list = list.filter(isEdible);
      if (cat === 'poison') list = list.filter(isDangerous);
      if (cat === 'found') list = list.filter((s) => speciesRecord(s.id).discovered);
      if (cat === 'missing') list = list.filter((s) => !speciesRecord(s.id).discovered);
      const bf: BiomeId | 'all' = biome;
      if (bf !== 'all') list = list.filter((s) => s.biomes.includes(bf));
      if (season !== 'all') list = list.filter((s) => inSeason(s.months, season));
      rowsEl.innerHTML = '';
      if (!list.length) {
        rowsEl.innerHTML = '<div class="empty-note">No species match those filters.</div>';
        return;
      }
      for (const sp of list) {
        const rec = speciesRecord(sp.id);
        const row = el('button', { class: `enc-row ${sp.id === selected ? 'on' : ''} ${rec.discovered ? '' : 'locked'}` });
        row.innerHTML = `
          <span class="enc-dot" style="background:${rec.discovered ? edibilityColor(sp.edibility) : 'transparent'}"></span>
          <span class="enc-names"><b>${sp.sci}</b><em>${sp.sk}</em></span>
          <span class="enc-flag">${rec.discovered ? (sp.rarity >= 4 ? icon('star', 12) : '') : icon('close', 11)}</span>
        `;
        row.addEventListener('click', () => {
          selected = sp.id;
          this.sfx('page');
          renderRows();
          renderDetail();
          detailEl.scrollTop = 0;
        });
        rowsEl.appendChild(row);
      }
    };

    const renderDetail = () => {
      const sp = SPECIES_BY_ID[selected];
      if (!sp) return;
      const rec = speciesRecord(sp.id);
      const found = rec.discovered;
      const lookalikes = sp.lookalikes.map((id) => SPECIES_BY_ID[id]).filter(Boolean);
      const family = sp.family;
      const plate = found ? `<img src="${speciesPlate(sp.id)}" alt="${sp.sci}" />` : `<div class="plate-locked">${icon('eye', 34)}<span>Undocumented</span><em>Identify it in the forest to open this entry</em></div>`;
      detailEl.innerHTML = `
        <div class="detail-plate ${found ? '' : 'locked'}">
          ${plate}
          <div class="plate-caption">${found ? `HUBÁR archive plate · ${sp.sci}` : 'No plate available'}</div>
          ${found ? `<div class="plate-badge" style="border-color:${edibilityColor(sp.edibility)};color:${edibilityColor(sp.edibility)}">${EDIBILITY_LABEL[sp.edibility]}</div>` : ''}
        </div>
        <div class="detail-body">
          <div class="detail-names">
            <div class="kicker">${family}${found ? '' : ' · undiscovered'}</div>
            <h2>${found ? sp.sci : 'Unknown species'}</h2>
            <div class="detail-sub">${found ? (isSk ? sp.sk : `${sp.sk} · ${sp.en}`) : `Recorded from ${sp.biomes.map((b) => BIOME_BY_ID[b].name).join(', ')}`}</div>
          </div>
          ${found ? `
            <div class="detail-badges">
              <span class="badge" style="--b:${edibilityColor(sp.edibility)}">${EDIBILITY_LABEL[sp.edibility]}</span>
              <span class="badge muted">Rarity ${'●'.repeat(sp.rarity)}${'○'.repeat(5 - sp.rarity)}</span>
              <span class="badge muted">ID difficulty ${sp.difficulty}/5</span>
              <span class="badge muted">${sp.form}</span>
            </div>
            <p class="detail-intro">${sp.intro}</p>
            <div class="detail-info">
              <div><span>Season</span><b>${seasonText(sp)}</b></div>
              <div><span>Habitat</span><b>${sp.biomes.map((b) => BIOME_BY_ID[b].name.replace(' Forest', '')).join(', ')}</b></div>
              <div><span>Substrate</span><b>${sp.substrate.join(', ')}</b></div>
              <div><span>Cap</span><b>${sp.visual.capDiameter[0]}–${sp.visual.capDiameter[1]} cm</b></div>
              <div><span>Spore print</span><b>${sp.visual.sporeColor}</b></div>
              <div><span>Market value</span><b>${isEdible(sp) ? formatMoney(sp.value) : 'none'}</b></div>
            </div>
            <div class="detail-section toxin ${isDangerous(sp) ? 'danger' : 'safe'}">
              <div class="ds-label">${isDangerous(sp) ? 'Toxicity' : 'Edibility'}</div>
              <p>${sp.toxin}</p>
              <p class="small">${sp.edibleNote}</p>
            </div>
            <div class="detail-section">
              <div class="ds-label">Identification</div>
              <div class="id-features">
                <div><span>Cap</span><p>${sp.obs.cap}</p></div>
                <div><span>Stem</span><p>${sp.obs.stem}</p></div>
                <div><span>Hymenium</span><p>${sp.obs.under}</p></div>
                <div><span>Base</span><p>${sp.obs.base}</p></div>
                <div><span>Habitat</span><p>${sp.obs.habitat}</p></div>
                <div><span>Smell</span><p>${sp.obs.smell}</p></div>
                <div><span>Spores</span><p>${sp.obs.spore}</p></div>
              </div>
            </div>
            <div class="detail-section">
              <div class="ds-label">Similar species</div>
              <div class="lookalikes">
                ${lookalikes.map((l) => `<button class="lookalike ${speciesRecord(l.id).discovered ? '' : 'unknown'}" data-look="${l.id}">
                  <span class="lk-name">${speciesRecord(l.id).discovered ? l.sci : 'Undiscovered species'}</span>
                  <span class="lk-sub">${speciesRecord(l.id).discovered ? l.sk : 'name it in the field'}</span>
                  ${speciesRecord(l.id).discovered ? `<span class="lk-ed" style="color:${edibilityColor(l.edibility)}">${EDIBILITY_LABEL[l.edibility]}</span>` : ''}
                </button>`).join('') || '<span class="key-note">No close lookalikes recorded.</span>'}
              </div>
            </div>
            <div class="detail-section">
              <div class="ds-label">Field notes</div>
              <ul class="note-list">${sp.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
            </div>
            <div class="detail-stats">
              <span>${rec.collected} collected</span>
              <span>${rec.correct} correct ID${rec.correct === 1 ? '' : 's'}</span>
              <span>${rec.wrong} mistake${rec.wrong === 1 ? '' : 's'}</span>
              <span>${rec.photos} photo${rec.photos === 1 ? '' : 's'}</span>
              <span>Largest ${rec.bestSizeCm ? rec.bestSizeCm + ' cm' : '—'}</span>
            </div>
          ` : `
            <div class="locked-body">
              <p>This entry is sealed until you identify the species in the field.</p>
              <div class="locked-facts">
                <div><span>Family</span><b>${family}</b></div>
                <div><span>Season</span><b>${seasonText(sp)}</b></div>
                <div><span>Forests</span><b>${sp.biomes.map((b) => BIOME_BY_ID[b].name).join(', ')}</b></div>
                <div><span>Hymenium</span><b>${sp.visual.gillType}</b></div>
              </div>
              <p class="key-note">The archive gives you the family and the season, not the answer. Walk, observe, compare.</p>
              <button class="btn ghost" data-lib="challenges">${icon('target', 15)} See today's challenges</button>
            </div>
          `}
        </div>
      `;
      detailEl.querySelectorAll<HTMLElement>('[data-look]').forEach((b) =>
        b.addEventListener('click', () => {
          selected = b.dataset.look!;
          this.sfx('page');
          renderRows();
          renderDetail();
        })
      );
      detailEl.querySelectorAll<HTMLElement>('[data-lib]').forEach((b) =>
        b.addEventListener('click', () => this.show(b.dataset.lib as LibraryKind))
      );
    };

    const search = root.querySelector('.search-input') as HTMLInputElement;
    search.addEventListener('input', () => {
      q = search.value;
      renderRows();
    });
    root.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        cat = b.dataset.cat as typeof cat;
        this.sfx();
        root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
        renderRows();
      })
    );
    (root.querySelector('[data-biome]') as HTMLSelectElement).addEventListener('change', (e) => {
      biome = (e.target as HTMLSelectElement).value as BiomeId | 'all';
      renderRows();
    });
    (root.querySelector('[data-season]') as HTMLSelectElement).addEventListener('change', (e) => {
      season = (e.target as HTMLSelectElement).value;
      renderRows();
    });

    this.wireShell(root);
    renderRows();
    renderDetail();
    return root;
  }

  /* ------------------------------------------------------------------ */

  private museum(root: HTMLElement): HTMLElement {
    const r = S.records;
    const sp = (id: string) => (id ? SPECIES_BY_ID[id] : null);
    const recCell = (label: string, value: string, id: string) =>
      `<div class="mus-rec"><em>${label}</em><b>${value}</b><span>${id && speciesRecord(id).discovered ? sp(id)?.sk : '—'}</span></div>`;
    const weight = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g} g`);
    const unusual = S.museum.find((e) => e.id === r.mostUnusual);
    let filter = 0;
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        ${this.head('Museum', 'Extraordinary finds', `<div class="head-count">${S.museum.length} exhibits</div>`)}
        <div class="mus-records">
          ${recCell('Largest mushroom', r.largestCapCm ? `${r.largestCapCm.toFixed(1)} cm` : '—', r.largestCapSpecies)}
          ${recCell('Heaviest mushroom', r.heaviestG ? weight(r.heaviestG) : '—', r.heaviestSpecies)}
          ${recCell('Rarest find', r.rarest ? RARITY_NAME[r.rarest as Rarity] : '—', r.rarestSpecies)}
          ${recCell('Largest cluster', r.largestCluster ? `${r.largestCluster}` : '—', r.largestClusterSpecies)}
          ${recCell('Most unusual', unusual ? (unusual.special ? KIND_LABEL[unusual.special as Exclude<SpecialKind, null>] : RARITY_NAME[unusual.rarity as Rarity]) : '—', unusual?.speciesId ?? '')}
          ${recCell('Species discovered', `${S.stats.speciesDiscovered} / ${SPECIES_COUNT}`, '')}
          ${recCell('Mushrooms collected', `${S.stats.mushroomsCollected}`, '')}
        </div>
        <div class="mus-section-title">Wildlife journal <em>${Object.keys(S.wildlife).length} / ${WILDLIFE_IDS.length}</em></div>
        <div class="wild-grid">
          ${WILDLIFE_IDS.map((w) => {
            const rec = S.wildlife[w];
            return `<div class="wild-cell ${rec ? 'seen' : ''}"><b>${rec ? WILDLIFE_NAME[w] : '?'}</b><span>${rec ? `${rec.count}× · ${new Date(rec.first).toLocaleDateString(LOCALE)}` : 'not yet seen'}</span></div>`;
          }).join('')}
        </div>
        <div class="mus-section-title">Exhibits</div>
        <div class="collection-filters chips compact">
          <button class="chip on" data-rf="0">All</button>
          ${[5, 4, 3, 2].map((x) => `<button class="chip" data-rf="${x}" style="--rc:${RARITY_COLOR[x as Rarity]}">${RARITY_NAME[x as Rarity]}</button>`).join('')}
        </div>
        <div class="album-grid mus-grid"></div>
        <div class="collection-foot"><span>Every extraordinary specimen you find is saved here automatically — even the ones you leave in the forest.</span></div>
      </div>
    `;
    const grid = root.querySelector('.mus-grid') as HTMLElement;
    const render = () => {
      grid.innerHTML = '';
      const list = S.museum.filter((e) => !filter || e.rarity === filter).sort((a, b) => b.rarity - a.rarity || b.weightG - a.weightG);
      if (!list.length) {
        grid.innerHTML = `<div class="mus-empty">No exhibits yet. Rare specimens — giants, fused twins, huge clusters — appear once in a while. Look closely; rain and the right season help.</div>`;
        return;
      }
      for (const e of list) {
        const s2 = SPECIES_BY_ID[e.speciesId];
        if (!s2) continue;
        const known = e.identified || speciesRecord(e.speciesId).discovered;
        const card = el('div', { class: 'album-card found mus-card' });
        card.style.setProperty('--rc', RARITY_COLOR[e.rarity as Rarity]);
        const d = new Date(e.date);
        card.innerHTML = `
          <div class="album-plate"><img loading="lazy" src="${speciesPlate(e.speciesId, 'side', 256)}" alt="${s2.sci}" /><span class="mus-badge">${RARITY_NAME[e.rarity as Rarity]}</span></div>
          <div class="album-name">${known ? s2.sci : 'Unknown species'}<span>${known ? s2.sk : '—'}${e.special ? ` · ${KIND_LABEL[e.special as Exclude<SpecialKind, null>]}` : ''}</span></div>
          <div class="mus-dims"><span>Ø ${e.capCm.toFixed(1)} cm</span><span>${e.heightCm.toFixed(1)} cm</span><span>≈ ${weight(e.weightG)}</span>${e.bodies > 1 ? `<span>×${e.bodies}</span>` : ''}</div>
          <div class="album-meta"><span>${BIOME_BY_ID[e.biome as BiomeId]?.name ?? e.biome}</span><em>${d.toLocaleDateString(LOCALE)}</em></div>
          <div class="album-meta"><span>${WEATHER_LABEL[e.weather as WeatherKind] ?? ''}</span><em>${e.collected ? 'collected' : 'left in the forest'}</em></div>`;
        grid.appendChild(card);
      }
    };
    root.querySelectorAll<HTMLElement>('[data-rf]').forEach((b) =>
      b.addEventListener('click', () => {
        filter = Number(b.dataset.rf);
        this.sfx();
        root.querySelectorAll('[data-rf]').forEach((x) => x.classList.toggle('on', x === b));
        render();
      })
    );
    this.wireShell(root);
    render();
    return root;
  }

  private collections(root: HTMLElement): HTMLElement {
    let filter: BiomeId | 'all' = 'all';
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        ${this.head('Collections', 'The album', `<div class="head-count">${discoveredCount()} / ${SPECIES_COUNT} species</div>`)}
        <div class="collection-top">
          <div class="collection-hero">
            <div class="kicker">A season of walking</div>
            <h3>${S.stats.speciesDiscovered} species recorded</h3>
            <p>${S.stats.mushroomsCollected} mushrooms collected · ${S.stats.photosTaken} photographs · ${S.stats.identifiedCorrect} correct identifications.</p>
            <div class="progress-line"><span>Archive completion</span><div class="wide-bar"><i style="width:${(S.stats.speciesDiscovered / SPECIES_COUNT) * 100}%"></i></div><b>${Math.round((S.stats.speciesDiscovered / SPECIES_COUNT) * 100)}%</b></div>
          </div>
          <div class="biome-progress">
            ${BIOMES.map((b) => {
              const p = biomeProgress(b.id);
              return `<button class="bp-row" data-biome="${b.id}">
                <span class="bp-name">${b.name}</span>
                <div class="bp-bar"><i style="width:${p.pct * 100}%"></i></div>
                <span class="bp-count">${p.found}/${p.total}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="collection-filters chips compact">
          <button class="chip on" data-bf="all">All forests</button>
          ${BIOMES.map((b) => `<button class="chip" data-bf="${b.id}">${b.name}</button>`).join('')}
        </div>
        <div class="album-grid"></div>
        <div class="collection-foot">
          <span>${S.records.bestSpeciesCount} species in a single walk</span>
          <span>Longest streak ${S.stats.maxStreak}</span>
          <span>Best bolete ${S.records.bestBoleteCm.toFixed(1)} cm</span>
        </div>
      </div>
    `;
    const grid = root.querySelector('.album-grid') as HTMLElement;
    const renderAlbum = () => {
      grid.innerHTML = '';
      const list = ALL_SPECIES.filter((s) => filter === 'all' || s.biomes.includes(filter));
      for (const sp of list) {
        const rec = speciesRecord(sp.id);
        const card = el('button', { class: `album-card ${rec.discovered ? 'found' : 'locked'}` });
        card.innerHTML = rec.discovered
          ? `<div class="album-plate"><img loading="lazy" src="${speciesPlate(sp.id, 'side', 256)}" alt="${sp.sci}" /></div>
             <div class="album-name">${sp.sci}<span>${sp.sk}</span></div>
             <div class="album-meta"><span style="color:${edibilityColor(sp.edibility)}">${EDIBILITY_LABEL[sp.edibility]}</span><em>${rec.collected} picked</em></div>`
          : `<div class="album-plate locked">${icon('eye', 24)}</div>
             <div class="album-name">Undiscovered<span>${BIOME_BY_ID[sp.biomes[0]]?.name || ''}</span></div>
             <div class="album-meta"><span>not yet named</span><em>${seasonText(sp)}</em></div>`;
        card.addEventListener('click', () => {
          this.sfx('page');
          this.show('encyclopedia');
        });
        grid.appendChild(card);
      }
    };
    root.querySelectorAll<HTMLElement>('[data-bf]').forEach((b) =>
      b.addEventListener('click', () => {
        filter = b.dataset.bf as BiomeId | 'all';
        this.sfx();
        root.querySelectorAll('[data-bf]').forEach((x) => x.classList.toggle('on', x === b));
        renderAlbum();
      })
    );
    root.querySelectorAll<HTMLElement>('.bp-row').forEach((b) =>
      b.addEventListener('click', () => {
        filter = b.dataset.biome as BiomeId;
        root.querySelectorAll('[data-bf]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.bf === filter));
        this.sfx();
        renderAlbum();
      })
    );
    this.wireShell(root);
    renderAlbum();
    return root;
  }

  /* ------------------------------------------------------------------ */

  private challenges(root: HTMLElement): HTMLElement {
    let tab: 'daily' | 'weekly' | 'special' = 'daily';
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        ${this.head('Challenges', 'Field objectives', `<div class="head-count">${S.stats.challengesCompleted} completed</div>`)}
        <div class="challenge-tabs">
          <button class="lib-tab on" data-tab="daily">Daily</button>
          <button class="lib-tab" data-tab="weekly">Weekly</button>
          <button class="lib-tab" data-tab="special">Special</button>
          <span class="challenge-reset" data-reset-note></span>
        </div>
        <div class="challenge-grid"></div>
        <p class="challenge-note">Daily objectives reset at midnight. Weekly objectives reset on Monday. Progress is shared across all walks.</p>
      </div>
    `;
    const grid = root.querySelector('.challenge-grid') as HTMLElement;
    const note = root.querySelector('[data-reset-note]') as HTMLElement;
    const render = () => {
      note.textContent = tab === 'daily' ? `resets tonight · ${new Date().toLocaleDateString(LOCALE, { weekday: 'long' })}` : tab === 'weekly' ? `week ${S.challenges.weeklyKey}` : 'persistent objectives';
      grid.innerHTML = '';
      for (const { def, entry } of challengeList(tab)) {
        const card = el('div', { class: `challenge-card ${entry.completed ? 'done' : ''}` });
        card.innerHTML = `
          <div class="ch-head">
            <span class="ch-kind">${tab}</span>
            <span class="ch-reward">+${def.rewardXp} XP${def.rewardMoney ? ` · ${formatMoney(def.rewardMoney)}` : ''}</span>
          </div>
          <h3>${def.title}</h3>
          <p>${def.desc}</p>
          <div class="ch-progress"><div class="ch-bar"><i style="width:${Math.min(100, (entry.progress / def.target) * 100)}%"></i></div><span>${Math.min(entry.progress, def.target)} / ${def.target}</span></div>
          ${entry.completed ? `<div class="ch-done">${icon('check', 14)} Complete</div>` : ''}
        `;
        grid.appendChild(card);
      }
    };
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.tab as typeof tab;
        this.sfx();
        root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        render();
      })
    );
    this.wireShell(root);
    render();
    return root;
  }

  /* ------------------------------------------------------------------ */

  private achievements(root: HTMLElement): HTMLElement {
    const unlocked = ACHIEVEMENTS.filter((a) => S.achievements[a.id]);
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        ${this.head('Achievements', 'A record of the seasons', `<div class="head-count">${unlocked.length} / ${ACHIEVEMENTS.length}</div>`)}
        <div class="achievement-summary">
          <div class="ach-ring"><b>${Math.round((unlocked.length / ACHIEVEMENTS.length) * 100)}%</b><span>complete</span></div>
          <div class="ach-copy">
            <h3>${unlocked.length === 0 ? 'The journal is still blank' : unlocked.length < ACHIEVEMENTS.length / 2 ? 'A promising first season' : unlocked.length < ACHIEVEMENTS.length ? 'An experienced eye' : 'A complete archive'}</h3>
            <p>${unlocked.length} of ${ACHIEVEMENTS.length} records unlocked. Some are earned by walking; others only by knowing exactly what you are looking at.</p>
          </div>
        </div>
        <div class="achievement-grid">
          ${ACHIEVEMENTS.map((a) => {
            const when = S.achievements[a.id];
            return `<div class="ach-card ${when ? 'unlocked' : 'locked'}">
              <div class="ach-ico">${icon(a.icon, 22)}</div>
              <div class="ach-body">
                <b>${a.name}</b>
                <p>${a.desc}</p>
                <span>${when ? `unlocked ${new Date(when).toLocaleDateString(LOCALE)}` : 'locked'}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    this.wireShell(root);
    return root;
  }
}

