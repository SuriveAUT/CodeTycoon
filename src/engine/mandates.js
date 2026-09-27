// mandates.js – Vorstandsmandate (data/mandates.js) ab Runde „Börsennotiert“: Auswahl, Schritte, Abschluss, Skalierung.
// Die Schritte melden engine/lab.js (Labor-Projekt abgeholt), engine/challenges.js (Vorstands-Sprint geschafft) und
// engine/actions.js (Release gebaut). Importrichtung nur von dort hierher, nie zurück.
import { state, setState, log } from '../store/gameState.js';
import { CHAPTERS } from '../data/chapters.js';
import { getChallenge } from '../data/challenges.js';
import {
  MANDATES, MANDATE_STEPS, MANDATE_STEP_LABELS, MANDATE_SPRINT_SHARE, MANDATE_SPRINT_GROWTH, MANDATE_BUDGET,
  MANDATE_BUDGET_GROWTH, MANDATE_DEPOSIT_SHARE, MANDATE_LAB_HOURS_PER_LEVEL, MANDATE_LAB_MAX_HOURS, getMandate
} from '../data/mandates.js';
import { emitToast } from '../lib/toast.js';

export function mandatesUnlocked(s = state) { return (s.roadmap?.chapter || 0) >= CHAPTERS.length - 1; }
export function mandateLevel(id, s = state) { return s.mandates?.levels?.[id] || 0; }
export function mandatesCompleted(s = state) { return MANDATES.reduce((sum, m) => sum + mandateLevel(m.id, s), 0); }

// Stufe, die gerade läuft: erst alle Mandate einer Stufe erfüllen, dann kommt die nächste
export function mandateRound(s = state) { return Math.min(...MANDATES.map(m => mandateLevel(m.id, s))); }
export function mandateAvailable(id, s = state) {
  return mandatesUnlocked(s) && !!getMandate(id) && mandateLevel(id, s) <= mandateRound(s);
}

export function activeMandate(s = state) { return getMandate(s.mandates?.active); }
export function mandateProgress(id, s = state) { return s.mandates?.progress?.[id] || {}; }
export function mandateStepDone(id, step, s = state) { return !!mandateProgress(id, s)[step]; }
export function mandateSprintGoal(id, s = state) { return s.mandates?.sprintGoals?.[id] || 0; }

// Nach dem ersten Abschluss gelten die Freischaltungen (Labor-Slot, Core Value, Chip, Endlos-Projekt)
export function mandateUnlocked(id, s = state) { return mandateLevel(id, s) >= 1; }
export function mandateUnlockSum(key, s = state) {
  return MANDATES.reduce((sum, m) => sum + (mandateUnlocked(m.id, s) ? Number(m.unlock?.[key]) || 0 : 0), 0);
}

// Jedes weitere Mandat ist härter – egal in welcher Reihenfolge der Spieler sie angeht
export function mandateLabHours(def, s = state) {
  return Math.min(MANDATE_LAB_MAX_HOURS, def.hours + MANDATE_LAB_HOURS_PER_LEVEL * mandatesCompleted(s));
}

function currentRunScrap(s) { return Math.max(0, (s.stats.total?.scrap || 0) - (s.stats.totalAtLastPrestige?.scrap || 0)); }

// Vorstands-Sprint: Anteil des Rekord-Runs, wächst mit jedem erfüllten Mandat
function sprintGoalFor(s) {
  const best = Math.max(s.stats.bestRunScrap || 0, currentRunScrap(s));
  return Math.max(1e9, Math.ceil(best * MANDATE_SPRINT_SHARE * Math.pow(MANDATE_SPRINT_GROWTH, mandatesCompleted(s))));
}

// Mandat übernehmen. Wechseln geht jederzeit (der Fortschritt bleibt), nur nicht während eines Vorstands-Sprints.
export function selectMandate(id) {
  if (!mandateAvailable(id) || state.mandates?.active === id) return false;
  if (getChallenge(state.challenge)?.mandate) return false;
  setState('mandates', 'active', id);
  if (!mandateSprintGoal(id)) setState('mandates', 'sprintGoals', id, sprintGoalFor(state));
  log(`🏛️ Vorstandsmandat übernommen: ${getMandate(id).name}.`);
  return true;
}

// ── Release-Budget: überlebt Refactors, wird aus dem Vorrat eingezahlt ──
export function mandateBudgetTarget(s = state) {
  const scale = Math.pow(MANDATE_BUDGET_GROWTH, mandatesCompleted(s));
  return Object.fromEntries(Object.entries(MANDATE_BUDGET).map(([res, amt]) => [res, Math.ceil(amt * scale)]));
}
export function mandateBudget(id, s = state) { return s.mandates?.budget?.[id] || {}; }

// Was eine Einzahlung jetzt brächte: je Ressource höchstens `share` des Vorrats, höchstens der Rest
export function mandateDepositPreview(id, s = state, share = MANDATE_DEPOSIT_SHARE) {
  const target = mandateBudgetTarget(s);
  const paid = mandateBudget(id, s);
  return Object.fromEntries(Object.entries(target).map(([res, amt]) => [res,
    Math.max(0, Math.min(amt - (paid[res] || 0), Math.floor((s.resources[res] || 0) * share)))]));
}

export function canDepositMandate(id, s = state, share = MANDATE_DEPOSIT_SHARE) {
  return s.mandates?.active === id && !mandateStepDone(id, 'release', s)
    && Object.values(mandateDepositPreview(id, s, share)).some(v => v > 0);
}

// Einzahlen (Knopf: höchstens die Hälfte des Vorrats, damit genug fürs Labor bleibt); ist das Budget voll, gilt das
// Release als gebaut. Gibt die eingezahlten Beträge zurück (oder null).
export function depositMandate(id, silent = false, share = MANDATE_DEPOSIT_SHARE) {
  if (!canDepositMandate(id, state, share)) return null;
  const pay = mandateDepositPreview(id, state, share);
  const paid = { ...mandateBudget(id) };
  Object.entries(pay).forEach(([res, amt]) => {
    if (amt <= 0) return;
    setState('resources', res, Math.max(0, (state.resources[res] || 0) - amt));
    paid[res] = (paid[res] || 0) + amt;
  });
  setState('mandates', 'budget', id, paid);
  const target = mandateBudgetTarget();
  if (Object.entries(target).every(([res, amt]) => (paid[res] || 0) >= amt)) completeMandateStep(id, 'release', silent);
  return pay;
}

// Beim Refactor fließt der übrige Hype und Legacy Code ins Budget des aktiven Mandats – er ginge sonst verloren
export function depositOnRefactor() {
  const id = state.mandates?.active;
  return id ? depositMandate(id, true, 1) : null;
}

export function completeMandateStep(id, step, silent = false) {
  const def = getMandate(id);
  if (!def || !MANDATE_STEPS.includes(step) || mandateStepDone(id, step)) return false;
  setState('mandates', 'progress', id, { ...mandateProgress(id), [step]: true });
  log(`🏛️ ${def.name}: ${MANDATE_STEP_LABELS[step]} erledigt.`);
  if (!silent) emitToast(`${def.name}: ${MANDATE_STEP_LABELS[step]} erledigt`, 'good');
  if (MANDATE_STEPS.every(st => mandateStepDone(id, st))) finishMandate(def, silent);
  return true;
}

function finishMandate(def, silent) {
  const first = !mandateUnlocked(def.id);
  setState('mandates', 'levels', def.id, mandateLevel(def.id) + 1);
  // Objekte würden verschmolzen, nicht ersetzt: undefined löscht den Durchgang
  setState('mandates', 'progress', def.id, undefined);
  setState('mandates', 'sprintGoals', def.id, 0);
  setState('mandates', 'budget', def.id, undefined);
  if (state.mandates.active === def.id) setState('mandates', 'active', null);
  setState('mandates', 'last', def.id);  // App.jsx feiert es
  if (first && def.unlock?.chip && !(state.ownedChips || []).includes(def.unlock.chip)) {
    setState('ownedChips', [...(state.ownedChips || []), def.unlock.chip]);
  }
  log(`🏛️ Vorstandsmandat erfüllt: ${def.name} – ${first ? def.rewardLabel : 'Gesamt ×1,15 für immer'}.`);
  if (!silent) emitToast(`Vorstandsmandat erfüllt: ${def.name}`, 'good');
}
