// roadmap.js – Finanzierungsrunden: Fortschritt der Rundenziele und Aufstieg in die nächste Runde.
// Inhalte und Ziele stehen in data/chapters.js; die Tech-Sperre prüft gameState.js → isTechUnlocked.
import { state, setState, log } from '../store/gameState.js';
import { CHAPTERS } from '../data/chapters.js';
import { fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

export function chapterIndex(s = state) { return s.roadmap?.chapter || 0; }
export function currentChapter(s = state) { return CHAPTERS[chapterIndex(s)] || CHAPTERS[0]; }
export function nextChapter(s = state) { return CHAPTERS[chapterIndex(s) + 1] || null; }

// [aktuell, Ziel] eines Rundenziels
export function goalProgress(goal, s = state) {
  switch (goal.type) {
    case 'refactors': return [s.stats.prestigeCount || 0, goal.value];
    case 'xpEarned': return [s.stats.xpEarned || 0, goal.value];
    default: return [0, goal.value];
  }
}

export function goalLabel(goal) {
  switch (goal.type) {
    case 'refactors': return `${goal.value} Hard Refactor${goal.value > 1 ? 's' : ''}`;
    case 'xpEarned': return `${fmt(goal.value)} XP verdient (über alle Refactors)`;
    default: return goal.type;
  }
}

export function goalDone(goal, s = state) {
  const [cur, target] = goalProgress(goal, s);
  return cur >= target;
}

// Läuft in runProgressChecks (1×/s): alle Ziele der aktuellen Runde erfüllt → nächste Runde.
export function checkRoadmap(silent) {
  for (let guard = 0; guard < CHAPTERS.length; guard++) {
    const idx = chapterIndex();
    const chapter = CHAPTERS[idx];
    const next = CHAPTERS[idx + 1];
    if (!chapter || !next || !chapter.goals.every(g => goalDone(g))) return;
    setState('roadmap', 'chapter', idx + 1);
    setState('roadmap', 'reachedAt', idx + 1, Date.now());
    log(`🚀 Finanzierungsrunde ${next.name} erreicht – neue Technologien verfügbar.`);
    if (!silent) emitToast(`Finanzierungsrunde ${next.name} erreicht: neue Technologien verfügbar`, 'good');
  }
}
