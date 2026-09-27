// offline.js – Offline-Fortschritt. Dieselbe Rechnung für das Spiel (App.jsx) und die Balancing-Simulation.
import { state, setState } from '../store/gameState.js';
import { currentBonuses } from '../store/bonuses.js';
import { RESOURCES } from '../data/misc.js';
import { processTick, runProgressChecks } from './tick.js';

// Sekunden Abwesenheit pro Simulationsschritt
export const OFFLINE_STEP = 120;

// Holt `elapsedSec` Sekunden Abwesenheit nach: gedeckelt durch das Offline-Limit, verkürzt um die
// Offline-Effizienz, mit Automation. Gibt { sim, cap, efficiency, gains } zurück (gains je Ressource).
export function simulateOffline(elapsedSec) {
  const bonuses = currentBonuses();
  const cap = (bonuses.offlineCapHours || 12) * 3600;
  const sim = Math.min(Math.max(0, elapsedSec), cap);
  const efficiency = bonuses.offlineEfficiency || 0.5;
  const before = {};
  RESOURCES.forEach(r => { before[r] = state.resources[r] || 0; });
  // Wartende Boosts starten erst nach dem Nachholen: Die Schritte laufen alle zur Rückkehrzeit, ein hier
  // gestarteter Boost würde sonst auf die ganze Abwesenheit wirken.
  const queue = state.boostQueue || [];
  setState('boostQueue', []);
  try {
    let left = sim;
    while (left > 0) {
      const step = Math.min(OFFLINE_STEP, left);
      processTick(step * efficiency, { silent: true, auto: true, offline: true });
      left -= step;
    }
  } finally {
    setState('boostQueue', [...queue, ...(state.boostQueue || [])]);
  }
  runProgressChecks(true);
  const gains = {};
  RESOURCES.forEach(r => { gains[r] = (state.resources[r] || 0) - before[r]; });
  return { sim, cap, efficiency, gains };
}
