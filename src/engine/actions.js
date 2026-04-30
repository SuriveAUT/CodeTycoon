import { state, setState, canAfford, spend, add, log, hasTech, hasProject, buildingCount, getBuilding, calcBuildingCost, calcNextBuildingCost, isBuildingUnlocked, upgradeLevel, colonyCount, totalBuildings, techCount, projectCount, artifactCount, getTech, getProject, isTechUnlocked, isProjectUnlocked, defaultState } from '../store/gameState.js';
import { computeBonuses, resourceMult, estimateRatesSnapshot } from '../store/bonuses.js';
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { MISSIONS, WORLDS, FOCI, DOCTRINES, CHRONICLE_UPGRADES, OPERATIONS_MODES, PROTOCOLS } from '../data/misc.js';
import { CHIPS } from '../data/chips.js';
import { fmt, clamp, rand } from '../lib/format.js';
import { checkAchievements } from './events.js';
import { buyStock as doBuyStock, sellStock as doSellStock } from './stocks.js';

function nextCostWithMultipliers(def, b) {
  return calcNextBuildingCost(def);
}

export function nextResearchCost(tech, b) {
  return tech.cost * b.researchCostMult;
}

export function nextProjectCost(project, b) {
  const out = {};
  Object.entries(project.cost).forEach(([res, amt]) => out[res] = amt * b.projectCostMult);
  return out;
}

export { nextCostWithMultipliers };

export function purchaseBuilding(id, qty) {
  const def = getBuilding(id);
  if (!def || !isBuildingUnlocked(def)) return;
  const b = state.cache.bonuses || computeBonuses();
  let bought = 0;
  for (let i = 0; i < qty; i++) {
    const cost = nextCostWithMultipliers(def, b);
    if (!canAfford(cost)) break;
    spend(cost);
    setState('buildings', id, (state.buildings[id] || 0) + 1);
    bought += 1;
  }
  if (bought) {
    log(`${def.name}: +${bought} Mitarbeiter.`);
  }
}

export function sellBuilding(id, qty = 1) {
  const def = getBuilding(id);
  if (!def) return;
  const count = buildingCount(id);
  if (count <= 0) return;
  const toSell = Math.min(qty, count);
  const refund = {};
  for (let i = 0; i < toSell; i++) {
    const lastCost = calcBuildingCost(def, count - 1 - i, 1);
    Object.entries(lastCost).forEach(([res, amt]) => {
      refund[res] = (refund[res] || 0) + amt * 0.5;
    });
  }
  setState('buildings', id, count - toSell);
  Object.entries(refund).forEach(([res, amt]) => {
    setState('resources', res, (state.resources[res] || 0) + amt);
  });
  log(`${def.name}: −${toSell} entlassen (50% zurück).`);
}

export function purchaseTech(id) {
  const tech = getTech(id);
  if (!tech || hasTech(id) || !isTechUnlocked(tech)) return;
  const b = state.cache.bonuses || computeBonuses();
  const cost = nextResearchCost(tech, b);
  if (state.resources.research < cost) return;
  setState('resources', 'research', state.resources.research - cost);
  setState('techs', [...state.techs, id]);
  log(`Tech Stack erweitert: ${tech.name}.`);
}

export function purchaseProject(id) {
  const proj = getProject(id);
  if (!proj || hasProject(id) || !isProjectUnlocked(proj)) return;
  const b = state.cache.bonuses || computeBonuses();
  const cost = nextProjectCost(proj, b);
  if (!canAfford(cost)) return;
  spend(cost);
  setState('projects', [...state.projects, id]);
  setState('stats', 'projectsBuilt', state.stats.projectsBuilt + 1);
  log(`Produkt released: ${proj.name}.`);
}

export function prestigeGain() {
  const baseline = state.stats.totalAtLastPrestige || {};
  const scrapDelta = Math.max(0, (state.stats.total.scrap || 0) - (baseline.scrap || 0));
  const energyDelta = Math.max(0, (state.stats.total.energy || 0) - (baseline.energy || 0));
  const dataDelta = Math.max(0, (state.stats.total.data || 0) - (baseline.data || 0));
  const scrapLog = Math.log10(Math.max(1, scrapDelta / 1e8));
  const energyLog = Math.log10(Math.max(1, energyDelta / 1e8));
  const dataLog = Math.log10(Math.max(1, dataDelta / 1e6));
  const structBonus = 1 + techCount() * 0.02 + projectCount() * 0.05 + colonyCount() * 0.03;

  const base = (scrapLog + energyLog + dataLog * 0.5) * structBonus;
  const mult = (state.cache.bonuses?.prestigeGainMult || computeBonuses().prestigeGainMult);
  return Math.max(0, Math.floor(base * mult * 15));
}

export function doPrestigeReset() {
  const gain = prestigeGain();
  if (gain <= 0) return;
  const keepArtifacts = [...state.artifacts];
  const keepAchievements = [...state.achievements];
  const keepMilestones = [...(state.prestigeMilestones || [])];
  const keepUpgrades = { ...state.chronicleUpgrades };
  const keepChronicle = state.chronicle + gain;
  const keepPrestige = state.stats.prestigeCount + 1;
  const keepStats = JSON.parse(JSON.stringify(state.stats));
  const keepDoctrine = state.doctrine;
  const keepOwnedChips = [...(state.ownedChips || [])];
  const keepEquippedChips = [...(state.equippedChips || [])];
  const keepMainframeSlots = state.mainframeSlots || 3;

  const fresh = defaultState();

  // Apply fresh state
  for (const key of Object.keys(fresh)) {
    setState(key, fresh[key]);
  }
  setState('artifacts', keepArtifacts);
  setState('achievements', keepAchievements);
  setState('prestigeMilestones', keepMilestones);
  setState('chronicleUpgrades', keepUpgrades);
  setState('chronicle', keepChronicle);
  setState('stats', 'prestigeCount', keepPrestige);
  setState('stats', 'lifetime', keepStats.lifetime);
  setState('stats', 'total', keepStats.total);
  setState('stats', 'totalAtLastPrestige', { ...keepStats.total });
  setState('stats', 'max', keepStats.max);
  setState('stats', 'projectsBuilt', keepStats.projectsBuilt);
  setState('stats', 'expeditionsDone', keepStats.expeditionsDone);
  setState('stats', 'firstSeen', keepStats.firstSeen);
  setState('stats', 'manualClicks', keepStats.manualClicks);
  setState('doctrine', null);
  setState('ownedChips', keepOwnedChips);
  setState('equippedChips', keepEquippedChips);
  setState('mainframeSlots', keepMainframeSlots);
  setState('cache', { bonuses: null, rates: null });

  const mon = upgradeLevel('monument');
  setState('resources', 'scrap', state.resources.scrap + 30 + mon * 10);
  setState('resources', 'energy', state.resources.energy + 20 + mon * 8);
  setState('buildings', 'intern', 1 + mon);
  setState('buildings', 'google_ads', 1 + mon);
  setState('techs', []);
  setState('projects', []);
  setState('colonies', []);
  setState('expeditions', []);
  setState('event', null);
  setState('nextEventAt', Date.now() + rand(4 * 60e3, 8 * 60e3));
  setState('cyberEvent', null);
  setState('nextCyberEventAt', Date.now() + rand(3 * 60e3, 8 * 60e3));

  log(`Hard Refactor abgeschlossen. ${gain} XP gewonnen.`);
}

export function chronicleCost(id) {
  const lvl = upgradeLevel(id);
  const def = CHRONICLE_UPGRADES.find(x => x.id === id);
  return Math.floor(def.base * Math.pow(1.38, lvl));
}

export function buyChronicle(id) {
  const cost = chronicleCost(id);
  if (state.chronicle < cost) return;
  setState('chronicle', state.chronicle - cost);
  setState('chronicleUpgrades', id, upgradeLevel(id) + 1);
  log(`XP Investment: ${CHRONICLE_UPGRADES.find(x => x.id === id)?.name} Level ${upgradeLevel(id)}.`);
}

export function colonyFoundCost() {
  const n = colonyCount();
  return {
    scrap:     Math.floor(800000    * Math.pow(4.5, n)),
    energy:    Math.floor(400000    * Math.pow(4.5, n)),
    data:      Math.floor(120000    * Math.pow(4, n)),
    influence: Math.floor(40000     * Math.pow(4, n))
  };
}

export function canFoundColony() {
  const b = state.cache.bonuses || computeBonuses();
  return colonyCount() < b.colonyCap && canAfford(colonyFoundCost());
}

export function foundColony() {
  const b = state.cache.bonuses || computeBonuses();
  if (colonyCount() >= b.colonyCap) return;
  const cost = colonyFoundCost();
  if (!canAfford(cost)) return;
  spend(cost);
  const world = WORLDS[colonyCount() % WORLDS.length];
  const colony = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: `${world.name} ${colonyCount() + 1}`,
    world: world.id,
    focus: colonyCount() % 2 === 0 ? 'extraction' : 'science',
    level: 1,
    stability: 100
  };
  setState('colonies', [...state.colonies, colony]);
  log(`Kolonie gegründet: ${colony.name}.`);
  checkAchievements(false);
}

export function colonyUpgradeCost(c) {
  return {
    scrap:     Math.floor(200000 * Math.pow(1.55, c.level)),
    energy:    Math.floor(120000 * Math.pow(1.55, c.level)),
    alloy:     Math.floor(40000  * Math.pow(1.45, c.level)),
    data:      Math.floor(30000  * Math.pow(1.45, c.level)),
    influence: Math.floor(15000  * Math.pow(1.40, c.level))
  };
}

export function upgradeColony(id) {
  const idx = state.colonies.findIndex(c => c.id === id);
  if (idx === -1) return;
  const colony = state.colonies[idx];
  if (colony.level >= 15) { log('Max Level erreicht.'); return; }
  const cost = colonyUpgradeCost(colony);
  if (!canAfford(cost)) return;
  spend(cost);
  setState('colonies', idx, 'level', colony.level + 1);
  setState('colonies', idx, 'stability', clamp(colony.stability + 4, 45, 130));
  log(`${colony.name} auf Stufe ${colony.level + 1}.`);
}

export function upgradeAllColonies() {
  let upgraded = 0;
  let didUpgrade = true;
  while (didUpgrade) {
    didUpgrade = false;
    for (let idx = 0; idx < state.colonies.length; idx++) {
      const colony = state.colonies[idx];
      if (colony.level >= 15) continue;
      const cost = colonyUpgradeCost(colony);
      if (canAfford(cost)) {
        spend(cost);
        setState('colonies', idx, 'level', colony.level + 1);
        setState('colonies', idx, 'stability', clamp(colony.stability + 4, 45, 130));
        didUpgrade = true;
        upgraded++;
      }
    }
  }
  if (upgraded > 0) {
    log(`${upgraded} Kolonie-Upgrades durchgeführt.`);
  }
}


export function cycleColonyFocus(id) {
  const idx = state.colonies.findIndex(c => c.id === id);
  if (idx === -1) return;
  const colony = state.colonies[idx];
  const fIdx = FOCI.findIndex(f => f.id === colony.focus);
  setState('colonies', idx, 'focus', FOCI[(fIdx + 1) % FOCI.length].id);
  setState('colonies', idx, 'stability', clamp(colony.stability - 2, 30, 130));
  log(`${colony.name} jetzt auf Fokus ${FOCI.find(f => f.id === state.colonies[idx].focus)?.name}.`);
}

export function launchMission(missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return;
  const b = state.cache.bonuses || computeBonuses();
  if (b.availableExpeditionSlots <= 0) return;
  const powerReq = mission.power * 0.65;
  if (b.availableExpeditionPower < powerReq) return;
  const now = Date.now();
  const duration = Math.max(60e3, (mission.duration * 1000) / b.expeditionSpeed);
  setState('expeditions', [...state.expeditions, {
    id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`,
    missionId: mission.id,
    name: mission.name,
    start: now,
    end: now + duration,
    powerUsed: powerReq
  }]);
  log(`Expedition gestartet: ${mission.name}.`);
}

export function setDoctrine(id) {
  if (state.doctrine) {
    log(`Doktrin ist in diesem Durchlauf bereits auf ${DOCTRINES.find(d => d.id === state.doctrine)?.name} festgelegt.`);
    return;
  }
  if (!DOCTRINES.find(d => d.id === id)) return;
  setState('doctrine', id);
  if (!state.achievements.includes('doctrine')) {
    setState('achievements', [...state.achievements, 'doctrine']);
  }
  log(`Doktrin gesetzt: ${DOCTRINES.find(d => d.id === id)?.name}.`);
}

export function setOperationsMode(modeId) {
  const mode = OPERATIONS_MODES.find((entry) => entry.id === modeId);
  if (!mode) return false;
  if (state.operationsMode === modeId) return true;
  setState('operationsMode', modeId);
  log(`Betriebsmodus: ${mode.name}.`);
  return true;
}

export function activateProtocol(protocolId) {
  const protocol = PROTOCOLS.find((entry) => entry.id === protocolId);
  if (!protocol) return { ok: false, reason: 'unknown' };

  const missing = (protocol.prereq || []).find((id) => !hasTech(id));
  if (missing) return { ok: false, reason: 'locked', missing };

  const now = Date.now();
  if (state.activeProtocol && state.activeProtocolEndsAt > now) {
    return { ok: false, reason: 'active' };
  }

  const cooldownUntil = Number(state.protocolCooldowns?.[protocol.id] || 0);
  if (cooldownUntil > now) {
    return { ok: false, reason: 'cooldown', remaining: cooldownUntil - now };
  }
  if (!canAfford(protocol.cost || {})) {
    return { ok: false, reason: 'cost' };
  }

  spend(protocol.cost || {});
  setState('activeProtocol', protocol.id);
  setState('activeProtocolEndsAt', now + protocol.duration * 1000);
  setState('protocolCooldowns', protocol.id, now + protocol.cooldown * 1000);
  log(`Protokoll aktiv: ${protocol.name}.`);
  return { ok: true };
}

export function handleManualClick() {
  const b = state.cache.bonuses || computeBonuses();
  const rates = state.cache.rates || estimateRatesSnapshot();
  
  let scrapGain = 1 * b.clickPowerMult * b.allMult;
  let energyGain = 1 * b.clickPowerMult * b.allMult;
  
  if (b.clickRateFraction > 0) {
    // Production-based bonus should not be affected by clickPowerMult
    // to prevent exponential scaling that "makes no sense"
    scrapGain += Math.max(0, rates.scrap || 0) * b.clickRateFraction;
    energyGain += Math.max(0, rates.energy || 0) * b.clickRateFraction;
  }
  
  add('scrap', scrapGain);
  add('energy', energyGain);
  setState('stats', 'manualClicks', state.stats.manualClicks + 1);
  
  return { scrap: scrapGain, energy: energyGain };
}

// --- Mainframe Chip Actions ---
export function equipChip(chipId) {
  if (!state.ownedChips.includes(chipId)) return false;
  if (state.equippedChips.includes(chipId)) return false;
  if (state.equippedChips.length >= (state.mainframeSlots || 3)) return false;

  setState('equippedChips', [...state.equippedChips, chipId]);
  log(`🔧 Chip installiert: ${CHIPS.find(c => c.id === chipId)?.name || chipId}.`);
  return true;
}

export function unequipChip(chipId) {
  if (!state.equippedChips.includes(chipId)) return false;

  setState('equippedChips', state.equippedChips.filter(id => id !== chipId));
  log(`🔧 Chip entfernt: ${CHIPS.find(c => c.id === chipId)?.name || chipId}.`);
  return true;
}

// --- Market Trade Action ---
export function buyStockAction(stockId, shares) {
  return doBuyStock(stockId, shares);
}

export function sellStockAction(stockId, shares) {
  return doSellStock(stockId, shares);
}
