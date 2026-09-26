import { state, setState, log } from '../store/gameState.js';
import { computeBonuses, simulateProduction, ratesFromSimulation, estimateRatesSnapshot } from '../store/bonuses.js';
import { RESOURCES } from '../data/misc.js';
import { rand } from '../lib/format.js';
import { autoBuild, autoResearch, autoExpeditions, autoProjects } from './automation.js';
import { completeMission, spawnEvent, checkAchievements, checkPrestigeMilestones } from './events.js';
import { checkQuests } from './quests.js';
import { tickCyberEvent } from './cyberEvents.js';
import { tickDecisions } from './decisions.js';
import { tickTheme } from './themeEngine.js';
import { tickDaily } from './daily.js';
import { checkChallenge } from './challenges.js';
import { checkRoadmap } from './roadmap.js';

let lastChecksAt = 0;

// Automation läuft AUTO_HZ-mal pro Sekunde Spielzeit – im Browser, beim Offline-Nachholen und in der
// Balancing-Simulation gleich. Pro Aufruf höchstens AUTO_MAX_PASSES Durchgänge, damit große Schritte günstig bleiben.
const AUTO_HZ = 4;
const AUTO_MAX_PASSES = 4;
let autoCredit = 0;

function runAutomation(b) {
  if (state.auto.build && b.autoBuild) autoBuild(b);
  if (state.auto.research && b.autoResearch) autoResearch(b);
  if (state.auto.expeditions && b.autoExpeditions) autoExpeditions(b);
  if (state.auto.projects && b.autoProjects) autoProjects(b);
}

// Errungenschaften, Meilensteine und Aufgaben prüfen (monotone Schwellen – reicht 1×/s bzw. einmal nach Offline-Catchup).
export function runProgressChecks(silent) {
  checkChallenge(silent);          // zuerst, damit Sprint-Abschlüsse sofort in Errungenschaften/Aufgaben zählen
  checkAchievements(silent);
  checkPrestigeMilestones(silent);
  checkQuests(silent);
  checkRoadmap(silent);
}

/**
 * Ein Simulationsschritt von `dt` Sekunden.
 * opts.silent   – keine Log/Toast-Ausgaben (Offline-Catchup)
 * opts.auto     – Automation ausführen (default true)
 * opts.offline  – Cyber-Events/Theme überspringen
 */
export function processTick(dt, opts = {}) {
  const silent = !!opts.silent;
  const auto = opts.auto !== false;
  const now = Date.now();

  if (state.activeProtocol && state.activeProtocolEndsAt <= now) {
    if (!silent) log(`Protokoll beendet: ${state.activeProtocol}.`);
    setState('activeProtocol', null);
    setState('activeProtocolEndsAt', 0);
  }

  if (state.event && state.eventEnds <= now) {
    if (!silent) log(`Ereignis vorbei: ${state.event.name}.`);
    setState('event', null);
    setState('lastEventAt', now);
    setState('nextEventAt', now + rand(4 * 60e3, 10 * 60e3));
  }
  if (state.boost && state.boost.endsAt <= now) {
    if (!silent) log(`Boost vorbei: ${state.boost.name}.`);
    setState('boost', null);
  }

  const b = computeBonuses();
  setState('cache', 'bonuses', b);

  // Produktion anwenden
  if (dt > 0) {
    const sim = simulateProduction(dt, state, b);
    RESOURCES.forEach((res) => {
      const delta = sim.gain[res] || 0;
      const prod = sim.produced[res] || 0;
      if (delta === 0 && prod === 0) return;
      const next = Math.max(0, (state.resources[res] || 0) + delta);
      setState('resources', res, next);
      if (prod > 0) setState('stats', 'total', res, (state.stats.total[res] || 0) + prod);
      if (next > (state.stats.max[res] || 0)) setState('stats', 'max', res, next);
    });
    // Raten-Cache aus demselben Schritt ableiten
    setState('cache', 'rates', ratesFromSimulation(sim, dt));
  }

  // Aufträge abschließen
  const finished = [];
  state.expeditions.forEach((m, idx) => { if (m.end <= now) finished.push(idx); });
  finished.reverse().forEach(idx => {
    const mission = state.expeditions[idx];
    const newExps = [...state.expeditions];
    newExps.splice(idx, 1);
    setState('expeditions', newExps);
    completeMission(mission, b, silent);
  });

  // Zufallsereignisse
  if (!state.event && !state.decision && now >= state.nextEventAt && state.techs.length >= 2) {
    const event = spawnEvent(b);
    setState('event', event);
    setState('eventEnds', now + event.duration);
    if (!silent) log(`Ereignis: ${event.name}.`);
  }

  if (!opts.skipLifetime) setState('stats', 'lifetime', state.stats.lifetime + dt);

  // Auto-Hire kauft je Durchgang höchstens 1 Stück pro Mitarbeiter-Typ.
  if (auto) {
    autoCredit = Math.min(AUTO_MAX_PASSES, autoCredit + dt * AUTO_HZ);
    for (let pass = 0; autoCredit >= 1; pass++) {
      autoCredit -= 1;
      // Ab dem zweiten Durchgang Raten neu schätzen, damit Auto-Hire keine Konverter auf veralteten Raten kauft
      if (pass > 0) setState('cache', 'rates', estimateRatesSnapshot(state, b));
      runAutomation(b);
    }
  }

  // Schwellen-Checks 1× pro Sekunde (oder pro großem Schritt), nicht pro Frame.
  if (dt >= 1 || now - lastChecksAt >= 1000) {
    lastChecksAt = now;
    tickDaily(now, silent);
    if (!opts.offline) runProgressChecks(silent);
  }

  if (!opts.offline) {
    tickCyberEvent(now);
    tickDecisions(now, silent);
    if (!silent && typeof document !== 'undefined') tickTheme(performance.now());
  }
}
