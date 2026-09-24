import { getSetting } from './settings.js';

export function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (Math.abs(n) < 1e-9) return '0';
  if (n < 0) return '−' + fmt(-n);
  if (n >= 1e6 && getSetting('sciNotation')) return n.toExponential(2).replace('e+', 'e');
  if (n < 1000) {
    // Show decimals for small values
    if (n < 10 && n !== Math.floor(n)) return n.toFixed(2);
    return Math.floor(n).toLocaleString('de-DE');
  }
  const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UnD', 'DuD', 'TrD', 'QaD', 'QiD', 'SxD', 'SpD', 'OcD', 'NoD', 'Vg', 'UnV'];
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier === 0) return Math.floor(n).toLocaleString('de-DE');
  if (tier >= suffixes.length) return n.toExponential(2);
  const scale = Math.pow(10, tier * 3);
  const scaled = n / scale;
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return scaled.toFixed(digits) + ' ' + suffixes[tier];
}

export function fmtSec(s) {
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function rand(a, b) { return a + Math.random() * (b - a); }
