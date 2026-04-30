// themeEngine.js – Visuelle Evolution basierend auf Spielfortschritt
import { state } from '../store/gameState.js';

let currentTheme = null;

export function computeTheme() {
  const techCount = state.techs?.length || 0;
  const hasAGI = state.techs?.includes('agi_completion');
  const prestigeCount = state.stats?.prestigeCount || 0;

  if (hasAGI || prestigeCount >= 1) return 'late';
  if (techCount >= 6) return 'mid';
  return 'early';
}

export function applyTheme(theme) {
  if (theme === currentTheme) return;
  const prev = currentTheme;
  currentTheme = theme;

  document.body.classList.remove('theme-early', 'theme-mid', 'theme-late');
  document.body.classList.add(`theme-${theme}`);

  // Backdrop swap – update nebula colours
  const backdrop = document.querySelector('.backdrop');
  if (backdrop) {
    backdrop.classList.remove('backdrop--early', 'backdrop--mid', 'backdrop--late');
    backdrop.classList.add(`backdrop--${theme}`);
  }

  if (prev && prev !== theme) {
    document.body.classList.add('theme-transition');
    setTimeout(() => document.body.classList.remove('theme-transition'), 3000);
  }
}

let lastThemeCheck = 0;

export function tickTheme(now) {
  if (now - lastThemeCheck < 5000) return;
  lastThemeCheck = now;
  applyTheme(computeTheme());
}
