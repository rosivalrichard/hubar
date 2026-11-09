import './styles.css';
import { installDomTranslation } from './i18n';

installDomTranslation();
import { Game } from './game/game';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const boot = document.getElementById('boot');

function fail(message: string) {
  if (!boot) return;
  boot.classList.remove('gone');
  boot.innerHTML = `<div class="boot-fail"><div class="boot-mark">HUBÁR</div><p>${message}</p><p class="boot-note">This build needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.</p></div>`;
}

try {
  const game = new Game(canvas);
  (window as unknown as { hubarGame: Game }).hubarGame = game;
  game.boot();
} catch (e) {
  console.error(e);
  fail(e instanceof Error ? e.message : 'The renderer could not start.');
}

// i18n debug hooks (used by automated checks)
import { untranslated, tr as __tr } from './i18n';
import { ALL_SPECIES as __SP } from './data/species';
import { BIOMES as __B } from './data/biomes';
(window as unknown as Record<string, unknown>).__i18n = {
  missing: untranslated,
  tr: __tr,
  data: () => {
    const out: string[] = [];
    const chk = (s: unknown) => { if (typeof s === 'string' && /[a-z]{3}/.test(s) && __tr(s) === s) out.push(s); };
    for (const sp of __SP) { chk(sp.toxin); chk(sp.edibleNote); chk(sp.intro); Object.values(sp.obs).forEach(chk); sp.facts.forEach(chk); }
    for (const b of Object.values(__B as unknown as Record<string, Record<string, unknown>>)) { chk(b.name); chk(b.tagline); chk(b.description); }
    return out;
  },
};
