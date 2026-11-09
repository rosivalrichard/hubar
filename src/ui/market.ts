/* Market: sell the basket, buy equipment and provisions, view records. */

import { el, icon, money } from './dom';
import { tr } from '../i18n';
import {
  S,
  EQUIPMENT,
  basketCapacity,
  basketValue,
  buyEquipment,
  hasEquip,
  levelForXp,
  sellBasket,
  addMoney,
  saveNow,
  toast,
  checkAchievements,
  type SaleResult,
} from '../game/state';
import { SPECIES_BY_ID, isEdible, edibilityColor, EDIBILITY_LABEL } from '../data/species';
import { formatMoney } from '../core/util';

export function buildMarket(onBack: () => void, playSfx: (n?: string) => void, onChange: () => void): HTMLElement {
  const root = el('div', { class: 'screen library-screen market-screen' });
  const draw = () => {
    const level = levelForXp(S.profile.xp).level;
    const groups = new Map<string, { count: number; value: number; unidentified: boolean; claimed: string | null }>();
    for (const it of S.basket) {
      const key = it.claimedId || 'unknown';
      const g = groups.get(key) || { count: 0, value: 0, unidentified: !it.claimedId, claimed: it.claimedId };
      g.count++;
      const sp = SPECIES_BY_ID[it.speciesId];
      if (sp && isEdible(sp)) {
        const sizeFactor = Math.min(1.2, 0.55 + (it.sizeCm / sp.visual.capDiameter[1]) * 0.6);
        g.value += sp.value * sizeFactor * it.condition;
      }
      groups.set(key, g);
    }
    const est = Array.from(groups.values()).reduce((s, g) => s + g.value, 0);
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="library sheet">
        <header class="library-head">
          <button class="btn ghost back-btn" data-back>${icon('back', 16)} Back</button>
          <div class="sheet-title"><div class="kicker">The village market</div><h2>Market &amp; equipment</h2></div>
          <div class="market-money"><span>Purse</span><b>${formatMoney(S.profile.money)}</b><em>reputation ${Math.round(S.profile.reputation)}</em></div>
        </header>
        <div class="market-grid">
          <section class="market-sell">
            <div class="section-label">Your basket <span>${S.basket.length} / ${basketCapacity()} · ${Math.round(S.basket.reduce((s, i) => s + (SPECIES_BY_ID[i.speciesId]?.weight || 0), 0))} g</span></div>
            ${S.basket.length === 0
              ? '<div class="empty-state"><div class="empty-ico">' + icon('basket', 34) + '</div><b>Nothing to sell</b><p>The basket is empty. The buyer will still be here after your next walk.</p></div>'
              : `<div class="sell-list">
                  ${Array.from(groups.entries()).map(([key, g]) => {
                    const sp = g.claimed ? SPECIES_BY_ID[g.claimed] : null;
                    return `<div class="sell-row">
                      <div class="sell-name">${sp ? sp.sci : 'Unidentified specimen'}<span>${sp ? sp.sk : 'claimed as nothing'}</span></div>
                      <div class="sell-count">× ${g.count}</div>
                      <div class="sell-value">${sp ? formatMoney(g.value) : '—'}</div>
                    </div>`;
                  }).join('')}
                </div>
                <div class="sell-total"><span>Estimated value</span><b>${formatMoney(est)}</b></div>
                <div class="sell-note">The buyer inspects every cap. Poisonous species in the basket will be rejected, and the market will remember it.</div>
                <div class="sell-actions">
                  <button class="btn primary" data-sell>Sell the harvest</button>
                  <button class="btn ghost" data-discard>Leave it</button>
                </div>`
            }
            <div class="section-label spaced">Provisions <span>for survival walks</span></div>
            <div class="provision-row">
              <div>${icon('flame', 18)} Dried bread &amp; water <span>Restores energy on a survival expedition.</span></div>
              <b>€6.00</b>
              <button class="btn ghost sm" data-provisions ${S.profile.money < 6 || S.provisions >= 9 ? 'disabled' : ''}>Buy</button>
              <em>${S.provisions} held</em>
            </div>
          </section>
          <section class="market-shop">
            <div class="section-label">Equipment <span>level ${level}</span></div>
            <div class="equipment-grid">
              ${EQUIPMENT.map((e) => {
                const owned = hasEquip(e.id);
                const locked = level < e.level;
                return `<div class="equip-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}">
                  <div class="equip-ico">${icon(e.icon, 26)}</div>
                  <div class="equip-body">
                    <div class="equip-name">${e.name}</div>
                    <p>${e.desc}</p>
                    <div class="equip-meta">${owned ? 'In your kit' : locked ? `Level ${e.level} required` : formatMoney(e.price)}</div>
                  </div>
                  ${owned ? `<span class="owned-badge">${icon('check', 13)}</span>` : `<button class="btn ${locked ? 'ghost' : 'primary'} sm" data-buy="${e.id}" ${locked || S.profile.money < e.price ? 'disabled' : ''}>${locked ? 'Locked' : 'Buy'}</button>`}
                </div>`;
              }).join('')}
            </div>
          </section>
        </div>
        <div class="records-strip">
          <div class="record"><span>Best run</span><b>${S.records.bestRunScore}</b></div>
          <div class="record"><span>Best sale</span><b>${formatMoney(S.records.bestSale)}</b></div>
          <div class="record"><span>Longest correct streak</span><b>${S.records.longestStreak}</b></div>
          <div class="record"><span>Best bolete cap</span><b>${S.records.bestBoleteCm.toFixed(1)} cm</b></div>
          <div class="record"><span>Knowledge test</span><b>${S.records.knowledgeBest} / 10</b></div>
          <div class="record"><span>Distance walked</span><b>${(S.stats.distanceWalked / 1000).toFixed(1)} km</b></div>
        </div>
        <div class="market-foot">
          <span>Local records only — this build stores progression in your browser.</span>
          <span>${ALL_SPECIES_LENGTH()} species in the archive.</span>
        </div>
      </div>
    `;
    wire();
  };

  function ALL_SPECIES_LENGTH() {
    return Object.keys(SPECIES_BY_ID).length;
  }

  function wire() {
    (root.querySelector('[data-back]') as HTMLElement)?.addEventListener('click', () => {
      playSfx();
      onBack();
    });
    (root.querySelector('[data-sell]') as HTMLElement)?.addEventListener('click', () => {
      const res = sellBasket();
      playSfx('sell');
      showSale(res);
      onChange();
    });
    (root.querySelector('[data-discard]') as HTMLElement)?.addEventListener('click', () => {
      if (!confirm(tr('Leave the basket at the market without selling? The mushrooms will be discarded.'))) return;
      S.basket = [];
      saveNow();
      playSfx();
      draw();
    });
    (root.querySelector('[data-provisions]') as HTMLElement)?.addEventListener('click', () => {
      if (S.profile.money < 6 || S.provisions >= 9) return;
      addMoney(-6);
      S.provisions++;
      saveNow();
      playSfx('sell');
      toast('Provisions bought', 'Enough bread and water for the next survival walk.', 'good');
      draw();
    });
    root.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = buyEquipment(b.dataset.buy!);
        playSfx(res.ok ? 'levelup' : 'wrong');
        toast(res.ok ? 'Purchased' : 'Cannot buy', res.message, res.ok ? 'good' : 'bad');
        if (res.ok) checkAchievements();
        draw();
        onChange();
      })
    );
  }

  function showSale(res: SaleResult) {
    const overlay = el('div', { class: 'overlay sale-overlay' });
    const rows = res.lines
      .map((l) => {
        const sp = SPECIES_BY_ID[l.speciesId];
        const claimed = l.claimedId ? SPECIES_BY_ID[l.claimedId] : null;
        const wrong = claimed && claimed.id !== l.speciesId;
        return `<div class="sale-row ${l.edible ? 'ok' : 'bad'}">
          <span class="sale-dot" style="background:${edibilityColor(sp.edibility)}"></span>
          <div class="sale-name"><b>${sp.sci}</b><span>${sp.sk} · ${EDIBILITY_LABEL[sp.edibility]}</span></div>
          <div class="sale-qty">× ${l.count}</div>
          <div class="sale-money">${l.edible ? formatMoney(l.total) : 'rejected'}</div>
          ${wrong ? `<div class="sale-wrong">you called it ${claimed!.sci}</div>` : ''}
        </div>`;
      })
      .join('');
    overlay.innerHTML = `
      <div class="overlay-card sale-card">
        <div class="kicker">The buyer's table</div>
        <h2>${res.poisonCount > 0 ? 'A serious mistake' : res.empty ? 'Empty basket' : 'Harvest sold'}</h2>
        <div class="sale-list">${rows || '<p class="key-note">Nothing was in the basket.</p>'}</div>
        <div class="sale-summary">
          <div><span>Earnings</span><b>${formatMoney(res.earnings)}</b></div>
          <div><span>Penalties</span><b class="${res.penalty ? 'red' : ''}">${res.penalty ? '-' + formatMoney(res.penalty) : '—'}</b></div>
          <div><span>Reputation</span><b class="${res.reputationDelta < 0 ? 'red' : ''}">${res.reputationDelta >= 0 ? '+' : ''}${Math.round(res.reputationDelta)}</b></div>
        </div>
        ${res.poisonCount ? `<p class="sale-warning">${res.poisonCount} poisonous specimen${res.poisonCount > 1 ? 's were' : ' was'} identified at the table. This is how a real basket can end a life. The buyer will not forget.</p>` : ''}
        <button class="btn primary sale-close">Back to the market</button>
      </div>
    `;
    root.appendChild(overlay);
    (overlay.querySelector('.sale-close') as HTMLElement).addEventListener('click', () => {
      overlay.remove();
      playSfx();
      draw();
    });
  }

  draw();
  return root;
}
