import { state, setState, add, log, hasTech } from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot } from '../store/bonuses.js';
import { RESOURCES } from '../data/misc.js';
import { rand } from '../lib/format.js';
import { autoBuild, autoResearch, autoExpeditions, autoProjects } from './automation.js';
import { completeMission, spawnEvent, checkAchievements } from './events.js';
import { tickCyberEvent } from './cyberEvents.js';
import { tickStockDividends } from './stocks.js';
import { tickTheme } from './themeEngine.js';

export function processTick(dt, opts = {}) {
  const silent = !!opts.silent;
  const auto = opts.auto !== false;

  // Active protocol expires
  if (state.activeProtocol && state.activeProtocolEndsAt <= Date.now()) {
    if (!silent) log(`Protokoll beendet: ${state.activeProtocol}.`);
    setState('activeProtocol', null);
    setState('activeProtocolEndsAt', 0);
  }

  const b = computeBonuses();
  setState('cache', 'bonuses', b);

  // Active events expire
  if (state.event && state.eventEnds <= Date.now()) {
    if (!silent) log(`Ereignis vorbei: ${state.event.name}.`);
    setState('event', null);
    setState('lastEventAt', Date.now());
    setState('nextEventAt', Date.now() + rand(4 * 60e3, 10 * 60e3));
  }

  const rates = estimateRatesSnapshot();
  RESOURCES.forEach((res) => {
    const perSecond = Math.max(0, Number(rates[res] || 0));
    if (perSecond > 0) add(res, perSecond * dt);
  });

  // Expeditions finish
  const now = Date.now();
  const finished = [];
  state.expeditions.forEach((m, idx) => { if (m.end <= now) finished.push(idx); });
  finished.reverse().forEach(idx => {
    const mission = state.expeditions[idx];
    const newExps = [...state.expeditions];
    newExps.splice(idx, 1);
    setState('expeditions', newExps);
    completeMission(mission, b, silent);
  });

  // Events
  if (!state.event && now >= state.nextEventAt) {
    const event = spawnEvent(b);
    setState('event', event);
    setState('eventEnds', now + event.duration);
    if (!silent) log(`Ereignis gestartet: ${event.name}.`);
  }

  // Automation
  if (auto) {
    if (state.auto.build && hasTech('auto_build_tech')) autoBuild(b);
    if (state.auto.research && hasTech('auto_research_tech')) autoResearch(b);
    if (state.auto.expeditions && hasTech('auto_expeditions_tech')) autoExpeditions(b);
    if (state.auto.projects && hasTech('auto_projects_tech')) autoProjects(b);
  }

  if (!opts.skipLifetime) {
    setState('stats', 'lifetime', state.stats.lifetime + dt);
  }

  RESOURCES.forEach(r => {
    setState('stats', 'max', r, Math.max(state.stats.max[r] || 0, state.resources[r] || 0));
  });

  checkAchievements(silent);
  setState('cache', 'rates', rates);

  // Dividenden — auch offline
  tickStockDividends(dt);

  // Cyber Events, Theme — skip during offline simulation
  // (Börsenkurse kommen vom Backend — werden in loop.js gepollt)
  const now2 = Date.now();
  if (!opts.offline) {
    tickCyberEvent(now2);
    if (!silent) tickTheme(performance.now());
  }
}
