/* Runtime localisation.
 *
 * The game is authored in English. In Slovak mode every text node and the
 * placeholder/title/aria-label attributes are translated as they enter the DOM,
 * using the SK dictionary (exact matches first, then {n} patterns).
 * Changing the language saves and reloads, so nothing has to be re-rendered live.
 */

import { SK } from './sk';

export type Lang = 'sk' | 'en';
const KEY = 'hubar.lang';

function detect(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'sk' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return /^(sk|cs)\b/i.test(navigator.language || '') ? 'sk' : 'en';
}

export const LANG: Lang = detect();
export const isSk = LANG === 'sk';
export const LOCALE = isSk ? 'sk-SK' : 'en-GB';

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */

const exact = new Map<string, string>();
/** lits[0] {order[0]} lits[1] {order[1]} … lits[n] — matched by linear indexOf, no regex backtracking. */
interface Pat { lits: string[]; out: string; order: number[]; weight: number }
const patterns: Pat[] = [];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function addPattern(src: string, out: string) {
  const lits: string[] = [];
  const order: number[] = [];
  const parts = src.split(/\{(\d+)\}/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) order.push(+parts[i]);
    else lits.push(parts[i]);
  }
  // two adjacent placeholders cannot be split reliably — skip such patterns
  if (lits.slice(1, -1).some((l) => l === '')) return;
  patterns.push({ lits, out, order, weight: lits.join('').length });
}

function match(p: Pat, s: string): string[] | null {
  const { lits } = p;
  const first = lits[0];
  const last = lits[lits.length - 1];
  if (!s.startsWith(first) || !s.endsWith(last) || s.length < first.length + last.length + p.order.length) return null;
  const caps: string[] = [];
  let pos = first.length;
  const end = s.length - last.length;
  for (let i = 1; i < lits.length - 1; i++) {
    const at = s.indexOf(lits[i], pos + 1);
    if (at < 0 || at >= end) return null;
    caps.push(s.slice(pos, at));
    pos = at + lits[i].length;
  }
  if (end - pos < 1) return null;
  caps.push(s.slice(pos, end));
  return caps;
}

function register(src: string, out: string) {
  const k = norm(src);
  if (!/\{\d+\}/.test(k)) {
    exact.set(k, out);
    return;
  }
  addPattern(k, out);
  // A leading/trailing placeholder is often an icon element, i.e. a separate DOM node.
  const lead = /^\{(\d+)\}\s*/.exec(k);
  const trail = /\s*\{(\d+)\}$/.exec(k);
  let k2 = k;
  let o2 = out;
  if (lead && o2.startsWith(lead[0].trim())) {
    k2 = k2.slice(lead[0].length);
    o2 = o2.slice(lead[0].trim().length).trimStart();
  }
  if (trail && k2.endsWith(trail[0]) && o2.endsWith(trail[0].trim())) {
    k2 = k2.slice(0, -trail[0].length);
    o2 = o2.slice(0, -trail[0].trim().length).trimEnd();
  }
  if (k2 !== k && k2) register(k2, o2);
}

if (isSk) {
  for (const [k, v] of Object.entries(SK)) register(k, v);
  patterns.sort((a, b) => b.weight - a.weight);
}

const cache = new Map<string, string | null>();

function lookup(s: string, depth = 0): string | null {
  const hit = exact.get(s);
  if (hit !== undefined) return hit;
  if (depth > 2) return null;
  for (const p of patterns) {
    const m = match(p, s);
    if (!m) continue;
    const caps = p.order.map((idx, i) => ({ idx, val: m[i] }));
    return p.out.replace(/\{(\d+)\}/g, (_, n) => {
      const c = caps.find((x) => x.idx === +n);
      if (!c) return '';
      return translateFragment(c.val, depth + 1);
    });
  }
  return null;
}

function translateFragment(v: string, depth: number): string {
  const t = lookup(v.trim(), depth) ?? bySeparators(v.trim());
  return t ?? v;
}

const SEPS = [' · ', ', ', '–'];

/** Fallback for composed labels such as "1 · Beginner" or "Apr–May, Sep–Oct". */
function bySeparators(s: string, from = 0): string | null {
  for (let i = from; i < SEPS.length; i++) {
    const sep = SEPS[i];
    if (!s.includes(sep)) continue;
    let changed = false;
    const parts = s.split(sep).map((part) => {
      const t = lookup(part.trim()) ?? bySeparators(part.trim(), i + 1);
      if (t !== null && t !== part.trim()) changed = true;
      return t ?? part;
    });
    if (changed) return parts.join(sep);
  }
  return null;
}

/** Translate a whole UI string. Returns the input unchanged in English mode or when unknown. */
export function tr(s: string): string {
  if (!isSk || !s) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const core = norm(m[2]);
  if (!core) return s;
  let out = cache.get(core);
  if (out === undefined) {
    out = lookup(core) ?? bySeparators(core);
    if (cache.size > 4000) cache.clear();
    cache.set(core, out);
  }
  return out === null ? s : m[1] + out + m[3];
}

/* ------------------------------------------------------------------ */
/* DOM translation                                                     */
/* ------------------------------------------------------------------ */

const ATTRS = ['placeholder', 'title', 'aria-label'];
const done = new WeakMap<Node, string>();
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

function doText(n: Text) {
  const v = n.data;
  if (done.get(n) === v) return;
  const p = n.parentElement;
  if (p && (SKIP.has(p.tagName) || p.closest('[data-no-tr]'))) return;
  const t = tr(v);
  if (t !== v) n.data = t;
  done.set(n, t);
}

function doAttrs(e: Element) {
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (v) {
      const t = tr(v);
      if (t !== v) e.setAttribute(a, t);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === 3) return doText(root as Text);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) {
    if (SKIP.has((root as Element).tagName)) return;
    doAttrs(root as Element);
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) doText(n as Text);
    else doAttrs(n as Element);
  }
}

export function installDomTranslation() {
  document.documentElement.lang = LANG;
  if (!isSk) return;
  document.title = tr(document.title);
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Dev helper: list visible English-looking text that has no translation. */
export function untranslated(): string[] {
  const out = new Set<string>();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const v = norm((n as Text).data);
    const p = (n as Text).parentElement;
    if (!p || SKIP.has(p.tagName) || p.closest('svg')) continue;
    if (/[A-Za-z]{3}/.test(v) && tr(v) === v) out.add(v);
  }
  return [...out];
}
