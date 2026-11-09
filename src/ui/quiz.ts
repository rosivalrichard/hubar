/* Knowledge mode: a ten-question identification test using rendered plates and field notes. */

import { el, icon } from './dom';
import { isSk } from '../i18n';
import { ALL_SPECIES, SPECIES_BY_ID } from '../data/species';
import { speciesPlate } from '../three/plates';
import { S, addXP, saveNow, checkAchievements, toast } from '../game/state';
import { RNG, strSeed, dateKey } from '../core/util';

interface Question {
  species: string;
  options: string[];
  kind: 'plate' | 'text';
  clue: string;
}

function buildQuestions(): Question[] {
  const rng = new RNG(strSeed('quiz:' + dateKey() + ':' + S.stats.identifiedCorrect));
  const pool = rng.shuffle(ALL_SPECIES.slice());
  const qs: Question[] = [];
  for (const sp of pool.slice(0, 10)) {
    const sameForm = ALL_SPECIES.filter((x) => x.id !== sp.id && (x.visual.gillType === sp.visual.gillType || x.form === sp.form));
    const others = rng.shuffle(sameForm.length >= 3 ? sameForm : ALL_SPECIES.filter((x) => x.id !== sp.id)).slice(0, 3);
    const options = rng.shuffle([sp.id, ...others.map((o) => o.id)]);
    const kind: 'plate' | 'text' = rng.chance(0.45) ? 'text' : 'plate';
    const clue = kind === 'text'
      ? [sp.obs.cap, sp.obs.under, sp.obs.base][rng.int(0, 2)]
      : '';
    qs.push({ species: sp.id, options, kind, clue });
  }
  return qs;
}

export function buildQuiz(onBack: () => void, playSfx: (n?: string) => void): HTMLElement {
  const root = el('div', { class: 'screen library-screen quiz-screen' });
  let questions: Question[] = [];
  let index = 0;
  let correct = 0;
  let answered = false;
  let finished = false;

  const intro = () => {
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="sheet narrow quiz-sheet">
        <header class="library-head">
          <button class="btn ghost back-btn" data-back>${icon('back', 16)} Back</button>
          <div class="sheet-title"><div class="kicker">Knowledge mode</div><h2>Test your eye</h2></div>
        </header>
        <div class="quiz-intro">
          <div class="quiz-plate-stack">
            <img src="${speciesPlate('boletus-edulis')}" alt="Cep specimen" />
            <div class="plate-caption">Boletus edulis · archive plate</div>
          </div>
          <div class="quiz-copy">
            <p>Ten questions drawn from the archive. Some show a specimen; others give only field notes. Choose the scientific name.</p>
            <ul class="plain-list">
              <li>No penalty for a wrong answer, but no XP either.</li>
              <li>Each correct answer earns 8 XP and sharpens your eye.</li>
              <li>Answers are drawn from the whole archive, including the deadly species.</li>
            </ul>
            <div class="quiz-best">Best score <b>${S.records.knowledgeBest} / 10</b></div>
            <button class="btn primary lg" data-start>${icon('eye', 18)} Begin the test</button>
          </div>
        </div>
      </div>
    `;
    (root.querySelector('[data-back]') as HTMLElement).addEventListener('click', () => {
      playSfx();
      onBack();
    });
    (root.querySelector('[data-start]') as HTMLElement).addEventListener('click', () => {
      playSfx();
      questions = buildQuestions();
      index = 0;
      correct = 0;
      finished = false;
      renderQuestion();
    });
  };

  const renderQuestion = () => {
    answered = false;
    const q = questions[index];
    const sp = SPECIES_BY_ID[q.species];
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="sheet quiz-sheet">
        <header class="quiz-head">
          <button class="btn ghost back-btn" data-back>${icon('back', 16)} Leave</button>
          <div class="quiz-progress"><span>Question ${index + 1} of 10</span><div class="quiz-bar"><i style="width:${(index / 10) * 100}%"></i></div></div>
          <div class="quiz-score">${correct} correct</div>
        </header>
        <div class="question-grid">
          <div class="question-visual">
            ${q.kind === 'plate'
              ? `<img class="quiz-plate" src="${speciesPlate(q.species)}" alt="Unidentified specimen" /><div class="plate-caption">specimen ${String(index + 1).padStart(2, '0')} · scale approximate</div>`
              : `<div class="clue-card"><div class="kicker">Field notes</div><p>${q.clue}</p><div class="clue-note">From the notebook of an anonymous forager.</div></div>`}
          </div>
          <div class="question-body">
            <div class="kicker">Identify the species</div>
            <h3>Which mushroom is this?</h3>
            <div class="option-list">
              ${q.options.map((id, i) => {
                const o = SPECIES_BY_ID[id];
                return `<button class="option" data-opt="${id}"><span class="opt-index">${String.fromCharCode(65 + i)}</span><span class="opt-name"><b>${o.sci}</b><em>${isSk ? o.sk : `${o.sk} · ${o.en}`}</em></span></button>`;
              }).join('')}
            </div>
            <div class="answer-box hidden"></div>
          </div>
        </div>
      </div>
    `;
    (root.querySelector('[data-back]') as HTMLElement).addEventListener('click', () => {
      playSfx();
      onBack();
    });
    root.querySelectorAll<HTMLElement>('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const picked = b.dataset.opt!;
        const ok = picked === q.species;
        if (ok) {
          correct++;
          playSfx('identify');
          addXP(8, 'Knowledge test');
        } else {
          playSfx('wrong');
        }
        root.querySelectorAll<HTMLElement>('[data-opt]').forEach((x) => {
          x.classList.add('answered');
          if (x.dataset.opt === q.species) x.classList.add('correct');
          else if (x === b) x.classList.add('picked');
          else x.classList.add('dim');
        });
        const box = root.querySelector('.answer-box') as HTMLElement;
        box.classList.remove('hidden');
        box.innerHTML = `
          <div class="answer-title ${ok ? 'ok' : 'bad'}">${ok ? 'Correct' : 'Not this one'}</div>
          <div class="answer-name">${sp.sci} <span>${sp.sk}</span></div>
          <p>${sp.obs.cap}</p>
          <div class="answer-foot">${isSk ? '' : `${sp.en} · `}${sp.family}</div>
          <button class="btn primary sm" data-next>${index >= 9 ? 'See the result' : 'Next specimen'}</button>
        `;
        (box.querySelector('[data-next]') as HTMLElement).addEventListener('click', () => {
          playSfx();
          index++;
          if (index >= 10) renderResult();
          else renderQuestion();
        });
      })
    );
  };

  const renderResult = () => {
    finished = true;
    const prev = S.records.knowledgeBest;
    const isBest = correct > prev;
    if (correct > S.records.knowledgeBest) S.records.knowledgeBest = correct;
    saveNow();
    checkAchievements();
    const grade = correct >= 9 ? 'Master mycologist' : correct >= 7 ? 'Experienced eye' : correct >= 5 ? 'Learning the names' : 'The forest is still a stranger';
    root.innerHTML = `
      <div class="screen-bg soft"></div>
      <div class="sheet narrow quiz-sheet">
        <div class="quiz-result">
          <div class="kicker">Knowledge mode</div>
          <h2>${correct} / 10</h2>
          <div class="grade">${grade}</div>
          <div class="result-bar"><i style="width:${correct * 10}%"></i></div>
          <p>${correct === 10
            ? 'Every specimen named. The archive is in good hands.'
            : 'The archive rewards patience. Read the observations again, then walk back into the forest.'}</p>
          ${isBest ? '<div class="best-badge">New personal best</div>' : `<div class="key-note">Personal best ${S.records.knowledgeBest} / 10</div>`}
          <div class="result-actions">
            <button class="btn primary" data-again>Try again</button>
            <button class="btn ghost" data-back2>Leave</button>
          </div>
        </div>
      </div>
    `;
    (root.querySelector('[data-again]') as HTMLElement).addEventListener('click', () => {
      playSfx();
      questions = buildQuestions();
      index = 0;
      correct = 0;
      renderQuestion();
    });
    (root.querySelector('[data-back2]') as HTMLElement).addEventListener('click', () => {
      playSfx();
      onBack();
    });
    if (isBest) toast('New best', `${correct} / 10 in the knowledge test.`, 'good');
  };

  intro();
  void finished;
  return root;
}
