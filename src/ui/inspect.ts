/* Specimen inspection overlay: observe, key out, identify, photograph, collect. */

import { el, icon, money } from './dom';
import { isSk } from '../i18n';
import type { Species } from '../data/species-types';
import { EDIBILITY_LABEL, edibilityColor } from '../data/species';
import type { MushroomEntity } from '../game/spawner';
import { ALL_SPECIES } from '../data/species';
import { S, hasEquip } from '../game/state';

export type ObsKind = 'cap' | 'stem' | 'under' | 'base' | 'habitat' | 'smell' | 'spore';

export interface InspectHost {
  observe(kind: ObsKind): void;
  startSporePrint(): void;
  identify(speciesId: string): void;
  collect(): void;
  photograph(): void;
  leave(): void;
  playSound(name: string): void;
}

const OBS_META: { kind: ObsKind; label: string; icon: string; hint: string }[] = [
  { kind: 'cap', label: 'Cap', icon: 'leaf', hint: 'Shape, colour, surface, margin' },
  { kind: 'stem', label: 'Stem', icon: 'hand', hint: 'Shape, ring, surface' },
  { kind: 'under', label: 'Underside', icon: 'eye', hint: 'Gills, pores or ridges' },
  { kind: 'base', label: 'Stem base', icon: 'pin', hint: 'Volva, bulb, mycelium' },
  { kind: 'habitat', label: 'Habitat', icon: 'map', hint: 'Substrate and host trees' },
  { kind: 'smell', label: 'Smell', icon: 'info', hint: 'Aroma when crushed' },
  { kind: 'spore', label: 'Spore print', icon: 'clock', hint: 'Takes a few minutes' },
];

export class InspectPanel {
  root: HTMLElement;
  private host: InspectHost | null = null;
  private entity: MushroomEntity | null = null;
  private species: Species | null = null;
  private revealed = new Set<ObsKind>();
  private listBody: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private actionsEl: HTMLElement;
  private obsEl: HTMLElement;
  private overlay: HTMLElement;
  private candidateEl: HTMLElement;
  private resultEl: HTMLElement;
  private sporeTimer: HTMLElement;
  private identified = false;
  private attempts = 0;
  private sporeRunning = false;

  constructor(private parent: HTMLElement) {
    this.root = el('div', { class: 'inspect hidden' });
    this.root.innerHTML = `
      <div class="inspect-vignette"></div>
      <div class="inspect-head">
        <div>
          <div class="inspect-kicker">Field observation</div>
          <div class="inspect-title">Unidentified specimen</div>
          <div class="inspect-sub"></div>
        </div>
        <button class="icon-btn inspect-close" aria-label="Leave">${icon('close', 18)}</button>
      </div>
      <div class="inspect-body">
        <div class="obs-panel">
          <div class="panel-label">Observations</div>
          <div class="obs-list"></div>
          <div class="obs-foot">Each observation takes a moment. Compare carefully before you decide.</div>
        </div>
        <div class="inspect-side">
          <div class="actions-panel"></div>
          <div class="inspect-tip"></div>
        </div>
      </div>
      <div class="inspect-footer">
        <div class="inspect-measure"></div>
        <div class="inspect-controls">Drag to turn the cap · Scroll to lean closer · <b>Esc</b> to step back</div>
      </div>
      <div class="overlay identify-overlay hidden">
        <div class="overlay-card identify-card">
          <div class="overlay-head">
            <div>
              <div class="inspect-kicker">Identification</div>
              <h2>Which species is this?</h2>
            </div>
            <button class="icon-btn identify-close">${icon('close', 18)}</button>
          </div>
          <div class="identify-tools">
            <input class="search-input" type="search" placeholder="Search scientific, Slovak or English name…" />
            <div class="key-row">
              <button class="chip" data-key="gills">Gills</button>
              <button class="chip" data-key="pores">Pores</button>
              <button class="chip" data-key="ridges">Ridges / wrinkles</button>
              <button class="chip" data-key="ring">Has a ring</button>
              <button class="chip" data-key="volva">Has a volva</button>
            </div>
            <div class="key-note"></div>
          </div>
          <div class="candidate-list"></div>
          <div class="identify-result hidden"></div>
        </div>
      </div>
      <div class="overlay spore-overlay hidden">
        <div class="spore-card">
          <div class="spore-ico">${icon('clock', 28)}</div>
          <div class="spore-title">Leaving a spore print…</div>
          <div class="spore-sub">A cap on paper, covered. This will take a few minutes of forest time.</div>
          <div class="spore-bar"><i></i></div>
          <button class="btn ghost spore-cancel">Cancel</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);
    this.titleEl = this.root.querySelector('.inspect-title')!;
    this.subEl = this.root.querySelector('.inspect-sub')!;
    this.obsEl = this.root.querySelector('.obs-list')!;
    this.listBody = this.root.querySelector('.candidate-list')!;
    this.actionsEl = this.root.querySelector('.actions-panel')!;
    this.overlay = this.root.querySelector('.identify-overlay')!;
    this.candidateEl = this.root.querySelector('.candidate-list')!;
    this.resultEl = this.root.querySelector('.identify-result')!;
    this.sporeTimer = this.root.querySelector('.spore-bar')!;

    (this.root.querySelector('.inspect-close') as HTMLElement).addEventListener('click', () => this.requestLeave());
    (this.root.querySelector('.identify-close') as HTMLElement).addEventListener('click', () => this.hideIdentify());
    (this.root.querySelector('.spore-cancel') as HTMLElement).addEventListener('click', () => this.hideSpore());
    const search = this.root.querySelector('.search-input') as HTMLInputElement;
    search.addEventListener('input', () => this.renderCandidates());
    this.root.querySelectorAll<HTMLElement>('.key-row .chip').forEach((b) => {
      b.addEventListener('click', () => {
        b.classList.toggle('on');
        this.renderCandidates();
      });
    });
  }

  open(entity: MushroomEntity, host: InspectHost) {
    this.entity = entity;
    this.host = host;
    this.species = entity.species;
    this.revealed.clear();
    this.identified = entity.identified;
    this.attempts = 0;
    this.sporeRunning = false;
    this.root.classList.remove('hidden');
    this.overlay.classList.add('hidden');
    this.root.querySelector('.spore-overlay')!.classList.add('hidden');
    this.titleEl.textContent = entity.identified ? this.species.sci : 'Unidentified specimen';
    this.subEl.textContent = `${entity.sizeCm.toFixed(1)} cm cap · ${this.substrateLabel()} · ${this.stageLabel()}`;
    this.renderObservations();
    this.renderActions();
    (this.root.querySelector('.inspect-tip') as HTMLElement).innerHTML = hasEquip('fieldGuide')
      ? 'Your field guide can narrow the candidates once you have observed the cap, stem and underside.'
      : 'Without a field guide you must rely on your own comparison of the encyclopedia.';
    this.root.querySelector('.identify-overlay')!.classList.add('hidden');
  }

  close() {
    this.root.classList.add('hidden');
    this.entity = null;
    this.host = null;
  }

  isOpen() {
    return !this.root.classList.contains('hidden');
  }

  private stageLabel() {
    const s = this.entity?.stage;
    return s === 'young' ? 'young' : s === 'old' ? 'old' : s === 'damaged' ? 'damaged' : 'mature';
  }

  private substrateLabel() {
    const sp = this.species;
    if (!sp) return '';
    if (sp.substrate.includes('deadwood') || sp.substrate.includes('stump')) return 'on dead wood';
    if (sp.substrate.includes('moss')) return 'in moss';
    if (sp.substrate.includes('grass')) return 'in grass';
    if (sp.substrate.includes('litter')) return 'in leaf litter';
    if (sp.substrate.includes('path')) return 'on a path edge';
    return 'on soil';
  }

  private renderObservations() {
    if (!this.species) return;
    this.obsEl.innerHTML = '';
    for (const meta of OBS_META) {
      const revealed = this.revealed.has(meta.kind);
      const row = el('div', { class: `obs ${revealed ? 'revealed' : ''}` });
      const btn = el('button', { class: 'obs-btn' });
      btn.innerHTML = `<span class="obs-ico">${icon(meta.icon, 16)}</span><span class="obs-name">${meta.label}</span><span class="obs-hint">${revealed ? '' : meta.hint}</span>`;
      if (revealed) {
        const text = el('div', { class: 'obs-text' });
        text.textContent = this.observationText(meta.kind);
        row.appendChild(text);
      } else {
        btn.addEventListener('click', () => this.requestObserve(meta.kind));
        row.appendChild(btn);
      }
      this.obsEl.appendChild(row);
    }
    const measure = this.root.querySelector('.inspect-measure') as HTMLElement;
    measure.innerHTML = `<span>${icon('leaf', 14)}</span> Cap measured at <b>${this.entity?.sizeCm.toFixed(1)} cm</b>`;
  }

  private observationText(kind: ObsKind): string {
    const sp = this.species!;
    if (kind === 'cap') return sp.obs.cap;
    if (kind === 'stem') return sp.obs.stem;
    if (kind === 'under') return sp.obs.under;
    if (kind === 'base') return sp.obs.base;
    if (kind === 'habitat') return sp.obs.habitat;
    if (kind === 'smell') return sp.obs.smell;
    if (kind === 'spore') return sp.obs.spore;
    return '';
  }

  private requestObserve(kind: ObsKind) {
    if (!this.host) return;
    if (kind === 'spore') {
      if (this.sporeRunning) return;
      this.sporeRunning = true;
      this.root.querySelector('.spore-overlay')!.classList.remove('hidden');
      const bar = this.sporeTimer.querySelector('i') as HTMLElement;
      bar.style.transition = 'none';
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        bar.style.transition = 'width 5s linear';
        bar.style.width = '100%';
      });
      this.host.startSporePrint();
      return;
    }
    this.host.observe(kind);
  }

  reveal(kind: ObsKind) {
    this.revealed.add(kind);
    if (kind === 'spore') {
      this.sporeRunning = false;
      this.root.querySelector('.spore-overlay')!.classList.add('hidden');
      this.host?.playSound('paper');
    }
    this.renderObservations();
  }

  hideSpore() {
    this.root.querySelector('.spore-overlay')!.classList.add('hidden');
    this.sporeRunning = false;
  }

  private renderActions() {
    if (!this.species || !this.entity) return;
    const identified = this.entity.identified;
    const canCollect = true;
    this.actionsEl.innerHTML = '';
    const mk = (label: string, iconName: string, cls: string, fn: () => void, disabled = false) => {
      const b = el('button', { class: `btn ${cls}` });
      b.innerHTML = `<span>${icon(iconName, 17)}</span>${label}`;
      if (disabled) b.setAttribute('disabled', '');
      b.addEventListener('click', fn);
      this.actionsEl.appendChild(b);
    };
    mk(identified ? 'Identification complete' : 'Identify', 'book', 'primary', () => this.showIdentify(), identified);
    if (hasEquip('camera')) mk('Photograph', 'camera', 'ghost', () => this.host?.photograph());
    mk(canCollect ? 'Collect' : 'Collect', 'basket', 'ghost', () => this.host?.collect());
    const risk = el('div', { class: 'risk-note' });
    risk.textContent = identified
      ? 'Known species. Collect it cleanly and keep the cap intact.'
      : 'Unidentified. Collecting it is a gamble — the market will not be kind to a mistake.';
    this.actionsEl.appendChild(risk);
  }

  showCandidates() {
    this.renderActions();
  }

  showIdentify() {
    if (!this.species) return;
    this.overlay.classList.remove('hidden');
    this.resultEl.classList.add('hidden');
    this.renderCandidates();
    (this.root.querySelector('.search-input') as HTMLInputElement).focus();
  }

  hideIdentify() {
    this.overlay.classList.add('hidden');
  }

  private renderCandidates() {
    if (!this.species) return;
    const q = (this.root.querySelector('.search-input') as HTMLInputElement | null)?.value?.toLowerCase().trim() || '';
    const active = new Set<string>();
    this.root.querySelectorAll<HTMLElement>('.key-row .chip.on').forEach((c) => active.add(c.dataset.key!));
    let list = ALL_SPECIES.slice();
    if (q) list = list.filter((s) => (s.sci + ' ' + s.sk + ' ' + s.en).toLowerCase().includes(q));
    if (active.size) {
      list = list.filter((s) => {
        const g = s.visual.gillType;
        if (active.has('gills') && g !== 'gills') return false;
        if (active.has('pores') && g !== 'pores') return false;
        if (active.has('ridges') && !(g === 'ridges' || g === 'wrinkles' || g === 'smooth')) return false;
        if (active.has('ring') && s.visual.ring === 'none') return false;
        if (active.has('volva') && s.visual.volva === 'none') return false;
        return true;
      });
    }
    this.listBody.innerHTML = '';
    const note = this.root.querySelector('.key-note') as HTMLElement;
    note.textContent = active.size
      ? `Key applied — ${list.length} candidates.`
      : hasEquip('fieldGuide')
        ? 'Field guide equipped: use the key to narrow the list.'
        : 'A field guide would let you key out species by features.';
    if (!hasEquip('fieldGuide')) {
      this.root.querySelectorAll<HTMLElement>('.key-row .chip').forEach((c) => c.setAttribute('disabled', ''));
    }
    for (const s of list.slice(0, 90)) {
      const row = el('button', { class: 'candidate' });
      row.innerHTML = `
        <span class="cand-dot" style="background:${edibilityColor(s.edibility)}"></span>
        <span class="cand-names"><b>${s.sci}</b><span>${isSk ? s.sk : `${s.sk} · ${s.en}`}</span></span>
        <span class="cand-diff">${'●'.repeat(s.difficulty)}${'○'.repeat(5 - s.difficulty)}</span>
        <span class="cand-arrow">${icon('arrow', 15)}</span>
      `;
      row.addEventListener('click', () => {
        this.host?.playSound('click');
        this.host?.identify(s.id);
      });
      this.listBody.appendChild(row);
    }
    if (!list.length) {
      this.listBody.innerHTML = '<div class="empty-note">No species match those features. Relax a filter.</div>';
    }
  }

  showResult(correct: boolean, sp: Species, text: string) {
    this.overlay.classList.remove('hidden');
    this.resultEl.classList.remove('hidden');
    this.resultEl.className = `identify-result ${correct ? 'ok' : 'bad'}`;
    this.resultEl.innerHTML = `
      <div class="res-head">${correct ? 'Identification correct' : 'That does not match'}</div>
      <div class="res-name">${sp.sci} <span>${sp.sk}</span></div>
      <div class="res-sub">${EDIBILITY_LABEL[sp.edibility]}${isSk ? '' : ` · ${sp.en}`}</div>
      <div class="res-text">${text}</div>
      <button class="btn ${correct ? 'primary' : 'ghost'} res-btn">${correct ? 'Continue' : 'Look again'}</button>
    `;
    (this.resultEl.querySelector('.res-btn') as HTMLElement).addEventListener('click', () => {
      if (correct) {
        this.hideIdentify();
        this.attempts = 0;
        this.titleEl.textContent = sp.sci;
        this.subEl.textContent = `${this.entity?.sizeCm.toFixed(1)} cm cap · ${sp.sk}`;
        this.renderActions();
      } else {
        this.hideIdentify();
      }
    });
    if (correct) {
      this.identified = true;
      this.renderActions();
    }
  }

  showSporeResult() {
    this.revealed.add('spore');
    this.renderObservations();
  }

  private requestLeave() {
    this.host?.playSound('click');
    this.host?.leave();
  }

  closeOverlays() {
    this.hideIdentify();
    this.root.querySelector('.spore-overlay')!.classList.add('hidden');
    this.sporeRunning = false;
  }

  updatePrompt() {
    if (!this.entity) return;
  }

  flash(msg: string) {
    const tip = this.root.querySelector('.inspect-tip') as HTMLElement;
    tip.textContent = msg;
  }

  get attemptsCount() {
    return this.attempts;
  }

  noteAttempt() {
    this.attempts++;
  }

  collectHint() {
    const b = Array.from(this.actionsEl.querySelectorAll('.btn')).find((x) => x.textContent?.includes('Collect'));
    if (b) b.classList.add('pulse');
  }

  priceEstimate() {
    if (!this.species) return '';
    const sp = this.species;
    const edible = ['choice', 'good', 'edible', 'caution'].includes(sp.edibility);
    if (!edible) return '';
    return money(sp.value * 0.8);
  }
}
