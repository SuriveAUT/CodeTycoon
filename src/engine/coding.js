// coding.js – Coding-Tab: je Run eine Python-Aufgabe pro Level (data/codeTasks.js), alle Level frei wählbar.
// Ein gelöstes Level n zahlt n·20 Minuten der aktuellen Produktion aller Ressourcen und +5 % XP beim nächsten Refactor.
// Sind alle Aufgaben eines Levels schon einmal gelöst, kommt eine davon als Wiederholung für ein Viertel.
// Geprüft wird der Code im Browser (lib/pyRunner.js); hier liegt nur die Buchhaltung.
import { state, setState, add, log } from '../store/gameState.js';
import { currentRates } from '../store/bonuses.js';
import { RESOURCES, RESOURCE_LABELS } from '../data/misc.js';
import { CODE_LEVELS, codeTasksForLevel, getCodeTask } from '../data/codeTasks.js';
import { fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

export const CODING_MINUTES_PER_LEVEL = 20;
export const CODING_XP_PER_LEVEL = 0.05;
export const CODING_REPEAT_FACTOR = 0.25;

export function codingUnlocked(s = state) { return (s.stats?.prestigeCount || 0) >= 1; }

// Reproduzierbare Zahl aus Run-Start und Level: dieselben Aufgaben auf allen Geräten und nach jedem Neuladen
function seededIndex(run, level, n) {
  let h = (Math.floor(run / 1000) ^ Math.imul(level, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

// Aufgaben eines Runs: pro Level eine noch nie gelöste, sonst die am längsten nicht mehr gelöste als Wiederholung
export function drawCodingTasks(run, solvedEver = {}) {
  const tasks = {};
  const repeat = {};
  for (let level = 1; level <= CODE_LEVELS; level++) {
    const pool = codeTasksForLevel(level);
    const fresh = pool.filter(t => !solvedEver[t.id]);
    if (fresh.length) {
      tasks[level] = fresh[seededIndex(run, level, fresh.length)].id;
    } else {
      tasks[level] = [...pool].sort((a, b) => solvedEver[a.id] - solvedEver[b.id])[0].id;
      repeat[level] = true;
    }
  }
  return { tasks, repeat };
}

// Stand des laufenden Runs – auch bevor ensureCodingRun ihn gespeichert hat (Renderer bleiben so rein)
export function codingRun(s = state) {
  const c = s.coding || {};
  if (c.run === s.stats.runStartedAt && c.tasks && Object.keys(c.tasks).length === CODE_LEVELS) {
    return { tasks: c.tasks, repeat: c.repeat || {}, solved: c.solved || [] };
  }
  return { ...drawCodingTasks(s.stats.runStartedAt, c.solvedEver || {}), solved: [] };
}

// Neuer Run (Refactor, Sprint-Start) → Aufgaben ziehen, gelöste Level zurücksetzen
export function ensureCodingRun() {
  if (!codingUnlocked()) return false;
  const c = state.coding;
  if (c.run === state.stats.runStartedAt && Object.keys(c.tasks || {}).length === CODE_LEVELS) return false;
  const { tasks, repeat } = drawCodingTasks(state.stats.runStartedAt, c.solvedEver || {});
  setState('coding', { run: state.stats.runStartedAt, tasks, repeat, solved: [] });
  return true;
}

export function codingLevelTask(level, s = state) { return getCodeTask(codingRun(s).tasks[level]); }

// Belohnung für Level `level` bei der aktuellen Produktion (Minuten wie beim Standup, mit kleinem Mindestwert)
export function levelReward(level, repeat = false, s = state) {
  const factor = repeat ? CODING_REPEAT_FACTOR : 1;
  const minutes = level * CODING_MINUTES_PER_LEVEL * factor;
  const produced = currentRates(s).__produced || {};
  const floor = { scrap: 50 * minutes, energy: 10 * minutes };
  const resources = {};
  for (const res of RESOURCES) {
    const amt = Math.max(floor[res] || 0, Math.floor(Math.max(0, Number(produced[res] || 0)) * 60 * minutes));
    if (amt > 0) resources[res] = amt;
  }
  return { minutes, resources, xp: CODING_XP_PER_LEVEL * factor };
}

export function codingRewardText(resources) {
  return Object.entries(resources || {}).filter(([, v]) => v > 0).map(([res, amt]) => `+${fmt(amt)} ${RESOURCE_LABELS[res] || res}`).join(', ');
}

// XP-Faktor des laufenden Runs: 1 + Summe der gelösten Level (Wiederholungen zählen ein Viertel)
export function codingXpFactor(s = state) {
  const c = s.coding;
  if (!c || c.run !== s.stats.runStartedAt) return 1;
  return 1 + (c.solved || []).reduce((sum, level) => sum + CODING_XP_PER_LEVEL * (c.repeat?.[level] ? CODING_REPEAT_FACTOR : 1), 0);
}

// Level gelöst (Abgabe hat alle Tests bestanden): einmal je Run
export function completeLevel(level, now = Date.now()) {
  if (!codingUnlocked() || !Number.isInteger(level) || level < 1 || level > CODE_LEVELS) return null;
  ensureCodingRun();
  const c = state.coding;
  const task = getCodeTask(c.tasks[level]);
  if (!task || c.solved.includes(level)) return null;
  const repeat = !!c.repeat[level];
  const reward = levelReward(level, repeat);
  Object.entries(reward.resources).forEach(([res, amt]) => add(res, amt));
  setState('coding', 'solved', [...c.solved, level]);
  setState('coding', 'solvedEver', { ...c.solvedEver, [task.id]: now });
  const xp = `+${Math.round(reward.xp * 1000) / 10} % XP beim nächsten Refactor`;
  log(`⌨️ Coding Level ${level} gelöst (${task.title}${repeat ? ', Wiederholung' : ''}): ${codingRewardText(reward.resources)} · ${xp}.`);
  emitToast(`Level ${level} gelöst – ${xp}`, 'good');
  return reward;
}

// Nav-Punkt: neue Aufgaben seit dem letzten Blick in den Tab
export function codingUnseen(s = state) { return codingUnlocked(s) && s.coding?.seenRun !== s.stats.runStartedAt; }
export function markCodingSeen() {
  if (state.coding.seenRun !== state.stats.runStartedAt) setState('coding', 'seenRun', state.stats.runStartedAt);
}
