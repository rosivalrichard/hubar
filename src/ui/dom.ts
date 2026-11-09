import { formatMoney } from '../core/util';
/* Tiny DOM helpers, SVG icon set and formatting utilities. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void)> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function html(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return (t.content.firstElementChild as HTMLElement) || document.createElement('div');
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function icon(name: string, size = 20, cls = ''): string {
  const paths: Record<string, string> = {
    basket: '<path d="M4 10h16l-1.6 8.2A2 2 0 0 1 16.4 20H7.6a2 2 0 0 1-2-1.8L4 10Z"/><path d="M8 10 9.5 4M16 10 14.5 4M4 10c0 1.1 3.6 2 8 2s8-.9 8-2"/><path d="M9 14v2M15 14v2"/>',
    knife: '<path d="M4 17 14 7c1.5-1.5 3.5-2 5-1l-1 1.5c-.4 1.6-1.4 2.6-2.5 3.4L7 20l-3-3Z"/><path d="M6 15l3 3"/><path d="M14 7l3 3"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/><path d="M8 7h8M8 11h6"/>',
    boots: '<path d="M6 4v9l-2 4v3h12v-2l-4-2v-4l2-1V4H6Z"/><path d="M6 13h5M8 17h8"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13" r="3.4"/>',
    backpack: '<path d="M7 8V6a5 5 0 0 1 10 0v2"/><rect x="5" y="8" width="14" height="12" rx="3"/><path d="M9 12h6M9 16h6"/>',
    light: '<path d="M9 3h6l1 7H8l1-7Z"/><path d="M8 10h8v4H8z"/><path d="M10 14v3M14 14v3"/><path d="M12 17v4"/>',
    radio: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M8 9 17 4"/><circle cx="15.5" cy="14.5" r="2.5"/><path d="M7 13v3M7 18h4"/>',
    gps: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m9 15 2-5 5-2-2 5-5 2Z"/><circle cx="12" cy="12" r="1"/>',
    coat: '<path d="m8 3 4 2 4-2 3 5-2 1v9H7v-9L5 8l3-5Z"/><path d="M12 5v13"/><path d="M10 9h4"/>',
    leaf: '<path d="M20 4C10 4 4 8 4 15c0 2 .7 3.7 2 5C13 20 20 14 20 4Z"/><path d="M4 20C8 14 12 11 18 8"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v16l-6 3-6-3-6 3V6Z"/><path d="M9 3v16M15 6v16"/>',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>',
    skull: '<path d="M5 11a7 7 0 1 1 14 0c0 2.5-1.3 3.8-2 5l-.3 2h-2.2L14 16h-4l-.5 2H7.3L7 16c-.7-1.2-2-2.5-2-5Z"/><circle cx="9.3" cy="10.5" r="1.4"/><circle cx="14.7" cy="10.5" r="1.4"/><path d="M9 20h6"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M14.5 9.5c-.6-1-1.6-1.4-2.7-1.2-1.4.2-2 1.5-1.2 2.6.7.9 2.2 1 3.2 1.6 1.2.7 1.1 2.5-.4 3.1-1.1.4-2.4.1-3.1-.9"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    flame: '<path d="M12 3c1 4 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 1-5 1 1 2 1 3-4Z"/><path d="M7 17c0 3 2 4 5 4s5-1 5-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    cloud: '<path d="M6 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.7 1.2A3.4 3.4 0 0 1 17.5 18H6Z"/>',
    rain: '<path d="M6 15a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.7 1.2A3.4 3.4 0 0 1 17.5 15H6Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    drizzle: '<path d="M6 14a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.7 1.2A3.4 3.4 0 0 1 17.5 14H6Z"/><path d="M9 17v2M13 17v2M17 17v2"/>',
    mist: '<path d="M4 9h16M6 13h12M3 17h18M8 21h8"/><path d="M8 5h8"/>',
    storm: '<path d="M6 14a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.7 1.2A3.4 3.4 0 0 1 17.5 14H6Z"/><path d="m12 14-2 4h3l-1 4"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    weight: '<path d="M7 8h10l2 12H5L7 8Z"/><circle cx="12" cy="5" r="2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m9 15 2-6 4 2-2 6-4-2Z"/>',
    thermo: '<path d="M10 13V5a2 2 0 1 1 4 0v8a4 4 0 1 1-4 0Z"/><path d="M12 9v6"/>',
    pin: '<path d="M12 21s7-6.7 7-11a7 7 0 1 0-14 0c0 4.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    hand: '<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4M11 10V4.5a1.5 1.5 0 0 1 3 0V10M14 10V5.5a1.5 1.5 0 0 1 3 0V12M8 11V9a1.5 1.5 0 0 0-3 0v5c0 4 2.5 7 6.5 7S19 18 19 15v-3.5a1.5 1.5 0 0 0-3 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  };
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

export function weatherIcon(kind: string, size = 20): string {
  const map: Record<string, string> = {
    clear: 'sun',
    sunny: 'sun',
    overcast: 'cloud',
    mist: 'mist',
    drizzle: 'drizzle',
    rain: 'rain',
    storm: 'storm',
    fog: 'mist',
  };
  return icon(map[kind] || 'cloud', size);
}

export function pct(v: number) {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}

export function money(v: number) {
  return formatMoney(v);
}

export function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function timeAgo(ts: number) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
