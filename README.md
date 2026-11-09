# HUBÁR — The Mushroom Hunter

Realistický prvohosobový simulátor zbierania húb v slovenských a stredoeurópskych lesoch. Postavený na Vite + TypeScript + Three.js. Všetky textúry, modely aj zvuky sa generujú procedurálne — projekt neobsahuje žiadne externé assety.

## Spustenie

Požiadavky: Node.js 20+ a npm.

```bash
npm install
npm run dev
```

Dev server beží na `http://localhost:3000`.

Produkčný build:

```bash
npm run build
npm run preview
```

Jeden samostatný HTML súbor (funguje offline, stačí otvoriť v prehliadači):

```bash
npm run build:single   # -> dist-single/index.html
```

## Jazyk

Hra je v slovenčine aj angličtine. Prepínač SK / EN je v hlavnom menu a v Nastaveniach; voľba sa ukladá do `localStorage` (`hubar.lang`) a hra sa po zmene znovu načíta. Pri prvom spustení sa jazyk zvolí podľa prehliadača (sk/cs → slovenčina).

Texty sa píšu v angličtine; `src/i18n/sk.ts` je slovník anglický text → slovenský preklad (`{0}` = hodnota doplnená za behu). Modul `src/i18n/index.ts` prekladá všetko, čo sa zobrazí v DOM. Kontrola chýbajúcich prekladov v konzole: `__i18n.missing()` (aktuálna obrazovka) a `__i18n.data()` (texty druhov a lesov).

## Ovládanie

| Klávesa | Akcia |
| --- | --- |
| W A S D / šípky | chôdza |
| Shift | beh (spotrebúva výdrž) |
| Ctrl / C | podrep |
| Myš | rozhliadanie |
| E | prezrieť húbu / interagovať |
| F | rýchlo zobrať už identifikovanú húbu |
| E / F v prehliadke | zbaliť húbu |
| L | čelovka (po zakúpení) |
| R | predpoveď počasia (s rádiom) |
| P | zjesť proviant v Survival režime |
| Esc / J | pauza |

V prehliadke hýbeš vzorkou ťahaním myši a kolieskom približuješ. Pri identifikácii vyberáš z katalógu; hra ti neprezradí druh vopred.

## Co je implementované

- 7 biómov: smrekový, bukový dubový, borovicový, zmiešaný, horský a mokraďový les.
- 38 druhov húb s vedeckým, slovenským a anglickým názvom, habitatom, sezónou, jedlosťou, toxínmi, znakmi a dvojníkmi.
- Procedurálny terén, stromy, podrast, padnuté kmene, skaly, chata a lesný chodník.
- Počasie, denný cyklus, sezóna a vlhkosť ovplyvňujú výskyt húb; po daždi sa objavujú nové plodnice.
- Prehliadka vzorky: klobúk, hlúbik, spodok, báza, habitat, vôňa a výtlačok výtrusov.
- Encyklopédia s vykreslenými náhľadmi, zbierky, denné/týždenné/špeciálne výzvy, úspechy.
- Úrovne 1–7, XP, peniaze, reputácia, vybavenie (košík, nôž, atlas, čižmy, fotoaparát, batoh, čelovka, rádio, GPS, plášť).
- Trh: predaj, odmietnutie jedovatých kusov, pokuta a strata reputácie pri chybnom určení.
- 5 režimov: Free Exploration, Career, Challenge, Survival a Knowledge test.
- Ukladanie do `localStorage` pod kľúčom `hubar.save.v2`.

## Výkon

V nastaveniach je kvalita `low` / `medium` / `high`. Na slabších GPU alebo vo virtualizovanom prehliadači (softvérové WebGL) je `high` príliš ťažký — nastav `low` alebo `medium`. Hra pri štarte automaticky znižuje kvalitu pri detegovanom softvérovom rendereri, ale detekcia nie je spoľahlivá vo všetkých cloudových prostrediach.

## Bezpečnostné upozornenie

HUBÁR je vzdelávacia simulácia, nie terénny atlas. Niektoré zobrazené druhy sú smrteľne jedovaté. Nikdy nejedz divú hubu len na základe hry — potrebuješ osobné určenie od odborníka.

## Štruktúra

```
src/
  core/       vstup, matematika, RNG, dátumy
  data/       biómy a databáza druhov
  game/       hráč, spawner, počasie, audio, stav, kariéra, orchestrátor
  three/      les, textúry, generovanie húb, ruky, náhľady
  ui/         HUD, menu, encyklopédia, prehliadka, trh, kvíz
  main.ts     vstupný bod
  styles.css  vizuálny systém
```

## Poznámky

- Rebríček a rekordy sú lokálne; projekt nemá backend ani prihlásenie.
- Niektoré opisy a habitatové údaje sú pre hru zjednodušené.
- Projekt je pripravený na statické nasadenie (Vite build), prípadne na Cloudflare Workers so `env.ASSETS.fetch(request)`.
