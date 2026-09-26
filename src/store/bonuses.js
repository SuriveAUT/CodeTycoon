// bonuses.js – Bonus-Berechnung und Produktionsmodell.
//
// Alle Funktionen nehmen optional ein State-Objekt `s` entgegen, damit dieselbe Logik
// headless (Balancing-Simulation) und im Spiel läuft.

import { state, buildingCount, totalBuildings, upgradeLevel } from './gameState.js';
import { BUILDINGS, milestoneMult } from '../data/buildings.js';
import { RESOURCES, WORLDS, FOCI, PROTOCOLS, PRESTIGE_MILESTONES, COLONY_MAX_LEVEL, zeroResources } from '../data/misc.js';
export { chronicleCostFor } from '../data/misc.js';
import { BONUS_EFFECTS, PROJECT_EFFECTS, ARTIFACT_EFFECTS, DOCTRINE_EFFECTS } from '../data/effects.js';
import { CHIPS } from '../data/chips.js';
import { STOCKS, dividendBonusForShares } from '../data/stocks.js';
import { getChallenge } from '../data/challenges.js';
import { clamp } from '../lib/format.js';

export const MAX_COLONIES = 8;
export const MODIFIER_CAP = 20;
// Ab welcher Auslastung ein Konverter als "gedrosselt" gilt
export const STARVED_UTILIZATION = 0.999;
export const RES_MULT_KEY = {
  scrap: 'scrapMult', energy: 'energyMult', alloy: 'alloyMult', components: 'componentsMult',
  data: 'dataMult', research: 'researchMult', influence: 'influenceMult', relics: 'relicMult'
};

const MULT_KEYS = new Set([
  'allMult', 'scrapMult', 'energyMult', 'alloyMult', 'componentsMult',
  'dataMult', 'researchMult', 'influenceMult', 'relicMult',
  'buildingCostMult', 'researchCostMult', 'projectCostMult',
  'clickPowerMult', 'expeditionSpeed', 'autoBuildBoost', 'converterInputMult', 'prestigeGainMult'
]);
const ADD_KEYS = new Set([
  'relicChance', 'eventResist', 'expeditionRewardMult', 'perColonyMult',
  'clickRateFraction', 'expeditionPower', 'expeditionSlots', 'colonyCap', 'offlineCapHours'
]);

// Statische Tabellen einmal vorbereiten (heißer Pfad: simulateProduction pro Frame)
const OUTPUT_ENTRIES = new Map(BUILDINGS.map(d => [d.id, Object.entries(d.outputs || {})]));
const INPUT_ENTRIES = new Map(BUILDINGS.map(d => [d.id, Object.entries(d.inputs || {})]));

export function applyEffects(b, effects) {
  if (!effects || typeof effects !== 'object') return;
  Object.entries(effects).forEach(([key, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (MULT_KEYS.has(key)) b[key] = (Number(b[key]) || 1) * numeric;
    else if (ADD_KEYS.has(key)) b[key] = (Number(b[key]) || 0) + numeric;
  });
}

// Basisbeitrag eines Standorts zur Gesamtproduktion (Anteil), abhängig von Stufe und Zufriedenheit.
export function colonyBaseBonus(c) {
  const lvl = Math.min(c.level || 1, COLONY_MAX_LEVEL);
  return 0.02 * lvl * clamp((c.stability || 100) / 100, 0.5, 1.3);
}

export function computeBonuses(s = state) {
  const totalBld = totalBuildings(s);
  // Sprints: laufendes Handicap und permanente Belohnungen
  const challenge = s.challenge ? getChallenge(s.challenge) : null;
  const doneChallenges = (s.challengesDone || []).map(getChallenge).filter(Boolean);
  let synergyMult = 1;
  doneChallenges.forEach(c => { if (c.reward.synergyMult) synergyMult *= c.reward.synergyMult; });
  // Team-Synergie: +0,2% pro Mitarbeiter (max +200%)
  const synergy = challenge?.mods.noSynergy ? 1 : 1 + Math.min(totalBld, 1000) * 0.002 * synergyMult;
  const b = {
    allMult: synergy,
    teamSynergy: synergy,
    scrapMult: 1, energyMult: 1, alloyMult: 1, componentsMult: 1,
    dataMult: 1, researchMult: 1, influenceMult: 1, relicMult: 1,
    relicChance: 0.03,
    expeditionPower: 2, expeditionSlots: 2, colonyCap: 0,
    buildingCostMult: 1, researchCostMult: 1, projectCostMult: 1,
    offlineCapHours: 8, offlineEfficiency: 0.5,
    prestigeGainMult: 1, eventResist: 0,
    colonyOutputMult: 1, expeditionRewardMult: 0, autoBuildBoost: 1,
    autoResearch: false, autoExpeditions: false, autoBuild: false, autoProjects: false,
    doctrineUnlock: false, expeditionSpeed: 1, perColonyMult: 0,
    clickPowerMult: 1, clickRateFraction: 0.01,
    buildingMults: {}, converterInputMult: 1
  };

  if ((s.stats?.prestigeCount || 0) > 0) b.doctrineUnlock = true;

  // Errungenschaften: +1% pro Stück
  b.allMult *= 1 + (s.achievements?.length || 0) * 0.01;

  // Chronicle-Upgrades (permanent)
  const level = (id) => upgradeLevel(id, s);
  const origin = level('origin'); if (origin) b.allMult *= Math.pow(1.08, origin);
  const monument = level('monument'); if (monument) b.allMult *= Math.pow(1.025, monument);
  const deepTime = level('deep_time'); if (deepTime) b.offlineCapHours += deepTime * 1.5;
  const bureau = level('bureau'); if (bureau) b.autoBuildBoost *= Math.pow(1.10, bureau);
  const logistics = level('logistics'); if (logistics) b.colonyCap += Math.floor(logistics / 2);
  const resonance = level('resonance'); if (resonance) { b.relicMult *= Math.pow(1.08, resonance); b.relicChance += 0.005 * resonance; }
  const funds = level('funds'); if (funds) { b.buildingCostMult *= Math.pow(0.97, funds); b.projectCostMult *= Math.pow(0.97, funds); }
  const epoch = level('epoch'); if (epoch) b.prestigeGainMult *= Math.pow(1.10, epoch);
  const timeDilation = level('time_dilation'); if (timeDilation) b.offlineEfficiency = Math.min(0.9, 0.5 + timeDilation * 0.1);
  const infiniteSynergy = level('infinite_synergy'); if (infiniteSynergy) b.allMult *= Math.pow(1.15, infiniteSynergy);
  const quantumClick = level('quantum_click'); if (quantumClick) b.clickRateFraction += 0.005 * Math.min(quantumClick, 10);

  (s.prestigeMilestones || []).forEach(id => {
    const m = PRESTIGE_MILESTONES.find(x => x.id === id);
    if (m?.effects) applyEffects(b, m.effects);
  });

  if (DOCTRINE_EFFECTS[s.doctrine]) DOCTRINE_EFFECTS[s.doctrine](b);
  (s.techs || []).forEach(id => { if (BONUS_EFFECTS[id]) BONUS_EFFECTS[id](b); });
  (s.projects || []).forEach(id => { if (PROJECT_EFFECTS[id]) PROJECT_EFFECTS[id](b); });
  (s.artifacts || []).forEach(id => { if (ARTIFACT_EFFECTS[id]) ARTIFACT_EFFECTS[id](b); });

  (s.equippedChips || []).forEach(chipId => {
    const chip = CHIPS.find(c => c.id === chipId);
    if (!chip) return;
    applyEffects(b, chip.effects);
    applyEffects(b, chip.tradeoffs);
  });

  // Börse: Dividenden als Produktionsbonus je Ressource
  STOCKS.forEach(st => {
    const bonus = dividendBonusForShares((s.stocks || {})[st.id] || 0);
    if (bonus > 0) b[RES_MULT_KEY[st.resource]] *= 1 + bonus;
  });

  switch (s.operationsMode) {
    case 'efficiency': b.converterInputMult *= 0.82; b.allMult *= 0.94; break;
    case 'overdrive': b.converterInputMult *= 1.25; b.alloyMult *= 1.12; b.componentsMult *= 1.12; b.dataMult *= 1.12; break;
    case 'survey': b.dataMult *= 1.18; b.researchMult *= 1.18; b.scrapMult *= 0.92; b.energyMult *= 0.94; break;
    default: break;
  }

  // Modifier-Gebäude (Effekt wirkt bis MODIFIER_CAP Stück)
  const mod = (id) => Math.min(MODIFIER_CAP, buildingCount(id, s));
  const scrum = mod('scrum_master'); if (scrum) { b.allMult *= 1 + scrum * 0.03; b.researchMult *= 1 + scrum * 0.04; }
  const hr = mod('hr_department'); if (hr) { b.colonyCap += Math.floor(hr / 2); b.colonyOutputMult *= 1 + hr * 0.02; }
  const hubs = mod('freelance_portal'); if (hubs) { b.expeditionPower += hubs * 0.18; b.expeditionSlots += Math.floor(hubs / 4); b.expeditionRewardMult += hubs * 0.02; }
  const gates = mod('vpn_gateway'); if (gates) { b.relicChance += gates * 0.01; b.expeditionSlots += Math.floor(gates / 8); }
  const legal = mod('legal_team'); if (legal) { b.eventResist += legal * 0.01; b.colonyOutputMult *= 1 + legal * 0.015; }

  // Standorte
  let colonyBonusSum = 0;
  (s.colonies || []).forEach(c => {
    const world = WORLDS.find(w => w.id === c.world) || WORLDS[0];
    const focus = FOCI.find(f => f.id === c.focus) || FOCI[0];
    const lvl = Math.min(c.level || 1, COLONY_MAX_LEVEL);
    colonyBonusSum += colonyBaseBonus(c) + ((world.bonus.allMult || 1) - 1) + b.perColonyMult;
    switch (focus.id) {
      case 'extraction': b.scrapMult += 0.02 * lvl; b.alloyMult += 0.015 * lvl; break;
      case 'science': b.dataMult += 0.02 * lvl; b.researchMult += 0.02 * lvl; break;
      case 'industry': b.componentsMult += 0.02 * lvl; b.alloyMult += 0.015 * lvl; break;
      case 'diplomacy': b.influenceMult += 0.025 * lvl; b.buildingCostMult *= 1 - Math.min(0.12, 0.003 * lvl); break;
      case 'relics': b.relicMult += 0.025 * lvl; b.relicChance += 0.003 * lvl; break;
      case 'stability': colonyBonusSum += 0.01 * lvl; b.eventResist += 0.005 * lvl; break;
    }
    Object.entries(world.bonus).forEach(([key, value]) => {
      if (key === 'allMult') return;
      if (MULT_KEYS.has(key) && key !== 'buildingCostMult' && key !== 'converterInputMult') b[key] += value - 1;
      else applyEffects(b, { [key]: value });
    });
  });
  // Standort-Output (HR, Legal Team, Releases …) verstärkt nur den Standort-Bonus, nicht die ganze Produktion
  b.allMult *= 1 + colonyBonusSum * b.colonyOutputMult;

  // Sprints: Belohnungen abgeschlossener Sprints (permanent), Handicap des laufenden
  doneChallenges.forEach(c => applyEffects(b, c.reward));
  if (challenge) {
    applyEffects(b, challenge.mods);
    if (challenge.mods.noAuto) { b.autoBuild = b.autoResearch = b.autoExpeditions = b.autoProjects = false; b.challengeNoAuto = true; }
  }

  // Temporäre Effekte
  const now = Date.now();
  if (s.event?.effects) applyEffects(b, s.event.effects);
  if (s.boost?.effects && (s.boost.endsAt || 0) > now) applyEffects(b, s.boost.effects);
  if (s.activeProtocol && (s.activeProtocolEndsAt || 0) > now) {
    const protocol = PROTOCOLS.find(p => p.id === s.activeProtocol);
    if (protocol?.effects) applyEffects(b, protocol.effects);
  }

  // Freelance
  const fLvl = s.stats?.fleetLevel || 0;
  b.expeditionPower += (s.colonies?.length || 0) * 0.1;
  b.expeditionSpeed *= 1 + fLvl * 0.05;
  b.expeditionRewardMult += fLvl * 0.02;
  b.expeditionSlots = Math.max(1, Math.floor(b.expeditionSlots));
  b.usedExpeditionPower = (s.expeditions || []).reduce((acc, m) => acc + (m.powerUsed || 0), 0);
  b.totalExpeditionPower = b.expeditionPower;
  b.availableExpeditionPower = Math.max(0, b.expeditionPower - b.usedExpeditionPower);
  b.usedExpeditionSlots = (s.expeditions || []).length;
  b.availableExpeditionSlots = Math.max(0, b.expeditionSlots - b.usedExpeditionSlots);

  b.colonyCap = Math.min(MAX_COLONIES, Math.max(0, Math.floor(b.colonyCap)));
  b.offlineCapHours = Math.max(4, b.offlineCapHours);
  b.converterInputMult = Math.max(0.1, Number(b.converterInputMult || 1));
  return b;
}

export function resourceMult(resource, b) {
  return (b[RES_MULT_KEY[resource]] || 1) * b.allMult;
}

// Konverter laufen mit dem Gesamtbonus schneller: sie verbrauchen und produzieren ×allMult.
// Dadurch vervielfacht sich der Gesamtbonus nicht entlang der Konverter-Kette.
export function converterInputScale(b) { return b.converterInputMult * b.allMult; }

// Output pro Sekunde eines einzelnen Gebäudes (ohne Input-Limit).
export function buildingOutputPerSecond(def, s, b) {
  const ms = milestoneMult(buildingCount(def.id, s));
  const bm = b.buildingMults[def.id] || 1;
  const out = {};
  for (const [res, per] of OUTPUT_ENTRIES.get(def.id)) out[res] = def.rate * ms * bm * per * resourceMult(res, b);
  return out;
}

export function buildingInputPerSecond(def, s, b) {
  const ms = milestoneMult(buildingCount(def.id, s));
  const bm = b.buildingMults[def.id] || 1;
  const inp = {};
  for (const [res, need] of INPUT_ENTRIES.get(def.id)) inp[res] = def.rate * ms * bm * need * converterInputScale(b);
  return inp;
}

/**
 * Simuliert die Produktion für `dt` Sekunden ohne den State zu verändern.
 * Producer produzieren immer. Converter verbrauchen echten Vorrat (plus das, was in
 * diesem Schritt bereits produziert wurde) und laufen bei Mangel anteilig.
 */
export function simulateProduction(dt, s = state, b = computeBonuses(s)) {
  const stock = s.resources || {};
  const gain = zeroResources();
  const produced = zeroResources();
  const consumed = zeroResources();
  const utilization = {};
  const throttle = clamp(Number(s.converterThrottle ?? 1), 0.25, 1);
  const inScale = converterInputScale(b);
  const mult = {};
  for (const res of RESOURCES) mult[res] = resourceMult(res, b);

  for (const def of BUILDINGS) {
    const owned = buildingCount(def.id, s);
    if (!owned || def.type !== 'producer') continue;
    const unitRate = owned * def.rate * milestoneMult(owned) * (b.buildingMults[def.id] || 1) * dt;
    for (const [res, per] of OUTPUT_ENTRIES.get(def.id)) {
      const g = unitRate * per * mult[res];
      gain[res] += g; produced[res] += g;
    }
  }

  for (const def of BUILDINGS) {
    const owned = buildingCount(def.id, s);
    if (!owned || def.type !== 'converter') continue;
    const inputs = INPUT_ENTRIES.get(def.id);
    const capacity = owned * def.rate * milestoneMult(owned) * (b.buildingMults[def.id] || 1) * throttle * dt; // Output-Einheiten in diesem Schritt
    let possible = capacity;
    for (const [res, need] of inputs) {
      const needPerUnit = need * inScale;
      const available = Math.max(0, (stock[res] || 0) + gain[res]);
      possible = Math.min(possible, needPerUnit > 0 ? available / needPerUnit : possible);
    }
    possible = Math.max(0, possible);
    utilization[def.id] = capacity > 0 ? possible / capacity : 1;
    if (possible <= 0) continue;
    for (const [res, need] of inputs) {
      const c = need * inScale * possible;
      gain[res] -= c; consumed[res] += c;
    }
    for (const [res, per] of OUTPUT_ENTRIES.get(def.id)) {
      const g = possible * per * mult[res];
      gain[res] += g; produced[res] += g;
    }
  }

  return { gain, produced, consumed, utilization };
}

// Raten-Cache (pro Sekunde) aus einem Simulationsschritt der Länge `dt` ableiten.
export function ratesFromSimulation(sim, dt = 1) {
  const rates = {};
  const produced = {};
  const consumed = {};
  for (const res of RESOURCES) {
    rates[res] = (sim.gain[res] || 0) / dt;
    produced[res] = (sim.produced[res] || 0) / dt;
    consumed[res] = (sim.consumed[res] || 0) / dt;
  }
  rates.__produced = produced;
  rates.__consumed = consumed;
  rates.__utilization = sim.utilization;
  rates.__starved = Object.entries(sim.utilization).filter(([, u]) => u < STARVED_UTILIZATION).map(([id]) => id);
  return rates;
}

// Netto-Raten pro Sekunde (für Anzeige, Automation und Klick-Bonus).
export function estimateRatesSnapshot(s = state, b = computeBonuses(s)) {
  return ratesFromSimulation(simulateProduction(1, s, b), 1);
}

// Gecachte Boni/Raten, falls vorhanden – sonst frisch berechnen.
export function currentBonuses(s = state) { return s.cache?.bonuses || computeBonuses(s); }
export function currentRates(s = state) {
  const cached = s.cache?.rates;
  return cached && cached.__produced ? cached : estimateRatesSnapshot(s);
}

export function clickValue(b, rates) {
  const gross = Math.max(0, Number(rates?.__produced?.scrap || 0));
  return 1 * b.clickPowerMult + gross * b.clickRateFraction;
}

