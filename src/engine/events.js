import { state, setState, add, log, hasProject, hasArtifact, totalBuildings, techCount, projectCount, artifactCount, colonyCount, buildingCount } from '../store/gameState.js';
import { resourceMult, computeBonuses, estimateRatesSnapshot } from '../store/bonuses.js';
import { MISSIONS, ACHIEVEMENTS } from '../data/misc.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { CHIPS } from '../data/chips.js';
import { clamp, rand } from '../lib/format.js';
import { getIcon } from '../lib/icons.js';
import { emitToast } from '../lib/toast.js';

export function getDynamicMissionRewards(missionDef, b, rates) {
  const progressScale = 1 + techCount() * 0.06 + colonyCount() * 0.12 + (state.stats.fleetLevel || 0) * 0.08;
  const dynRewards = {};
  Object.entries(missionDef.rewards).forEach(([res, amt]) => {
    const base = amt * progressScale * resourceMult(res, b);
    const prodPerSec = Math.max(0, rates[res] || 0);
    // Add 10% of the duration's production
    const dynBonus = prodPerSec * missionDef.duration * 0.3;
    dynRewards[res] = Math.floor(base + dynBonus);
  });
  return dynRewards;
}

export function completeMission(mission, b, silent) {
  const missionDef = MISSIONS.find(m => m.id === mission.missionId) || mission;
  const successBase = clamp(0.5 + (b.expeditionPower / (missionDef.power || 1)) * 0.12 + b.eventResist, 0.35, 0.96);
  const success = Math.random() < successBase;
  const rewardMult = (success ? 1 : 0.55) * (1 + b.expeditionRewardMult);

  const rates = state.cache.rates || estimateRatesSnapshot();
  const dynRewards = getDynamicMissionRewards(missionDef, b, rates);

  Object.entries(dynRewards).forEach(([res, amt]) => {
    add(res, amt * rewardMult);
  });
  setState('stats', 'expeditionsDone', state.stats.expeditionsDone + 1);
  if (!silent) log(`Auftrag abgeschlossen: ${missionDef.name}. ${success ? 'Hervorragende Review.' : 'Review mit Anmerkungen.'}`);

  const xpGained = Math.round((missionDef.power || 1) * 10 * (success ? 1 : 0.5));
  setState('stats', 'fleetXP', (state.stats.fleetXP || 0) + xpGained);
  const xpNeeded = Math.floor(50 * Math.pow(1.35, state.stats.fleetLevel || 0));
  if (state.stats.fleetXP >= xpNeeded) {
    setState('stats', 'fleetLevel', (state.stats.fleetLevel || 0) + 1);
    setState('stats', 'fleetXP', 0);
    if (!silent) {
      log(`${getIcon('check')} Dev-Skill auf Level ${state.stats.fleetLevel} aufgestiegen!`);
      emitToast(`Dev-Skill Level ${state.stats.fleetLevel}!`, 'good');
    }
  }

  const relicRoll = (missionDef.relicChance || 0) + b.relicChance + (success ? 0.02 : 0.005);
  if (Math.random() < relicRoll) {
    const unowned = ARTIFACTS.filter(a => !hasArtifact(a.id));
    if (unowned.length) {
      const found = unowned[Math.floor(Math.random() * unowned.length)];
      setState('artifacts', [...state.artifacts, found.id]);
      if (!silent) log(`Patent gesichert: ${found.name}.`);
    } else {
      add('relics', 10 * rewardMult);
    }
  }

  // Chip drop (separate from relics)
  const chipRoll = (missionDef.relicChance || 0) * 0.5 + b.relicChance * 0.3;
  if (Math.random() < chipRoll) {
    const unownedChips = CHIPS.filter(c => !(state.ownedChips || []).includes(c.id));
    if (unownedChips.length) {
      // Weight by rarity
      const weighted = unownedChips.filter(c => {
        if (c.rarity === 'epic') return Math.random() < 0.2;
        if (c.rarity === 'rare') return Math.random() < 0.5;
        return true;
      });
      const pool = weighted.length ? weighted : unownedChips.filter(c => c.rarity === 'common');
      if (pool.length) {
        const found = pool[Math.floor(Math.random() * pool.length)];
        setState('ownedChips', [...(state.ownedChips || []), found.id]);
        if (!silent) log(`🔧 Chip gefunden: ${found.name}!`);
      }
    }
  }
}

export function spawnEvent(b) {
  const pool = [
    { name: 'Crunch Time', duration: 5 * 60e3, effects: { energyMult: 1.15, researchMult: 0.95 } },
    { name: 'StackOverflow Hype', duration: 4 * 60e3, effects: { dataMult: 1.20, researchMult: 1.06 } },
    { name: 'Hacker-Angriff', duration: 6 * 60e3, effects: { allMult: 0.85, relicChance: 0.05 } },
    { name: 'Legacy Code Fund', duration: 5 * 60e3, effects: { relicMult: 1.15, influenceMult: 1.04 } },
    { name: 'VC Funding', duration: 4 * 60e3, effects: { buildingCostMult: 0.95, projectCostMult: 0.97 } },
    { name: 'Spaghetti Code', duration: 4 * 60e3, effects: { allMult: 0.92, eventResist: 0.01 } }
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function checkAchievements(silent) {
  const owned = new Set(state.achievements);
  const toAdd = [];
  const unlock = id => {
    if (!owned.has(id)) {
      owned.add(id);
      toAdd.push(id);
      const name = ACHIEVEMENTS.find(a => a.id === id)?.name;
      if (!silent) {
        log(`Errungenschaft freigeschaltet: ${name}.`);
        emitToast(`Errungenschaft: ${name}`, 'warn');
      }
    }
  };

  if (state.stats.total.scrap >= 100000) unlock('scrap_100k');
  if (state.stats.total.energy >= 100000) unlock('energy_100k');
  if (state.stats.total.alloy >= 50000) unlock('alloy_50k');
  if (state.stats.total.data >= 50000) unlock('data_50k');
  if (state.stats.total.research >= 25000) unlock('research_25k');
  if (state.stats.total.influence >= 10000) unlock('influence_10k');
  if (state.stats.total.relics >= 500) unlock('relics_500');
  if (totalBuildings() >= 50) unlock('build_50');
  if (totalBuildings() >= 200) unlock('build_200');
  if (techCount() >= 5) unlock('tech_5');
  if (techCount() >= 15) unlock('tech_15');
  if (projectCount() >= 1) unlock('project_1');
  if (projectCount() >= 5) unlock('project_5');
  if (colonyCount() >= 1) unlock('colony_1');
  if (colonyCount() >= 4) unlock('colony_4');
  if (state.stats.expeditionsDone >= 5) unlock('exp_5');
  if (state.stats.expeditionsDone >= 25) unlock('exp_25');
  if (artifactCount() >= 1) unlock('artifact_1');
  if (artifactCount() >= 6) unlock('artifact_6');
  if (state.stats.prestigeCount >= 1) unlock('prestige_1');
  if (state.stats.prestigeCount >= 5) unlock('prestige_5');
  if (hasProject('operating_system')) unlock('world_engine');
  if (hasProject('internet_three')) unlock('singularity');
  if ((state.stats.manualClicks || 0) >= 1000) unlock('clicks_1k');
  if ((state.stats.manualClicks || 0) >= 50000) unlock('clicks_50k');
  if (state.stats.lifetime >= 86400) unlock('playtime_1d');
  if (state.stats.lifetime >= 604800) unlock('playtime_7d');
  if (state.stats.lifetime >= 2592000) unlock('playtime_30d');

  if (toAdd.length) {
    setState('achievements', [...state.achievements, ...toAdd]);
  }
}

export function clickAnomaly(type) {
  if (!state.asteroidActive) return;
  setState('asteroidActive', false);
  const now = Date.now();

  const b = state.cache.bonuses || computeBonuses();
  const isVoid = state.techs && state.techs.includes('agi_completion');
  const voidRoll = isVoid && Math.random() < 0.4;

  if (voidRoll) {
    const wrath = Math.random() < 0.5;
    if (wrath) {
      const event = { name: 'Kernel Panic', duration: 45 * 1000, effects: { allMult: 0.1 } };
      setState('event', event);
      setState('eventEnds', now + event.duration);
      log(`BUG: Kernel Panic! Produktion um 90% gesunken (45s).`);
    } else {
      const event = { name: 'Super-Compiler', duration: 15 * 1000, effects: { allMult: 20, clickPowerMult: 100 } };
      setState('event', event);
      setState('eventEnds', now + event.duration);
      log(`HACK: Super-Compiler aktiv! x20 Produktion & x100 Klicks für 15 Sekunden!`);
    }
  } else if (Math.random() < (b.relicChance || 0.01)) {
    const reward = Math.floor(rand(1, 3) * (1 + (b.relicChance || 0)));
    add('relics', Math.max(1, reward));
    log(`Bug gefixt: ${Math.max(1, reward)} Legacy-Module extrahiert!`);
  } else if (type === 'frenzy') {
    const event = { name: 'Coffee Rush', duration: 60 * 1000, effects: { allMult: 3 } };
    setState('event', event);
    setState('eventEnds', now + event.duration);
    log(`HACK: x3 Produktion für 60 Sekunden!`);
  } else if (type === 'click_frenzy') {
    const event = { name: 'Super-Focus', duration: 25 * 1000, effects: { clickPowerMult: 50 } };
    setState('event', event);
    setState('eventEnds', now + event.duration);
    log(`HACK: x50 Klick-Kraft für 25 Sekunden!`);
  } else {
    // Standard Drop: 5 min worth of production. b.allMult is ALREADY inside rates[type].
    const rates = state.cache.rates || {};
    const reward = Math.max(50, (rates[type] || 0) * 300);
    add(type, reward);
    log(`Bug entfernt: ${type} gesammelt!`);
  }

  const cooldown = isVoid ? rand(180e3, 420e3) : rand(300e3, 900e3);
  setState('nextAsteroidAt', Date.now() + cooldown);
}
