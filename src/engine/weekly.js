// weekly.js – Wochenwertung auf Client-Seite. Misst den Normalwert (Run-Code bei Minute 30 normaler Runs, nur wenn
// man dabei online war), wertet den Wochen-Sprint (30 Minuten mit wöchentlich wechselndem Handicap, Code bei
// Minute 30 geteilt durch den Normalwert) und hält die Labor-Slotzahl für die Forschungswertung aktuell. Die Werte
// gehen mit dem Cloud-Save an den Server (backend/lib/community.js), der die Wochen auswertet.
import { state, setState, log } from '../store/gameState.js';
import { getChallenge, weeklySprintDef, WEEKLY_SPRINT_MINUTES } from '../data/challenges.js';
import { weekOf } from '../lib/week.js';
import { runScrap } from './actions.js';
import { labSlots } from './lab.js';
import { emitToast } from '../lib/toast.js';

const MARK_MS = WEEKLY_SPRINT_MINUTES * 60e3;
// Letzte Messung höchstens so lange vor Minute 30: Man war online. Nach einer längeren Abwesenheit holt das
// Offline-Nachholen die Produktion am Stück nach – der Stand bei Minute 30 ist dann nicht bekannt.
const ONLINE_GRACE_MS = 90e3;
const PAR_RUNS = 5;

export function currentWeekId(now = Date.now()) { return weekOf(now).id; }
export function weeklySprintNow(now = Date.now()) { return weeklySprintDef(currentWeekId(now)); }

// Normalwert: bester Code bei Minute 30 der letzten normalen Runs (0 = noch keiner gemessen)
export function normalPar(s = state) {
  const marks = s.stats?.parMarks || [];
  return marks.length ? Math.max(...marks) : 0;
}

export function weeklyBest(s = state, now = Date.now()) {
  return s.weekly?.week === currentWeekId(now) ? (s.weekly.sprintBest || 0) : 0;
}
export function weeklyAttempts(s = state, now = Date.now()) {
  return s.weekly?.week === currentWeekId(now) ? (s.weekly.attempts || 0) : 0;
}

// Wochen-Sprint beginnt (engine/challenges.js startChallenge): neue Woche → Bestwert zurücksetzen, Versuch zählen
export function noteWeeklyAttempt(weekId) {
  if ((state.weekly?.week || '') !== weekId) setState('weekly', { week: weekId, sprintBest: 0, attempts: 0 });
  setState('weekly', 'attempts', (state.weekly.attempts || 0) + 1);
}

// Ergebnis für Woche `weekId`: gleiche Woche → Bestwert, neuere Woche → zurücksetzen, ältere → ignorieren
export function recordWeeklySprint(weekId, score) {
  const current = state.weekly?.week || '';
  if (weekId < current) return false;
  if (weekId > current) setState('weekly', { week: weekId, sprintBest: 0, attempts: 0 });
  setState('weekly', 'sprintBest', Math.max(state.weekly.sprintBest || 0, Math.min(100, Math.max(0, score))));
  return true;
}

function finishWeeklySprint(def, scrap, silent) {
  const par = normalPar();
  const score = par > 0 ? scrap / par : 0;
  setState('challenge', null);
  setState('stats', 'sprintsDone', (state.stats.sprintsDone || 0) + 1);
  recordWeeklySprint(def.week, score);
  const pct = Math.round(score * 100);
  log(`🏁 ${def.name}: ${pct} % deiner Normalleistung. Der Run läuft ohne Handicap weiter.`);
  if (!silent) emitToast(`Wochen-Sprint beendet: ${pct} % deiner Normalleistung`, 'good');
}

// Erster Schritt in runProgressChecks (online jede Sekunde, nach dem Offline-Nachholen einmal).
// Bis Minute 30 merkt sich jede Prüfung den Run-Code; die erste Prüfung danach wertet: Wochen-Sprint → Ergebnis
// (letzter Stand vor Minute 30, Offline-Zeit danach zählt nicht), normaler Run → Normalwert-Marke, wenn online.
export function trackWeekly(silent, now = Date.now()) {
  const slots = Math.min(4, Math.max(1, labSlots()));
  if (state.weekly?.labSlots !== slots) setState('weekly', 'labSlots', slots);

  const started = state.stats.runStartedAt || 0;
  let tr = state.stats.run30;
  if (!tr || tr.run !== started) {
    tr = { run: started, at: 0, scrap: 0, done: false };
    setState('stats', 'run30', tr);
  }
  if (tr.done) return;
  const mark = started + MARK_MS;
  if (now < mark) {
    setState('stats', 'run30', { at: now, scrap: runScrap() });
    return;
  }
  setState('stats', 'run30', 'done', true);
  const challenge = state.challenge ? getChallenge(state.challenge) : null;
  if (challenge?.weekly) { finishWeeklySprint(challenge, tr.at > 0 ? tr.scrap : 0, silent); return; }
  if (challenge) return;   // Handicap-Run eines anderen Sprints zählt nicht als Normalwert
  if (tr.at > 0 && tr.scrap > 0 && mark - tr.at <= ONLINE_GRACE_MS) {
    setState('stats', 'parMarks', [...(state.stats.parMarks || []), tr.scrap].slice(-PAR_RUNS));
  }
}
