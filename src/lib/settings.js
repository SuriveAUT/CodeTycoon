// settings.js – Geräte-Einstellungen (nicht Teil des Spielstands).
const KEY = 'codetycoon-settings';
const DEFAULTS = { particles: true, toasts: true, sciNotation: false };
let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    cache = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (_) { cache = { ...DEFAULTS }; }
  return cache;
}

export function getSetting(key) { return load()[key]; }

export function setSetting(key, value) {
  const s = load();
  s[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
  return s[key];
}

export function toggleSetting(key) { return setSetting(key, !getSetting(key)); }
