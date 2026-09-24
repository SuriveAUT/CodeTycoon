import {
  state, setState, canAfford, spend, add, log, hasTech, hasProject, buildingCount, getBuilding,
  calcBuildingCost, calcNextBuildingCost, maxAffordable, isBuildingUnlocked, upgradeLevel, colonyCount,
  techCount, projectCount, getTech, getProject, isTechUnlocked, isProjectUnlocked, defaultState
} from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot, clickValue, chronicleCostFor } from '../store/bonuses.js';
import { MISSIONS, WORLDS, FOCI, DOCTRINES, CHRONICLE_UPGRADES, OPERATIONS_MODES, PROTOCOLS } from '../data/misc.js';
import { CHIPS } from '../data/chips.js';
import { clamp, rand } from '../lib/format.js';
import { checkAchievements } from './events.js';
import { milestoneMult } from '../data/buildings.js';
import { emitToast } from '../lib/toast.js';
import { buyStock as doBuyStock, sellStock as doSellStock } from './stocks.js';

function bonuses() { return state.cache.bonuses || computeBonuses(); }

export function nextResearchCost(tech, b = bonuses()) { return Math.ceil(tech.cost * b.researchCostMult); }
export function nextProjectCost(project, b = bonuses()) {
  const out = {};
  Object.entries(project.cost).forEach(([res, amt]) => out[res] = Math.ceil(amt * b.projectCostMult));
  return out;
}

export function purchaseBuilding(id, qty = 1) {
  const def = getBuilding(id);
  if (!def || !isBuildingUnlocked(def)) return 0;
  const wanted = qty === 'max' ? maxAffordable(def) : Number(qty) || 1;
  const before = state.buildings[id] || 0;
  let bought = 0;
  for (let i = 0; i < wanted; i++) {
    const cost = calcNextBuildingCost(def);
    if (!canAfford(cost)) break;
    spend(cost);
    setState('buildings', id, (state.buildings[id] || 0) + 1);
    bought += 1;
  }
  if (bought) {
    log(`${def.name}: +${bought}.`);
    const after = state.buildings[id] || 0;
    if (milestoneMult(after) > milestoneMult(before)) {
      log(`🚀 Meilenstein: ${def.name} ×${milestoneMult(after)} Output!`);
      emitToast(`${def.name}: Output ×${milestoneMult(after)}!`, 'good');
    }
  }
  return bought;
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
    Object.entries(lastCost).forEach(([res, amt]) => { refund[res] = (refund[res] || 0) + amt * 0.5; });
  }
  setState('buildings', id, count - toSell);
  Object.entries(refund).forEach(([res, amt]) => setState('resources', res, (state.resources[res] || 0) + amt));
  log(`${def.name}: −${toSell} (50% Rückerstattung).`);
}

export function purchaseTech(id) {
  const tech = getTech(id);
  if (!tech || hasTech(id) || !isTechUnlocked(tech)) return false;
  const cost = nextResearchCost(tech);
  if (state.resources.research < cost) return false;
  setState('resources', 'research', state.resources.research - cost);
  setState('techs', [...state.techs, id]);
  log(`Gelernt: ${tech.name}.`);
  return true;
}

export function purchaseProject(id) {
  const proj = getProject(id);
  if (!proj || hasProject(id) || !isProjectUnlocked(proj)) return false;
  const cost = nextProjectCost(proj);
  if (!canAfford(cost)) return false;
  spend(cost);
  setState('projects', [...state.projects, id]);
  setState('stats', 'projectsBuilt', state.stats.projectsBuilt + 1);
  log(`Release: ${proj.name}.`);
  return true;
}

// ── Prestige ──
export function runScrap(s = state) {
  return Math.max(0, (s.stats.total.scrap || 0) - (s.stats.totalAtLastPrestige?.scrap || 0));
}

// Strukturbonus: Techs, Releases und Standorte des Runs erhöhen die XP
export function prestigeStructBonus(s = state) {
  return 1 + techCount(s) * 0.02 + projectCount(s) * 0.05 + colonyCount(s) * 0.03;
}

export function prestigeGainRaw(s = state, b = s.cache?.bonuses || computeBonuses(s)) {
  const base = 6 * Math.cbrt(runScrap(s) / 1e7);
  return base * prestigeStructBonus(s) * (b.prestigeGainMult || 1);
}

export function prestigeGain(s = state) {
  return Math.max(0, Math.floor(prestigeGainRaw(s)));
}

// Wie viel Code fehlt bis zum nächsten vollen XP-Punkt?
export function scrapForNextXp(s = state) {
  const b = s.cache?.bonuses || computeBonuses(s);
  const mult = prestigeStructBonus(s) * (b.prestigeGainMult || 1);
  const nextXp = prestigeGain(s) + 1;
  const needed = Math.pow(nextXp / (6 * mult), 3) * 1e7;
  return Math.max(0, needed - runScrap(s));
}

export function doPrestigeReset() {
  const gain = prestigeGain();
  if (gain <= 0) return false;
  const keep = {
    artifacts: [...state.artifacts],
    achievements: [...state.achievements],
    milestones: [...(state.prestigeMilestones || [])],
    upgrades: { ...state.chronicleUpgrades },
    chronicle: state.chronicle + gain,
    prestigeCount: state.stats.prestigeCount + 1,
    stats: JSON.parse(JSON.stringify(state.stats)),
    ownedChips: [...(state.ownedChips || [])],
    equippedChips: [...(state.equippedChips || [])],
    mainframeSlots: state.mainframeSlots || 3,
    questIndex: state.questIndex,
    buyAmount: state.buyAmount,
    auto: { ...state.auto },
    stocks: { ...(state.stocks || {}) },
    log: [...state.log]
  };

  const fresh = defaultState();
  for (const key of Object.keys(fresh)) setState(key, fresh[key]);

  setState('artifacts', keep.artifacts);
  setState('achievements', keep.achievements);
  setState('prestigeMilestones', keep.milestones);
  setState('chronicleUpgrades', keep.upgrades);
  setState('chronicle', keep.chronicle);
  setState('questIndex', keep.questIndex);
  setState('buyAmount', keep.buyAmount);
  setState('auto', keep.auto);
  setState('stocks', keep.stocks);
  setState('ownedChips', keep.ownedChips);
  setState('equippedChips', keep.equippedChips);
  setState('mainframeSlots', keep.mainframeSlots);
  setState('log', keep.log);
  setState('stats', 'prestigeCount', keep.prestigeCount);
  setState('stats', 'lifetime', keep.stats.lifetime);
  setState('stats', 'total', keep.stats.total);
  setState('stats', 'totalAtLastPrestige', { ...keep.stats.total });
  setState('stats', 'max', keep.stats.max);
  setState('stats', 'projectsBuilt', keep.stats.projectsBuilt);
  setState('stats', 'expeditionsDone', keep.stats.expeditionsDone);
  setState('stats', 'firstSeen', keep.stats.firstSeen);
  setState('stats', 'manualClicks', keep.stats.manualClicks);
  setState('stats', 'protocolsUsed', keep.stats.protocolsUsed || 0);
  setState('stats', 'questsDone', keep.stats.questsDone || 0);
  setState('stats', 'decisionsMade', keep.stats.decisionsMade || 0);
  setState('stats', 'fleetXP', keep.stats.fleetXP || 0);
  setState('stats', 'fleetLevel', keep.stats.fleetLevel || 0);
  setState('cache', { bonuses: null, rates: {} });

  // Startkapital via Seed Funding
  const mon = upgradeLevel('monument');
  setState('resources', 'scrap', 50 + mon * 100);
  setState('resources', 'energy', 20 + mon * 40);
  setState('buildings', 'intern', 1 + mon * 2);
  setState('buildings', 'google_ads', 1 + mon);
  setState('nextEventAt', Date.now() + rand(4 * 60e3, 8 * 60e3));
  setState('nextCyberEventAt', Date.now() + rand(4 * 60e3, 9 * 60e3));
  setState('nextDecisionAt', Date.now() + rand(6 * 60e3, 10 * 60e3));
  setState('nextAsteroidAt', Date.now() + rand(60e3, 150e3));

  log(`🔁 Hard Refactor #${keep.prestigeCount}: +${gain} XP.`);
  return true;
}

export function chronicleCost(id) { return chronicleCostFor(id, upgradeLevel(id)); }

export function buyChronicle(id) {
  const def = CHRONICLE_UPGRADES.find(x => x.id === id);
  if (!def) return false;
  if (def.max && upgradeLevel(id) >= def.max) return false;
  const cost = chronicleCost(id);
  if (state.chronicle < cost) return false;
  setState('chronicle', state.chronicle - cost);
  setState('chronicleUpgrades', id, upgradeLevel(id) + 1);
  log(`XP investiert: ${def.name} Stufe ${upgradeLevel(id)}.`);
  return true;
}

// ── Standorte ──
export function colonyFoundCost() {
  const n = colonyCount();
  return {
    scrap: Math.floor(400000 * Math.pow(4, n)),
    energy: Math.floor(80000 * Math.pow(4, n)),
    data: Math.floor(15000 * Math.pow(3.5, n)),
    influence: Math.floor(4000 * Math.pow(3.5, n))
  };
}

export function canFoundColony() {
  return colonyCount() < bonuses().colonyCap && canAfford(colonyFoundCost());
}

export function foundColony() {
  if (colonyCount() >= bonuses().colonyCap) return false;
  const cost = colonyFoundCost();
  if (!canAfford(cost)) return false;
  spend(cost);
  const world = WORLDS[colonyCount() % WORLDS.length];
  const colony = {
    id: (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    name: world.name,
    world: world.id,
    focus: colonyCount() % 2 === 0 ? 'extraction' : 'science',
    level: 1,
    stability: 100
  };
  setState('colonies', [...state.colonies, colony]);
  log(`Standort eröffnet: ${colony.name}.`);
  checkAchievements(false);
  return true;
}

export function colonyUpgradeCost(c) {
  return {
    scrap: Math.floor(80000 * Math.pow(1.5, c.level)),
    energy: Math.floor(20000 * Math.pow(1.5, c.level)),
    alloy: Math.floor(3000 * Math.pow(1.4, c.level)),
    data: Math.floor(2000 * Math.pow(1.4, c.level)),
    influence: Math.floor(800 * Math.pow(1.4, c.level))
  };
}

export const COLONY_MAX_LEVEL = 15;

export function upgradeColony(id) {
  const idx = state.colonies.findIndex(c => c.id === id);
  if (idx === -1) return false;
  const colony = state.colonies[idx];
  if (colony.level >= COLONY_MAX_LEVEL) return false;
  const cost = colonyUpgradeCost(colony);
  if (!canAfford(cost)) return false;
  spend(cost);
  setState('colonies', idx, 'level', colony.level + 1);
  setState('colonies', idx, 'stability', clamp(colony.stability + 4, 45, 130));
  log(`${colony.name} auf Stufe ${colony.level + 1}.`);
  return true;
}

export function upgradeAllColonies() {
  let upgraded = 0;
  let didUpgrade = true;
  while (didUpgrade && upgraded < 200) {
    didUpgrade = false;
    for (let idx = 0; idx < state.colonies.length; idx++) {
      const colony = state.colonies[idx];
      if (colony.level >= COLONY_MAX_LEVEL) continue;
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
  if (upgraded > 0) log(`${upgraded} Standort-Upgrades durchgeführt.`);
  return upgraded;
}

export function setColonyFocus(id, focusId) {
  const idx = state.colonies.findIndex(c => c.id === id);
  if (idx === -1) return false;
  if (!FOCI.find(f => f.id === focusId)) return false;
  const colony = state.colonies[idx];
  if (colony.focus === focusId) return true;
  setState('colonies', idx, 'focus', focusId);
  setState('colonies', idx, 'stability', clamp(colony.stability - 2, 30, 130));
  log(`${colony.name}: Fokus ${FOCI.find(f => f.id === focusId)?.name}.`);
  return true;
}

export function cycleColonyFocus(id) {
  const colony = state.colonies.find(c => c.id === id);
  if (!colony) return false;
  const fIdx = FOCI.findIndex(f => f.id === colony.focus);
  return setColonyFocus(id, FOCI[(fIdx + 1) % FOCI.length].id);
}

// ── Freelance ──
export function missionPowerReq(mission) { return mission.power * 0.65; }

export function launchMission(missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return false;
  const b = bonuses();
  if (b.availableExpeditionSlots <= 0) return false;
  const powerReq = missionPowerReq(mission);
  if (b.availableExpeditionPower < powerReq) return false;
  const now = Date.now();
  const duration = Math.max(30e3, (mission.duration * 1000) / b.expeditionSpeed);
  setState('expeditions', [...state.expeditions, {
    id: (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`),
    missionId: mission.id,
    name: mission.name,
    start: now,
    end: now + duration,
    powerUsed: powerReq
  }]);
  // Bonus-Cache aktualisieren, damit Slots/Power sofort stimmen
  setState('cache', 'bonuses', computeBonuses());
  log(`Auftrag gestartet: ${mission.name}.`);
  return true;
}

// ── Kultur / Modi / Protokolle ──
export function setDoctrine(id) {
  if (state.doctrine) return false;
  if (!DOCTRINES.find(d => d.id === id)) return false;
  setState('doctrine', id);
  if (!state.achievements.includes('doctrine')) setState('achievements', [...state.achievements, 'doctrine']);
  log(`Core Values: ${DOCTRINES.find(d => d.id === id)?.name}.`);
  return true;
}

export function setOperationsMode(modeId) {
  const mode = OPERATIONS_MODES.find((entry) => entry.id === modeId);
  if (!mode) return false;
  if (state.operationsMode === modeId) return true;
  setState('operationsMode', modeId);
  log(`Sprint-Modus: ${mode.name}.`);
  return true;
}

export function activateProtocol(protocolId) {
  const protocol = PROTOCOLS.find((entry) => entry.id === protocolId);
  if (!protocol) return { ok: false, reason: 'unknown' };
  const missing = (protocol.prereq || []).find((id) => !hasTech(id));
  if (missing) return { ok: false, reason: 'locked', missing };
  const now = Date.now();
  if (state.activeProtocol && state.activeProtocolEndsAt > now) return { ok: false, reason: 'active' };
  const cooldownUntil = Number(state.protocolCooldowns?.[protocol.id] || 0);
  if (cooldownUntil > now) return { ok: false, reason: 'cooldown', remaining: cooldownUntil - now };
  if (!canAfford(protocol.cost || {})) return { ok: false, reason: 'cost' };
  spend(protocol.cost || {});
  setState('activeProtocol', protocol.id);
  setState('activeProtocolEndsAt', now + protocol.duration * 1000);
  setState('protocolCooldowns', protocol.id, now + protocol.cooldown * 1000);
  setState('stats', 'protocolsUsed', (state.stats.protocolsUsed || 0) + 1);
  log(`Protokoll aktiv: ${protocol.name}.`);
  return { ok: true };
}

// ── Klick ──
export function handleManualClick() {
  const b = bonuses();
  const rates = state.cache.rates || estimateRatesSnapshot();
  const gain = clickValue(b, rates);
  add('scrap', gain);
  setState('stats', 'manualClicks', state.stats.manualClicks + 1);
  return { scrap: gain };
}

// ── Mainframe ──
export function equipChip(chipId) {
  if (!state.ownedChips.includes(chipId)) return false;
  if (state.equippedChips.includes(chipId)) return false;
  if (state.equippedChips.length >= (state.mainframeSlots || 3)) return false;
  setState('equippedChips', [...state.equippedChips, chipId]);
  log(`Chip installiert: ${CHIPS.find(c => c.id === chipId)?.name || chipId}.`);
  return true;
}

export function unequipChip(chipId) {
  if (!state.equippedChips.includes(chipId)) return false;
  setState('equippedChips', state.equippedChips.filter(id => id !== chipId));
  log(`Chip entfernt: ${CHIPS.find(c => c.id === chipId)?.name || chipId}.`);
  return true;
}

// ── Börse ──
export function buyStockAction(stockId, shares) { return doBuyStock(stockId, shares); }
export function sellStockAction(stockId, shares) { return doSellStock(stockId, shares); }
