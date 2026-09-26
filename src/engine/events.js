import { state, setState, add, log, hasProject, hasArtifact, totalBuildings, techCount, projectCount, artifactCount, colonyCount } from '../store/gameState.js';
import { resourceMult, currentBonuses, currentRates } from '../store/bonuses.js';
import { MISSIONS, ACHIEVEMENTS, PRESTIGE_MILESTONES, RESOURCE_LABELS } from '../data/misc.js';
import { EVENT_POOL } from '../data/events.js';
import { CHALLENGES } from '../data/challenges.js';
import { BUILDINGS } from '../data/buildings.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { CHIPS } from '../data/chips.js';
import { clamp, rand } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

// Belohnung eines Auftrags: Basiswert × Multiplikator + Anteil der laufenden Produktion über die Dauer.
export function getDynamicMissionRewards(missionDef, b, rates) {
  const progressScale = 1 + techCount() * 0.05 + colonyCount() * 0.10 + (state.stats.fleetLevel || 0) * 0.08;
  const produced = rates?.__produced || rates || {};
  const out = {};
  Object.entries(missionDef.rewards).forEach(([res, amt]) => {
    const base = amt * progressScale * resourceMult(res, b);
    const prodPerSec = Math.max(0, produced[res] || 0);
    const dyn = prodPerSec * missionDef.duration * (missionDef.yieldFraction || 0.4);
    out[res] = Math.floor(base + dyn);
  });
  return out;
}

export function missionSuccessChance(missionDef, b) {
  return clamp(0.5 + (b.expeditionPower / (missionDef.power || 1)) * 0.12 + b.eventResist, 0.35, 0.96);
}

export function completeMission(mission, b, silent) {
  const missionDef = MISSIONS.find(m => m.id === mission.missionId) || mission;
  const success = Math.random() < missionSuccessChance(missionDef, b);
  const rewardMult = (success ? 1 : 0.55) * (1 + b.expeditionRewardMult);
  const rates = currentRates();
  const dynRewards = getDynamicMissionRewards(missionDef, b, rates);
  Object.entries(dynRewards).forEach(([res, amt]) => add(res, amt * rewardMult));
  setState('stats', 'expeditionsDone', state.stats.expeditionsDone + 1);
  if (!silent) {
    log(`Auftrag fertig: ${missionDef.name}. ${success ? 'Hervorragende Review.' : 'Review mit Anmerkungen (−45%).'}`);
    emitToast(`${missionDef.name} abgeschlossen`, success ? 'good' : 'warn');
  }

  const xpGained = Math.round((missionDef.power || 1) * 10 * (success ? 1 : 0.5));
  setState('stats', 'fleetXP', (state.stats.fleetXP || 0) + xpGained);
  const xpNeeded = Math.floor(50 * Math.pow(1.35, state.stats.fleetLevel || 0));
  if (state.stats.fleetXP >= xpNeeded) {
    setState('stats', 'fleetLevel', (state.stats.fleetLevel || 0) + 1);
    setState('stats', 'fleetXP', 0);
    if (!silent) {
      log(`Agentur-Level ${state.stats.fleetLevel}!`);
      emitToast(`Agentur-Level ${state.stats.fleetLevel}!`, 'good');
    }
  }

  const relicRoll = (missionDef.relicChance || 0) + b.relicChance + (success ? 0.02 : 0.005);
  if (Math.random() < relicRoll) {
    const unowned = ARTIFACTS.filter(a => !hasArtifact(a.id));
    if (unowned.length) {
      const found = unowned[Math.floor(Math.random() * unowned.length)];
      setState('artifacts', [...state.artifacts, found.id]);
      if (!silent) { log(`🏆 Fund: ${found.name}.`); emitToast(`Neuer Fund: ${found.name}`, 'good'); }
    } else {
      add('relics', 10 * rewardMult);
    }
  }

  const chipRoll = (missionDef.relicChance || 0) * 0.5 + b.relicChance * 0.3;
  if (Math.random() < chipRoll) {
    const unownedChips = CHIPS.filter(c => !(state.ownedChips || []).includes(c.id));
    if (unownedChips.length) {
      const weighted = unownedChips.filter(c => {
        if (c.rarity === 'epic') return Math.random() < 0.2;
        if (c.rarity === 'rare') return Math.random() < 0.5;
        return true;
      });
      const pool = weighted.length ? weighted : unownedChips.filter(c => c.rarity === 'common');
      if (pool.length) {
        const found = pool[Math.floor(Math.random() * pool.length)];
        setState('ownedChips', [...(state.ownedChips || []), found.id]);
        if (!silent) { log(`🔧 Chip gefunden: ${found.name}!`); emitToast(`Chip gefunden: ${found.name}`, 'good'); }
      }
    }
  }
}


export function spawnEvent() {
  return EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
}

export function checkAchievements(silent) {
  const owned = new Set(state.achievements);
  const toAdd = [];
  const unlock = id => {
    if (owned.has(id)) return;
    owned.add(id);
    toAdd.push(id);
    const name = ACHIEVEMENTS.find(a => a.id === id)?.name;
    if (!silent && name) {
      log(`🏅 Errungenschaft: ${name}.`);
      emitToast(`Errungenschaft: ${name}`, 'warn');
    }
  };
  const t = state.stats.total;
  if (t.scrap >= 1e5) unlock('scrap_100k');
  if (t.scrap >= 1e9) unlock('scrap_1b');
  if (t.energy >= 1e5) unlock('energy_100k');
  if (t.alloy >= 5e4) unlock('alloy_50k');
  if (t.data >= 5e4) unlock('data_50k');
  if (t.research >= 2.5e4) unlock('research_25k');
  if (t.influence >= 1e4) unlock('influence_10k');
  if (t.influence >= 1e5) unlock('influence_100k');
  if (t.relics >= 500) unlock('relics_500');
  const tb = totalBuildings();
  if (tb >= 50) unlock('build_50');
  if (tb >= 200) unlock('build_200');
  if (tb >= 500) unlock('build_500');
  if (BUILDINGS.some(b => (state.buildings[b.id] || 0) >= 10)) unlock('milestone_1');
  const tc = techCount();
  if (tc >= 5) unlock('tech_5');
  if (tc >= 15) unlock('tech_15');
  if (tc >= 25) unlock('tech_25');
  if (projectCount() >= 1) unlock('project_1');
  if (projectCount() >= 5) unlock('project_5');
  const cc = colonyCount();
  if (cc >= 1) unlock('colony_1');
  if (cc >= 4) unlock('colony_4');
  if (cc >= 6) unlock('colony_6');
  const ed = state.stats.expeditionsDone;
  if (ed >= 5) unlock('exp_5');
  if (ed >= 25) unlock('exp_25');
  if (ed >= 50) unlock('exp_50');
  if (artifactCount() >= 1) unlock('artifact_1');
  if (artifactCount() >= 6) unlock('artifact_6');
  if ((state.stats.questsDone || 0) >= 10) unlock('quests_10');
  if (state.stats.prestigeCount >= 1) unlock('prestige_1');
  const xpEarned = state.stats.xpEarned || 0;
  if (xpEarned >= 1000) unlock('prestige_5');
  if (xpEarned >= 10000) unlock('prestige_10');
  if (hasProject('operating_system')) unlock('world_engine');
  if (hasProject('internet_three')) unlock('singularity');
  const clicks = state.stats.manualClicks || 0;
  if (clicks >= 1000) unlock('clicks_1k');
  if (clicks >= 50000) unlock('clicks_50k');
  if (clicks >= 100000) unlock('clicks_100k');
  const daily = state.daily || {};
  if ((daily.bestStreak || 0) >= 7) unlock('streak_7');
  if ((daily.bestStreak || 0) >= 30) unlock('streak_30');
  if ((daily.ticketsDone || 0) >= 50) unlock('tickets_50');
  if ((state.coffee?.used || 0) >= 10) unlock('coffee_10');
  if ((state.stats.bugsFixed || 0) >= 25) unlock('bugs_25');
  const sprints = (state.challengesDone || []).length;
  if (sprints >= 1) unlock('sprint_1');
  if (sprints >= CHALLENGES.length) unlock('sprints_all');
  const round = state.roadmap?.chapter || 0;
  if (round >= 1) unlock('round_seed');
  if (round >= 2) unlock('round_series_a');
  if (round >= 3) unlock('round_series_b');
  if (round >= 4) unlock('round_series_c');
  if (round >= 6) unlock('round_public');
  if ((state.lab?.done || []).length >= 10) unlock('lab_10');
  if (state.stats.lifetime >= 86400) unlock('playtime_1d');
  if (state.stats.lifetime >= 604800) unlock('playtime_7d');
  if (state.stats.lifetime >= 2592000) unlock('playtime_30d');
  if (toAdd.length) setState('achievements', [...state.achievements, ...toAdd]);
}

export function checkPrestigeMilestones(silent) {
  const owned = new Set(state.prestigeMilestones || []);
  const toAdd = [];
  PRESTIGE_MILESTONES.forEach(m => {
    if (!owned.has(m.id) && m.condition(state)) {
      owned.add(m.id);
      toAdd.push(m.id);
      if (!silent) {
        log(`⭐ Meilenstein: ${m.name} (${m.label}).`);
        emitToast(`Meilenstein: ${m.name}`, 'info');
      }
    }
  });
  if (toAdd.length) setState('prestigeMilestones', [...(state.prestigeMilestones || []), ...toAdd]);
}

// Der herumfliegende Bug 🐛
export function clickAnomaly(type) {
  if (!state.asteroidActive) return null;
  setState('asteroidActive', false);
  setState('stats', 'bugsFixed', (state.stats.bugsFixed || 0) + 1);
  const now = Date.now();
  const b = currentBonuses();
  const rates = currentRates();
  let result;

  if (type === 'frenzy') {
    const event = { name: 'Coffee Rush', desc: 'Gesamt ×3', duration: 60 * 1000, effects: { allMult: 3 } };
    setState('event', event); setState('eventEnds', now + event.duration);
    result = { text: 'Coffee Rush! ×3 Produktion für 60s', type: 'good' };
  } else if (type === 'click_frenzy') {
    const event = { name: 'Super-Focus', desc: 'Klick ×50', duration: 25 * 1000, effects: { clickPowerMult: 50 } };
    setState('event', event); setState('eventEnds', now + event.duration);
    result = { text: 'Super-Focus! ×50 Klick-Kraft für 25s', type: 'good' };
  } else if (type === 'relics') {
    const reward = Math.max(1, Math.floor(rand(1, 3) * (1 + (b.relicChance || 0))));
    add('relics', reward);
    result = { text: `Bug gefixt: +${reward} Legacy Code`, type: 'good' };
  } else {
    const gross = rates.__produced?.[type] || 0;
    const reward = Math.max(25, gross * 240); // 4 Minuten Produktion
    add(type, reward);
    result = { text: `Bug gefixt: +${Math.floor(reward)} ${RESOURCE_LABELS[type] || type}`, type: 'good' };
  }
  log(`🐛 ${result.text}.`);
  setState('nextAsteroidAt', now + rand(240e3, 600e3));
  return result;
}
