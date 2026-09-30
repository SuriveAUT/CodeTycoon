// roadmap.js – Finanzierungsrunden: Fortschritt der Rundenziele und Aufstieg in die nächste Runde.
// Inhalte, Ziele und Belohnungen stehen in data/chapters.js; die Freischalt-Sperren prüft gameState.js,
// die Belohnungs-Effekte wendet store/bonuses.js an.
import { state, setState, log, getProject, getTech, isTechUnlocked } from '../store/gameState.js';
import { TECHS } from '../data/techs.js';
import { CHAPTERS, PREVIEW_AT, xpBarFraction, xpAtFraction, chapterXpGoal, previewReached } from '../data/chapters.js';
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

// Füllstand 0–1 des Fortschrittsbalkens. XP wachsen pro Refactor um ein Vielfaches, linear stünde der Balken tagelang
// fast leer: Das XP-Ziel zählt deshalb Größenordnungen, logarithmisch vom Stand beim Rundenbeginn (roadmap.startXp).
export function goalFraction(goal, s = state) {
  const [cur, target] = goalProgress(goal, s);
  if (cur >= target) return 1;
  if (goal.type !== 'xpEarned') return target > 0 ? cur / target : 0;
  return xpBarFraction(cur, target, s.roadmap?.startXp || 0);
}

// Läuft in runProgressChecks (1×/s): alle Ziele der aktuellen Runde erfüllt → nächste Runde.
export function checkRoadmap(silent) {
  recordXpPoint();
  checkPreview(silent);
  checkTreeComplete(silent);
  for (let guard = 0; guard < CHAPTERS.length; guard++) {
    const idx = chapterIndex();
    const chapter = CHAPTERS[idx];
    const next = CHAPTERS[idx + 1];
    if (!chapter || !next || !chapter.goals.length || !chapter.goals.every(g => goalDone(g))) return;
    setState('roadmap', 'chapter', idx + 1);
    setState('roadmap', 'reachedAt', idx + 1, Date.now());
    setState('roadmap', 'startXp', state.stats.xpEarned || 0);
    log(`🚀 Finanzierungsrunde ${next.name} erreicht${chapter.rewardLabel ? ` – ${chapter.rewardLabel}` : ''}.`);
    if (!silent) emitToast(`Finanzierungsrunde ${next.name} erreicht`, 'good');
  }
}

// ── Zwischenziel: bei halbem XP-Balken die erste Tech der nächsten Runde vorab (data/chapters.js preview) ──

// Vorab-Tech der Runde, ihr XP-Stand und ob sie schon frei ist
export function roundPreview(s = state) {
  const chapter = currentChapter(s);
  const goal = chapterXpGoal(chapter);
  if (!chapter.preview || !goal) return null;
  return { tech: getTech(chapter.preview), xp: xpAtFraction(PREVIEW_AT, goal, s.roadmap?.startXp || 0), reached: previewReached(s) };
}

// Einmal je Runde melden (roadmap.previews merkt sich die Runden); nach einem Offline-Nachholen still – die Mail
// „Vorab-Zugang“ (data/mails.js) sagt es dann trotzdem
export function checkPreview(silent) {
  const idx = chapterIndex();
  if (!previewReached(state) || (state.roadmap.previews || []).includes(idx)) return;
  setState('roadmap', 'previews', [...(state.roadmap.previews || []), idx]);
  const name = getTech(currentChapter().preview)?.name || currentChapter().preview;
  log(`🔓 Zwischenziel erreicht: ${name} ist vorab freigeschaltet (Tab Tech).`);
  if (!silent) emitToast(`Zwischenziel erreicht: ${name} vorab freigeschaltet`, 'good');
}

// ── Tech-Baum der Runde komplett: Wer alles Lernbare hat, wartet sonst auf Neues, das erst mit der nächsten Runde
// kommt – und die gibt es nur über XP, also Refactors. Einmal je Run melden (stats.treeDoneRun = Run-Start);
// stats.treeDone zählt die Meldungen (Mail „Baum komplett“ beim ersten Mal, Toast nur die ersten drei Male) ──
const TREE_TOAST_TIMES = 3;

export function treeComplete(s = state) {
  const owned = new Set(s.techs || []);
  const open = TECHS.filter(t => !owned.has(t.id) && !(t.excludes || []).some(id => owned.has(id)));
  return open.length > 0 && !open.some(t => isTechUnlocked(t));
}

export function checkTreeComplete(silent) {
  if (!treeComplete() || state.stats.treeDoneRun === state.stats.runStartedAt) return;
  setState('stats', 'treeDoneRun', state.stats.runStartedAt);
  setState('stats', 'treeDone', (state.stats.treeDone || 0) + 1);
  log('🌳 Tech-Baum dieser Runde komplett. Neue Techs kommen mit der nächsten Finanzierungsrunde – dafür brauchst du XP: Hard Refactor im Tab Prestige.');
  if (!silent && state.stats.treeDone <= TREE_TOAST_TIMES) emitToast('Tech-Baum komplett – weiter geht es mit einem Hard Refactor (XP)', 'info');
}

// ── Prognose: XP-Stand bei jedem Refactor merken (stats.xpLog), Tempo daraus schätzen ──
const XP_LOG_MAX = 40;
const TREND_WINDOW_MS = 72 * 3600e3;   // Tempo aus den letzten drei Tagen
const TREND_MIN_SPAN_MS = 3 * 3600e3;  // mindestens drei Stunden Abstand, sonst schwankt es zu stark

export function recordXpPoint(now = Date.now(), force = false) {
  const logEntries = state.stats.xpLog || [];
  const xp = state.stats.xpEarned || 0;
  if (!force && logEntries.length) return;
  if (logEntries.length && logEntries[logEntries.length - 1].xp === xp) return;
  setState('stats', 'xpLog', [...logEntries, { t: now, xp }].slice(-XP_LOG_MAX));
}

// Wachstumsfaktor der verdienten XP pro Tag (z. B. 1,6) oder null, solange die Daten nicht reichen
export function xpGrowthPerDay(s = state, now = Date.now()) {
  const xpNow = s.stats?.xpEarned || 0;
  const first = (s.stats?.xpLog || []).find(p => p.t >= now - TREND_WINDOW_MS && p.xp > 0);
  if (!first || xpNow <= first.xp || now - first.t < TREND_MIN_SPAN_MS) return null;
  return Math.exp(Math.log(xpNow / first.xp) / ((now - first.t) / 86400e3));
}

// Zeit (ms) bis zu `targetXp` beim aktuellen Tempo; 0 = erreicht, null = noch keine Prognose
export function xpEta(targetXp, s = state, now = Date.now()) {
  const xpNow = s.stats?.xpEarned || 0;
  if (xpNow >= targetXp) return 0;
  const growth = xpGrowthPerDay(s, now);
  if (!growth || growth <= 1 || xpNow <= 0) return null;
  return (Math.log(targetXp / xpNow) / Math.log(growth)) * 86400e3;
}
