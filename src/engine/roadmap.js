// roadmap.js – Finanzierungsrunden: Fortschritt der Rundenziele und Aufstieg in die nächste Runde.
// Inhalte, Ziele und Belohnungen stehen in data/chapters.js; die Freischalt-Sperren prüft gameState.js,
// die Belohnungs-Effekte wendet store/bonuses.js an.
import { state, setState, log, getProject } from '../store/gameState.js';
import { CHAPTERS } from '../data/chapters.js';
import { getLabProject } from '../data/lab.js';
import { fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

export function chapterIndex(s = state) { return s.roadmap?.chapter || 0; }
export function currentChapter(s = state) { return CHAPTERS[chapterIndex(s)] || CHAPTERS[0]; }
export function nextChapter(s = state) { return CHAPTERS[chapterIndex(s) + 1] || null; }

// Summe eines Belohnungs-Schlüssels (labSlots, chipSlots) über alle abgeschlossenen Runden
export function roundRewardSum(key, s = state) {
  return CHAPTERS.slice(0, chapterIndex(s)).reduce((n, c) => n + (c.reward?.[key] || 0), 0);
}

// Wurde ein Release in irgendeinem Run schon einmal veröffentlicht?
export function releasedEver(id, s = state) {
  return (s.stats.releasedEver || []).includes(id) || (s.projects || []).includes(id);
}

// [aktuell, Ziel] eines Rundenziels
export function goalProgress(goal, s = state) {
  switch (goal.type) {
    case 'refactors': return [s.stats.prestigeCount || 0, goal.value];
    case 'xpEarned': return [s.stats.xpEarned || 0, goal.value];
    case 'sprints': return [(s.challengesDone || []).length, goal.value];
    case 'standups': return [s.daily?.claimsTotal || 0, goal.value];
    case 'release': return [releasedEver(goal.id, s) ? 1 : 0, 1];
    case 'lab': return [(s.lab?.done || []).includes(goal.id) ? 1 : 0, 1];
    default: return [0, goal.value || 1];
  }
}

export function goalLabel(goal) {
  switch (goal.type) {
    case 'refactors': return `${goal.value} Hard Refactor${goal.value > 1 ? 's' : ''}`;
    case 'xpEarned': return `${fmt(goal.value)} XP verdient (über alle Refactors)`;
    case 'sprints': return `${goal.value} Sprint${goal.value > 1 ? 's' : ''} abgeschlossen`;
    case 'standups': return `${goal.value} Daily Standups`;
    case 'release': return `Release „${getProject(goal.id)?.name || goal.id}“ (einmal reicht)`;
    case 'lab': return `Labor: ${getLabProject(goal.id)?.name || goal.id}`;
    default: return goal.type;
  }
}

// Tab, in dem man ein Ziel vorantreibt („Zum Tab“-Buttons)
export function goalTab(goal) {
  switch (goal.type) {
    case 'standups': return 'overview';
    case 'release': return 'projects';
    case 'lab': return 'roadmap';
    default: return 'prestige';
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
    if (!chapter || !next || !chapter.goals.length || !chapter.goals.every(g => goalDone(g))) return;
    setState('roadmap', 'chapter', idx + 1);
    setState('roadmap', 'reachedAt', idx + 1, Date.now());
    log(`🚀 Finanzierungsrunde ${next.name} erreicht${chapter.rewardLabel ? ` – ${chapter.rewardLabel}` : ''}.`);
    if (!silent) emitToast(`Finanzierungsrunde ${next.name} erreicht`, 'good');
  }
}
