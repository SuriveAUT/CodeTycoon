// lab.js – R&D-Labor: Projekte mit Echtzeit-Timer (data/lab.js). Starten kostet Ressourcen des Runs, danach
// läuft die Zeit auch offline weiter; fertige Projekte holt der Spieler ab, erst dann wirken sie
// (Effekte in store/bonuses.js). Der Laborstand überlebt jeden Refactor.
import { state, setState, canAfford, spend, log } from '../store/gameState.js';
import { currentRates } from '../store/bonuses.js';
import { LAB_PROJECTS, LAB_MIN_COST, LAB_MAX_STOCK_SHARE, getLabProject } from '../data/lab.js';
import { roundRewardSum, chapterIndex } from './roadmap.js';

const HOUR_MS = 3600e3;

// Das Labor öffnet mit dem ersten Hard Refactor
export function labUnlocked(s = state) {
  return (s.stats.prestigeCount || 0) > 0 || (s.lab?.done || []).length > 0;
}

// Ein Slot, dazu Rundenbelohnungen (Seed, Series B)
export function labSlots(s = state) { return 1 + roundRewardSum('labSlots', s); }
export function labFreeSlots(s = state) { return Math.max(0, labSlots(s) - (s.lab?.running || []).length); }
export function labRunning(id, s = state) { return (s.lab?.running || []).find(r => r.id === id) || null; }
export function labReady(s = state, now = Date.now()) { return (s.lab?.running || []).filter(r => r.endsAt <= now); }
export function labLevel(id, s = state) { return s.lab?.levels?.[id] || 0; }

export function labDurationMs(def, s = state) {
  if (!def.repeatable) return def.hours * HOUR_MS;
  return Math.min(def.maxHours || 24, def.hours + (def.hoursPerLevel || 0) * labLevel(def.id, s)) * HOUR_MS;
}

// Kosten: Minuten der aktuellen Bruttoproduktion je Ressource (wiederholbar: × costGrowth je Stufe), aber höchstens
// LAB_MAX_STOCK_SHARE des Vorrats – die Produktion wächst im Run so schnell, dass der Vorrat reinen
// Produktionsminuten sonst ewig hinterherläuft. Die eigentliche Bremse ist der Timer.
export function labCost(def, s = state) {
  const produced = currentRates(s).__produced || {};
  const scale = def.repeatable ? Math.pow(def.costGrowth || 1, labLevel(def.id, s)) : 1;
  const cost = {};
  for (const [res, minutes] of Object.entries(def.cost || {})) {
    const byProduction = (produced[res] || 0) * minutes * 60 * scale;
    cost[res] = Math.ceil(Math.max(LAB_MIN_COST, Math.min((s.resources[res] || 0) * LAB_MAX_STOCK_SHARE, byProduction)));
  }
  return cost;
}

// 'done' | 'ready' (fertig, abholen) | 'running' | 'locked' (spätere Runde) | 'skipped' | 'available'
// skipped: Schlüsselprojekt einer Runde, die schon hinter dem Spieler liegt (z. B. per Migration) – ohne Wirkung
export function labStatus(def, s = state, now = Date.now()) {
  if (!def.repeatable && (s.lab?.done || []).includes(def.id)) return 'done';
  const run = labRunning(def.id, s);
  if (run) return run.endsAt <= now ? 'ready' : 'running';
  if (def.chapter > chapterIndex(s)) return 'locked';
  if (def.key && def.chapter < chapterIndex(s)) return 'skipped';
  return 'available';
}

// Projekte, die gerade gestartet werden könnten (ohne Kostenprüfung)
export function labAvailable(s = state) {
  return LAB_PROJECTS.filter(def => labStatus(def, s) === 'available');
}

export function canStartLab(id, s = state) {
  const def = getLabProject(id);
  return !!def && labUnlocked(s) && labStatus(def, s) === 'available' && labFreeSlots(s) > 0 && canAfford(labCost(def, s));
}

export function startLab(id, now = Date.now()) {
  if (!canStartLab(id)) return false;
  const def = getLabProject(id);
  const duration = labDurationMs(def);
  spend(labCost(def));
  setState('lab', 'running', [...state.lab.running, { id, startedAt: now, endsAt: now + duration }]);
  log(`🧪 Labor: ${def.name} gestartet (${Math.round(duration / HOUR_MS * 10) / 10} h).`);
  return true;
}

export function claimLab(id, now = Date.now()) {
  const run = labRunning(id);
  if (!run || run.endsAt > now) return false;
  const def = getLabProject(id);
  setState('lab', 'running', state.lab.running.filter(r => r.id !== id));
  if (def?.repeatable) setState('lab', 'levels', id, labLevel(id) + 1);
  else setState('lab', 'done', [...state.lab.done, id]);
  log(`🧪 Labor fertig: ${def?.name || id}${def?.repeatable ? ` Stufe ${labLevel(id)}` : ''}${def?.label ? ` – ${def.label}` : ''}.`);
  return true;
}

// Alle laufenden Projekte um `ms` verkürzen (Standup, Kaffee „Überstunden“). Gibt die Anzahl zurück.
export function speedUpLab(ms) {
  const running = state.lab?.running || [];
  if (!running.length) return 0;
  setState('lab', 'running', running.map(r => ({ ...r, endsAt: r.endsAt - ms })));
  return running.length;
}
