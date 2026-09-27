// lab.js – R&D-Labor: Projekte mit Echtzeit-Timer (data/lab.js). Starten kostet Ressourcen des Runs, danach
// läuft die Zeit auch offline weiter; fertige Projekte holt der Spieler ab, erst dann wirken sie
// (Effekte in store/bonuses.js). Sind alle Slots belegt, lässt sich je Slot ein Folgeprojekt vorab bezahlt einplanen;
// es startet automatisch zum Ende des Vorgängers (processLabQueue). Der Laborstand überlebt jeden Refactor.
import { state, setState, canAfford, spend, log } from '../store/gameState.js';
import { currentRates } from '../store/bonuses.js';
import { LAB_PROJECTS, LAB_MIN_COST, LAB_MAX_STOCK_SHARE, getLabProject } from '../data/lab.js';
import { roundRewardSum, chapterIndex } from './roadmap.js';
import { emitToast } from '../lib/toast.js';

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
export function labCost(def, s = state, extraLevels = 0) {
  const produced = currentRates(s).__produced || {};
  const scale = def.repeatable ? Math.pow(def.costGrowth || 1, labLevel(def.id, s) + extraLevels) : 1;
  const cost = {};
  for (const [res, minutes] of Object.entries(def.cost || {})) {
    const byProduction = (produced[res] || 0) * minutes * 60 * scale;
    cost[res] = Math.ceil(Math.max(LAB_MIN_COST, Math.min((s.resources[res] || 0) * LAB_MAX_STOCK_SHARE, byProduction)));
  }
  return cost;
}

// 'done' | 'ready' (fertig, abholen) | 'running' | 'queued' (eingeplant) | 'locked' (spätere Runde) | 'skipped' | 'available'
// skipped: Schlüsselprojekt einer Runde, die schon hinter dem Spieler liegt (z. B. per Migration) – ohne Wirkung
export function labStatus(def, s = state, now = Date.now()) {
  if (!def.repeatable && (s.lab?.done || []).includes(def.id)) return 'done';
  const run = labRunning(def.id, s);
  if (run) return run.endsAt <= now ? 'ready' : 'running';
  if (labQueued(def.id, s)) return 'queued';
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

// ── Warteschlange: je Slot ein vorab bezahltes Folgeprojekt (state.lab.queued) ──
export function labQueue(s = state) { return s.lab?.queued || []; }
export function labQueued(id, s = state) { return labQueue(s).find(q => q.id === id) || null; }
export function labQueueFree(s = state) { return Math.max(0, labSlots(s) - labQueue(s).length); }

// Ein laufendes wiederholbares Projekt lässt sich „danach nochmal“ einplanen – zum Preis der nächsten Stufe
export function labQueueCost(def, s = state) {
  return labCost(def, s, def.repeatable && labRunning(def.id, s) ? 1 : 0);
}

// Einplanen statt Starten, wenn alle Slots belegt sind
export function canQueueLab(id, s = state) {
  const def = getLabProject(id);
  if (!def || !labUnlocked(s) || labFreeSlots(s) > 0 || labQueueFree(s) <= 0 || labQueued(id, s)) return false;
  const status = labStatus(def, s);
  const ok = status === 'available' || (def.repeatable && (status === 'running' || status === 'ready'));
  return ok && canAfford(labQueueCost(def, s));
}

export function queueLab(id, now = Date.now()) {
  if (!canQueueLab(id)) return false;
  const def = getLabProject(id);
  const cost = labQueueCost(def);
  spend(cost);
  setState('lab', 'queued', [...labQueue(), { id, cost, queuedAt: now }]);
  log(`🧪 Labor: ${def.name} eingeplant – startet, sobald ein Projekt fertig ist.`);
  return true;
}

// Erstattung direkt auf den Vorrat – zählt nicht als Produktion (stats.total)
function refundCost(cost) {
  Object.entries(cost || {}).forEach(([res, amt]) => { if (amt > 0) setState('resources', res, (state.resources[res] || 0) + amt); });
}

// Aus der Planung nehmen: Kosten zurück
export function cancelQueuedLab(id) {
  const q = labQueued(id);
  if (!q) return false;
  setState('lab', 'queued', labQueue().filter(x => x.id !== id));
  refundCost(q.cost);
  log(`🧪 Labor: ${getLabProject(id)?.name || id} aus der Planung genommen, Kosten erstattet.`);
  return true;
}

// Geplante Projekte starten, sobald ein Slot frei wird. Ist ein laufendes Projekt fertig, wird es automatisch
// abgeholt und das geplante startet zu dessen Endzeit – nach einer Abwesenheit also rückwirkend. Läuft in
// runProgressChecks, nicht in den Offline-Schritten: Effekte abgeholter Projekte wirken erst ab der Rückkehr.
export function processLabQueue(now = Date.now(), silent = false) {
  for (let guard = 0; guard < 10 && labQueue().length; guard++) {
    let startAt = now;
    let finished = null;
    if (labFreeSlots() <= 0) {
      finished = labReady(state, now).sort((a, z) => a.endsAt - z.endsAt)[0];
      if (!finished) return;
      startAt = finished.endsAt;
    }
    // Erstes geplantes Projekt, das jetzt starten kann (ein laufendes wiederholbares erst nach seinem Abschluss)
    const next = labQueue().find(q => !labRunning(q.id) || q.id === finished?.id);
    if (!next) return;
    const finishedName = finished ? getLabProject(finished.id)?.name : null;
    if (finished) claimLab(finished.id, now);
    setState('lab', 'queued', labQueue().filter(q => q.id !== next.id));
    const def = getLabProject(next.id);
    if (!def || (!def.repeatable && state.lab.done.includes(def.id))) { refundCost(next.cost); continue; }
    setState('lab', 'running', [...state.lab.running, { id: def.id, startedAt: startAt, endsAt: startAt + labDurationMs(def) }]);
    log(`🧪 Labor: ${def.name} gestartet (eingeplant).`);
    if (!silent) emitToast(finishedName ? `Labor: ${finishedName} fertig, ${def.name} gestartet` : `Labor: ${def.name} gestartet`, 'good');
  }
}

// Alle laufenden Projekte um `ms` verkürzen (Standup, Kaffee „Überstunden“). Gibt die Anzahl zurück.
export function speedUpLab(ms) {
  const running = state.lab?.running || [];
  if (!running.length) return 0;
  setState('lab', 'running', running.map(r => ({ ...r, endsAt: r.endsAt - ms })));
  return running.length;
}
