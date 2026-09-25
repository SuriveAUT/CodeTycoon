import {
  state, setState, canAfford, spend, add, log, hasTech, hasProject, buildingCount, getBuilding,
  calcBuildingCost, calcNextBuildingCost, maxAffordable, isBuildingUnlocked, upgradeLevel, colonyCount,
  techCount, projectCount, getTech, getProject, isTechUnlocked, isProjectUnlocked, defaultState
} from '../store/gameState.js';
import { computeBonuses, currentBonuses, currentRates, clickValue, chronicleCostFor } from '../store/bonuses.js';
import { MISSIONS, WORLDS, FOCI, DOCTRINES, CHRONICLE_UPGRADES, OPERATIONS_MODES, PROTOCOLS, COLONY_MAX_LEVEL } from '../data/misc.js';
import { getChip } from '../data/chips.js';
import { clamp } from '../lib/format.js';
import { checkAchievements } from './events.js';
import { milestoneMult } from '../data/buildings.js';
import { emitToast } from '../lib/toast.js';

export { COLONY_MAX_LEVEL };

const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function nextResearchCost(tech, b = currentBonuses()) { return Math.ceil(tech.cost * b.researchCostMult); }
export function nextProjectCost(project, b = currentBonuses()) {
  const out = {};
  Object.entries(project.cost).forEach(([res, amt]) => out[res] = Math.ceil(amt * b.projectCostMult));
  return out;
}

// Kauft bis zu `qty` Stück ('max' = so viele wie leistbar). quiet unterdrückt Kauf-Log und Meilenstein-Hinweis
// (Automation, auch im stillen Offline-Catchup). Gibt die Anzahl gekaufter Einheiten zurück.
export function purchaseBuilding(id, qty = 1, { quiet = false } = {}) {
  const def = getBuilding(id);
  if (!def || !isBuildingUnlocked(def)) return 0;
  const wanted = qty === 'max' ? maxAffordable(def) : Number(qty) || 1;
  const before = buildingCount(id);
  let bought = 0;
  for (let i = 0; i < wanted; i++) {
    const cost = calcNextBuildingCost(def);
    if (!canAfford(cost)) break;
    spend(cost);
    setState('buildings', id, buildingCount(id) + 1);
    bought += 1;
  }
  if (bought) setState('stats', 'hiresTotal', (state.stats.hiresTotal || 0) + bought);
  if (bought && !quiet) {
    log(`${def.name}: +${bought}.`);
    const after = buildingCount(id);
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

export function purchaseTech(id, { quiet = false } = {}) {
  const tech = getTech(id);
  if (!tech || hasTech(id) || !isTechUnlocked(tech)) return false;
  const cost = nextResearchCost(tech);
  if (state.resources.research < cost) return false;
  setState('resources', 'research', state.resources.research - cost);
  setState('techs', [...state.techs, id]);
  setState('stats', 'techsLearned', (state.stats.techsLearned || 0) + 1);
  if (!quiet) log(`Gelernt: ${tech.name}.`);
  return true;
}

export function purchaseProject(id, { quiet = false } = {}) {
  const proj = getProject(id);
  if (!proj || hasProject(id) || !isProjectUnlocked(proj)) return false;
  const cost = nextProjectCost(proj);
  if (!canAfford(cost)) return false;
  spend(cost);
  setState('projects', [...state.projects, id]);
  setState('stats', 'projectsBuilt', state.stats.projectsBuilt + 1);
  if (!quiet) log(`Release: ${proj.name}.`);
  return true;
}

// ── Prestige ──
export function runScrap(s = state) {
  return Math.max(0, (s.stats.total.scrap || 0) - (s.stats.totalAtLastPrestige?.scrap || 0));
}

export const PRESTIGE_XP_BASE = 6;      // XP = BASE · ∛(Run-Code / PRESTIGE_XP_SCALE)
export const PRESTIGE_XP_SCALE = 1e7;

// Strukturbonus: Techs, Releases und Standorte des Runs erhöhen die XP
export function prestigeStructBonus(s = state) {
  return 1 + techCount(s) * 0.02 + projectCount(s) * 0.05 + colonyCount(s) * 0.03;
}

export function prestigeGainRaw(s = state, b = currentBonuses(s)) {
  const base = PRESTIGE_XP_BASE * Math.cbrt(runScrap(s) / PRESTIGE_XP_SCALE);
  return base * prestigeStructBonus(s) * (b.prestigeGainMult || 1);
}

export function prestigeGain(s = state) {
  return Math.max(0, Math.floor(prestigeGainRaw(s)));
}

// Wie viel Code fehlt bis zum nächsten vollen XP-Punkt?
export function scrapForNextXp(s = state) {
  const mult = prestigeStructBonus(s) * (currentBonuses(s).prestigeGainMult || 1);
  const nextXp = prestigeGain(s) + 1;
  const needed = Math.pow(nextXp / (PRESTIGE_XP_BASE * mult), 3) * PRESTIGE_XP_SCALE;
  return Math.max(0, needed - runScrap(s));
}

// Alles, was ein Hard Refactor zurücksetzt. Alle anderen Top-Level-Keys (Funde, Chips, Chronicle,
// Aufgaben, Depot, Statistiken, Einstellungen, Log …) bleiben unverändert erhalten.
const RUN_KEYS = [
  'resources', 'buildings', 'techs', 'projects', 'colonies', 'expeditions', 'doctrine',
  'operationsMode', 'activeProtocol', 'activeProtocolEndsAt', 'protocolCooldowns', 'converterThrottle',
  'event', 'eventEnds', 'nextEventAt', 'lastEventAt', 'asteroidActive', 'nextAsteroidAt',
  'cyberEvent', 'nextCyberEventAt', 'decision', 'nextDecisionAt'
];

// allowZero: Sprint-Start setzt auch ohne XP-Gewinn zurück. Ein laufender Sprint endet dabei ohne Belohnung.
export function doPrestigeReset({ allowZero = false } = {}) {
  const gain = prestigeGain();
  if (gain <= 0 && !allowZero) return false;
  const prestigeCount = state.stats.prestigeCount + 1;

  const fresh = defaultState();
  for (const key of RUN_KEYS) setState(key, fresh[key]);
  setState('chronicle', state.chronicle + gain);
  setState('stats', 'prestigeCount', prestigeCount);
  setState('stats', 'totalAtLastPrestige', { ...state.stats.total });
  setState('stats', 'runStartedAt', Date.now());
  setState('challenge', null);
  setState('cache', { bonuses: null, rates: {} });

  // Startkapital via Seed Funding
  const mon = upgradeLevel('monument');
  setState('resources', 'scrap', 50 + mon * 100);
  setState('resources', 'energy', 20 + mon * 40);
  setState('buildings', 'intern', 1 + mon * 2);
  setState('buildings', 'google_ads', 1 + mon);

  log(`🔁 Hard Refactor #${prestigeCount}: +${gain} XP.`);
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
  return colonyCount() < currentBonuses().colonyCap && canAfford(colonyFoundCost());
}

export function foundColony() {
  if (colonyCount() >= currentBonuses().colonyCap) return false;
  const cost = colonyFoundCost();
  if (!canAfford(cost)) return false;
  spend(cost);
  const world = WORLDS[colonyCount() % WORLDS.length];
  const colony = {
    id: newId(),
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

export function upgradeColony(id, { quiet = false } = {}) {
  const idx = state.colonies.findIndex(c => c.id === id);
  if (idx === -1) return false;
  const colony = state.colonies[idx];
  if (colony.level >= COLONY_MAX_LEVEL) return false;
  const cost = colonyUpgradeCost(colony);
  if (!canAfford(cost)) return false;
  spend(cost);
  setState('colonies', idx, 'level', colony.level + 1);
  setState('colonies', idx, 'stability', clamp(colony.stability + 4, 45, 130));
  if (!quiet) log(`${colony.name} auf Stufe ${colony.level + 1}.`);
  return true;
}

export function upgradeAllColonies() {
  let upgraded = 0;
  let progress = true;
  while (progress && upgraded < 200) {
    progress = false;
    for (const colony of state.colonies) {
      if (upgradeColony(colony.id, { quiet: true })) { upgraded++; progress = true; }
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

// ── Freelance ──
export function missionPowerReq(mission) { return mission.power * 0.65; }

export function launchMission(missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return false;
  const b = currentBonuses();
  if (b.availableExpeditionSlots <= 0) return false;
  const powerReq = missionPowerReq(mission);
  if (b.availableExpeditionPower < powerReq) return false;
  const now = Date.now();
  const duration = Math.max(30e3, (mission.duration * 1000) / b.expeditionSpeed);
  setState('expeditions', [...state.expeditions, {
    id: newId(),
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
  const gain = clickValue(currentBonuses(), currentRates());
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
  log(`Chip installiert: ${getChip(chipId)?.name || chipId}.`);
  return true;
}

export function unequipChip(chipId) {
  if (!state.equippedChips.includes(chipId)) return false;
  setState('equippedChips', state.equippedChips.filter(id => id !== chipId));
  log(`Chip entfernt: ${getChip(chipId)?.name || chipId}.`);
  return true;
}
