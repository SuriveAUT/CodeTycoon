// challenges.js – Sprints: Runs mit Handicap und Ziel. Modifikatoren/Belohnungen wendet store/bonuses.js an.
import { state, setState, log, techCount } from '../store/gameState.js';
import { getChallenge } from '../data/challenges.js';
import { runScrap, doPrestigeReset } from './actions.js';
import { emitToast } from '../lib/toast.js';

export function activeChallenge(s = state) { return s.challenge ? getChallenge(s.challenge) : null; }
export function challengesDone(s = state) { return s.challengesDone || []; }

// 'done' | 'active' | 'locked' | 'busy' (anderer Sprint läuft) | 'ready'
export function challengeStatus(def, s = state) {
  if (challengesDone(s).includes(def.id)) return 'done';
  if (s.challenge === def.id) return 'active';
  if ((s.stats.prestigeCount || 0) < 1 || challengesDone(s).length < def.requires) return 'locked';
  return s.challenge ? 'busy' : 'ready';
}

export function challengeProgress(def, s = state) {
  if (def.goal.type === 'techs') return [techCount(s), def.goal.value];
  return [runScrap(s), def.goal.value];
}

export function challengeTimeLeft(def, s = state, now = Date.now()) {
  if (!def.timeLimit) return Infinity;
  return Math.max(0, (s.stats.runStartedAt || 0) + def.timeLimit - now);
}

// Startet wie ein Hard Refactor (XP wird gutgeschrieben, auch 0) und setzt das Handicap.
export function startChallenge(id) {
  const def = getChallenge(id);
  if (!def || challengeStatus(def) !== 'ready') return false;
  if (!doPrestigeReset({ allowZero: true })) return false;
  setState('challenge', id);
  log(`🏃 Sprint gestartet: ${def.name} (${def.modLabel}).`);
  return true;
}

export function abortChallenge() {
  const def = activeChallenge();
  if (!def) return false;
  setState('challenge', null);
  log(`Sprint abgebrochen: ${def.name}. Der Run läuft ohne Handicap weiter.`);
  return true;
}

// Läuft in runProgressChecks (1×/s): Zeitlimit abgelaufen → Sprint endet; Ziel erreicht → Belohnung permanent.
// Die Deadline zuerst, damit ein Offline-Nachholen nach Ablauf den Sprint nicht nachträglich gewinnt.
export function checkChallenge(silent, now = Date.now()) {
  const def = activeChallenge();
  if (!def) return;
  if (def.timeLimit && challengeTimeLeft(def, state, now) <= 0) {
    setState('challenge', null);
    log(`⏱️ Sprint verpasst: ${def.name}. Der Run läuft normal weiter.`);
    if (!silent) emitToast(`Sprint verpasst: ${def.name}`, 'warn');
    return;
  }
  const [cur, target] = challengeProgress(def);
  if (cur >= target) {
    setState('challengesDone', [...challengesDone(), def.id]);
    setState('challenge', null);
    setState('stats', 'sprintsDone', (state.stats.sprintsDone || 0) + 1);
    log(`🏆 Sprint geschafft: ${def.name} → ${def.rewardLabel} (permanent).`);
    if (!silent) emitToast(`Sprint geschafft: ${def.name} – ${def.rewardLabel}`, 'good');
  }
}
