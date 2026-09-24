import { state, setState, log } from '../store/gameState.js';
import { computeBonuses, simulateProduction } from '../store/bonuses.js';
import { RESOURCES } from '../data/misc.js';
import { rand } from '../lib/format.js';
import { autoBuild, autoResearch, autoExpeditions, autoProjects } from './automation.js';
import { completeMission, spawnEvent, checkAchievements, checkPrestigeMilestones } from './events.js';
import { checkQuests } from './quests.js';
import { tickCyberEvent } from './cyberEvents.js';
import { tickStockDividends } from './stocks.js';
import { tickTheme } from './themeEngine.js';

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

  const b = computeBonuses();
  setState('cache', 'bonuses', b);

  // Produktion anwenden
  if (dt > 0) {
    const { gain, produced, consumed, utilization } = simulateProduction(dt, state, b);
    RESOURCES.forEach((res) => {
      const delta = gain[res] || 0;
      const prod = produced[res] || 0;
      if (delta === 0 && prod === 0) return;
      const next = Math.max(0, (state.resources[res] || 0) + delta);
      setState('resources', res, next);
      if (prod > 0) setState('stats', 'total', res, (state.stats.total[res] || 0) + prod);
      if (next > (state.stats.max[res] || 0)) setState('stats', 'max', res, next);
    });
    // Raten-Cache aus demselben Schritt ableiten
    const rates = {};
    RESOURCES.forEach((res) => { rates[res] = (gain[res] || 0) / dt; });
    rates.__produced = RESOURCES.reduce((o, r) => (o[r] = (produced[r] || 0) / dt, o), {});
    rates.__consumed = RESOURCES.reduce((o, r) => (o[r] = (consumed[r] || 0) / dt, o), {});
    rates.__utilization = utilization;
    rates.__starved = Object.entries(utilization).filter(([, u]) => u < 0.999).map(([id]) => id);
    setState('cache', 'rates', rates);
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
  if (!state.event && now >= state.nextEventAt && state.techs.length >= 2) {
    const event = spawnEvent(b);
    setState('event', event);
    setState('eventEnds', now + event.duration);
    if (!silent) log(`Ereignis: ${event.name}.`);
  }

  if (auto) {
    if (state.auto.build && b.autoBuild) autoBuild(b);
    if (state.auto.research && b.autoResearch) autoResearch(b);
    if (state.auto.expeditions && b.autoExpeditions) autoExpeditions(b);
    if (state.auto.projects && b.autoProjects) autoProjects(b);
  }

  if (!opts.skipLifetime) setState('stats', 'lifetime', state.stats.lifetime + dt);

  checkAchievements(silent);
  checkPrestigeMilestones(silent);
  checkQuests(silent);

  tickStockDividends(dt);

  if (!opts.offline) {
    tickCyberEvent(now);
    if (!silent && typeof document !== 'undefined') tickTheme(performance.now());
  }
}
