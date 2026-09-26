// offline.js – Offline-Fortschritt. Dieselbe Rechnung für das Spiel (App.jsx) und die Balancing-Simulation.
import { state } from '../store/gameState.js';
import { currentBonuses } from '../store/bonuses.js';
import { RESOURCES } from '../data/misc.js';
import { processTick, runProgressChecks } from './tick.js';

// Sekunden Abwesenheit pro Simulationsschritt
export const OFFLINE_STEP = 120;

// Holt `elapsedSec` Sekunden Abwesenheit nach: gedeckelt durch das Offline-Limit, verkürzt um die
// Offline-Effizienz, mit Automation. Gibt { sim, cap, efficiency, gains } zurück (gains je Ressource).
export function simulateOffline(elapsedSec) {
  const bonuses = currentBonuses();
  const cap = (bonuses.offlineCapHours || 8) * 3600;
  const sim = Math.min(Math.max(0, elapsedSec), cap);
  const efficiency = bonuses.offlineEfficiency || 0.5;
  const before = {};
  RESOURCES.forEach(r => { before[r] = state.resources[r] || 0; });
  let left = sim;
  while (left > 0) {
    const step = Math.min(OFFLINE_STEP, left);
    processTick(step * efficiency, { silent: true, auto: true, offline: true });
    left -= step;
  }
  runProgressChecks(true);
  const gains = {};
  RESOURCES.forEach(r => { gains[r] = (state.resources[r] || 0) - before[r]; });
  return { sim, cap, efficiency, gains };
}
