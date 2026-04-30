import { state, buildingCount, upgradeLevel, hasTech, colonyCount, getBuilding, totalBuildings } from './gameState.js';
import { BUILDINGS, BUILD_ORDER } from '../data/buildings.js';
import { RESOURCES, WORLDS, FOCI, PROTOCOLS, PRESTIGE_MILESTONES } from '../data/misc.js';
import { BONUS_EFFECTS, PROJECT_EFFECTS, ARTIFACT_EFFECTS, DOCTRINE_EFFECTS } from '../data/effects.js';
import { CHIPS } from '../data/chips.js';
import { clamp } from '../lib/format.js';

function applyEffects(b, effects) {
  if (!effects || typeof effects !== 'object') return;
  const multKeys = new Set([
    'allMult', 'scrapMult', 'energyMult', 'alloyMult', 'componentsMult',
    'dataMult', 'researchMult', 'influenceMult', 'relicMult',
    'buildingCostMult', 'researchCostMult', 'projectCostMult',
    'clickPowerMult', 'expeditionSpeed', 'autoBuildBoost', 'converterInputMult'
  ]);
  const addKeys = new Set([
    'relicChance', 'eventResist', 'expeditionRewardMult', 'perColonyMult',
    'clickRateFraction', 'expeditionPower', 'expeditionSlots', 'colonyCap', 'offlineCapHours'
  ]);
  Object.entries(effects).forEach(([key, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (multKeys.has(key)) {
      b[key] = (Number(b[key]) || 1) * numeric;
      return;
    }
    if (addKeys.has(key)) {
      b[key] = (Number(b[key]) || 0) + numeric;
    }
  });
}

export function computeBonuses() {
  const totalBld = totalBuildings();
  const progMult = 1 + (totalBld / 250); // Slower scaling: +100% every 250 total buildings

  const b = {
    allMult: 2.0 * progMult,
    scrapMult: 1.75,
    energyMult: 1.4,
    alloyMult: 1.3,
    componentsMult: 1.3,
    dataMult: 1.5,
    researchMult: 1.8,
    influenceMult: 1.4,
    relicMult: 1.5,
    relicChance: 0.05,
    expeditionPower: 2, expeditionSlots: 2, colonyCap: 0,
    buildingCostMult: 1 / (1 + totalBld / 600),
    researchCostMult: 1 / (1 + totalBld / 2500),
    projectCostMult: 1 / (1 + totalBld / 1500),
    offlineCapHours: 12, prestigeGainMult: 1, eventResist: 0,
    colonyOutputMult: 1, expeditionRewardMult: 0, autoBuildBoost: 1,
    autoResearch: false, autoExpeditions: false, autoBuild: false,
    doctrineUnlock: false, chronicleGainMult: 1, expeditionSpeed: 1, perColonyMult: 0,
    clickPowerMult: 2.25, clickRateFraction: 0,
    buildingMults: {}, kittenMult: 1,
    converterInputMult: 1,
    offlineEfficiency: 0.5
  };

  if (state.stats.prestigeCount > 0 || hasTech('company_culture')) b.doctrineUnlock = true;

  b.allMult *= 1 + state.achievements.length * 0.01;

  const origin = upgradeLevel('origin'); if (origin) b.allMult *= Math.pow(1.08, origin);
  const deepTime = upgradeLevel('deep_time'); if (deepTime) b.offlineCapHours += deepTime * 1.5;
  const bureau = upgradeLevel('bureau'); if (bureau) b.autoBuildBoost *= Math.pow(1.10, bureau);
  const monument = upgradeLevel('monument'); if (monument) b.allMult *= Math.pow(1.025, monument);
  const logistics = upgradeLevel('logistics'); if (logistics) b.colonyCap += Math.floor(logistics / 2);
  const resonance = upgradeLevel('resonance'); if (resonance) { b.relicMult *= Math.pow(1.08, resonance); b.relicChance += 0.005 * resonance; }
  const funds = upgradeLevel('funds'); if (funds) { b.buildingCostMult *= Math.pow(0.97, funds); b.projectCostMult *= Math.pow(0.97, funds); }
  const epoch = upgradeLevel('epoch'); if (epoch) b.prestigeGainMult *= Math.pow(1.10, epoch);
  const timeDilation = upgradeLevel('time_dilation'); if (timeDilation) b.offlineEfficiency = Math.min(0.8, 0.5 + timeDilation * 0.1);
  const infiniteSynergy = upgradeLevel('infinite_synergy'); if (infiniteSynergy) b.allMult *= Math.pow(1.15, infiniteSynergy);
  const quantumClick = upgradeLevel('quantum_click'); if (quantumClick) b.clickPowerMult *= Math.pow(2, quantumClick);
  const clickMastery = upgradeLevel('click_mastery'); if (clickMastery) b.clickPowerMult *= Math.pow(1.17, clickMastery);
  const sprintVelocity = upgradeLevel('sprint_velocity'); if (sprintVelocity) b.expeditionPower += sprintVelocity * 0.10;
  const prestigeBoost = upgradeLevel('prestige_boost'); if (prestigeBoost) { b.prestigeGainMult *= Math.pow(1.06, prestigeBoost); b.offlineCapHours += prestigeBoost * 0.5; }

  (state.prestigeMilestones || []).forEach(id => {
    const m = PRESTIGE_MILESTONES.find(x => x.id === id);
    if (m?.effects) applyEffects(b, m.effects);
  });

  if (DOCTRINE_EFFECTS[state.doctrine]) DOCTRINE_EFFECTS[state.doctrine](b);
  state.techs.forEach(id => { if (BONUS_EFFECTS[id]) BONUS_EFFECTS[id](b); });
  state.projects.forEach(id => { if (PROJECT_EFFECTS[id]) PROJECT_EFFECTS[id](b); });
  state.artifacts.forEach(id => { if (ARTIFACT_EFFECTS[id]) ARTIFACT_EFFECTS[id](b); });

  // Mainframe Chips – apply effects and tradeoffs
  (state.equippedChips || []).forEach(chipId => {
    const chip = CHIPS.find(c => c.id === chipId);
    if (!chip) return;
    if (chip.effects) applyEffects(b, chip.effects);
    if (chip.tradeoffs) applyEffects(b, chip.tradeoffs);
  });

  switch (state.operationsMode) {
    case 'efficiency':
      b.converterInputMult *= 0.82;
      b.allMult *= 0.94;
      break;
    case 'overdrive':
      b.converterInputMult *= 1.25;
      b.alloyMult *= 1.12;
      b.componentsMult *= 1.12;
      b.dataMult *= 1.08;
      break;
    case 'survey':
      b.dataMult *= 1.18;
      b.researchMult *= 1.18;
      b.scrapMult *= 0.92;
      b.energyMult *= 0.94;
      break;
    default:
      break;
  }

  const archives = buildingCount('scrum_master');
  if (archives) { b.allMult *= 1 + archives * 0.03; b.researchMult *= 1 + archives * 0.04; }
  const terraform = buildingCount('hr_department');
  if (terraform) { b.colonyCap += Math.floor(terraform / 2); b.colonyOutputMult *= 1 + terraform * 0.02; }
  const hubs = buildingCount('freelance_portal');
  if (hubs) { b.expeditionPower += hubs * 0.18; b.expeditionSlots += Math.floor(hubs / 4); b.expeditionRewardMult += hubs * 0.02; }
  const gates = buildingCount('vpn_gateway');
  if (gates) { b.relicChance += gates * 0.01; b.expeditionSlots += Math.floor(gates / 8); }
  const bastions = buildingCount('legal_team');
  if (bastions) { b.eventResist += bastions * 0.01; b.colonyOutputMult *= 1 + bastions * 0.015; }
  const dysons = buildingCount('data_mining');
  if (dysons) { b.energyMult *= 1 + dysons * 0.04; }

  let colonyBonusSum = 0;
  state.colonies.forEach(c => {
    const world = WORLDS.find(w => w.id === c.world) || WORLDS[0];
    const focus = FOCI.find(f => f.id === c.focus) || FOCI[0];
    const stability = clamp(c.stability / 100, 0.5, 1.5);
    const level = Math.min(c.level, 15); // Level cap for balance

    // Base colony contribution (diminishing)
    let contribution = (0.03 * level) * stability;

    const worldAll = (world.bonus.allMult || 1) - 1;
    contribution += worldAll;

    colonyBonusSum += contribution;

    // Focus-specific bonuses (reduced, capped at level 15)
    switch (focus.id) {
      case 'extraction': b.scrapMult += 0.02 * level; b.alloyMult += 0.015 * level; break;
      case 'science': b.dataMult += 0.02 * level; b.researchMult += 0.02 * level; break;
      case 'industry': b.componentsMult += 0.02 * level; b.alloyMult += 0.015 * level; break;
      case 'diplomacy': b.influenceMult += 0.025 * level; b.buildingCostMult *= 1 - Math.min(0.12, 0.003 * level); break;
      case 'relics': b.relicMult += 0.025 * level; b.relicChance += 0.003 * level; break;
      case 'stability': colonyBonusSum += 0.01 * level; b.eventResist += 0.005 * level; break;
    }

    if (world.bonus.scrapMult) b.scrapMult += (world.bonus.scrapMult - 1);
    if (world.bonus.energyMult) b.energyMult += (world.bonus.energyMult - 1);
    if (world.bonus.alloyMult) b.alloyMult += (world.bonus.alloyMult - 1);
    if (world.bonus.componentsMult) b.componentsMult += (world.bonus.componentsMult - 1);
    if (world.bonus.dataMult) b.dataMult += (world.bonus.dataMult - 1);
    if (world.bonus.researchMult) b.researchMult += (world.bonus.researchMult - 1);
    if (world.bonus.influenceMult) b.influenceMult += (world.bonus.influenceMult - 1);
    if (world.bonus.relicMult) b.relicMult += (world.bonus.relicMult - 1);
    if (world.bonus.relicChance) b.relicChance += world.bonus.relicChance;
    if (world.bonus.expeditionPower) b.expeditionPower += world.bonus.expeditionPower;
  });

  b.allMult *= (1 + colonyBonusSum);

  if (state.event && state.event.effects) {
    applyEffects(b, state.event.effects);
  }
  const protocolActive = state.activeProtocol && state.activeProtocolEndsAt > Date.now();
  if (protocolActive) {
    const protocol = PROTOCOLS.find((entry) => entry.id === state.activeProtocol);
    if (protocol?.effects) applyEffects(b, protocol.effects);
  }

  b.allMult *= b.colonyOutputMult;
  b.expeditionPower += colonyCount() * 0.1;

  b.expeditionSlots = Math.max(1, Math.floor(b.expeditionSlots));
  b.colonyCap = Math.max(0, Math.floor(b.colonyCap));
  b.offlineCapHours = Math.max(4, b.offlineCapHours);
  b.converterInputMult = Math.max(0.1, Number(b.converterInputMult || 1));

  const fLvl = state.stats.fleetLevel || 0;
  b.expeditionSpeed *= 1 + (fLvl * 0.05);
  b.expeditionRewardMult += fLvl * 0.02;

  b.allMult *= b.kittenMult;

  // Active missions consumption
  b.totalExpeditionPower = b.expeditionPower;
  b.usedExpeditionPower = 0;
  state.expeditions.forEach(m => {
    const mission = state.cache.missionsData?.find(x => x.id === m.missionId);
    b.usedExpeditionPower += (m.powerUsed || 0);
  });
  b.availableExpeditionPower = Math.max(0, b.totalExpeditionPower - b.usedExpeditionPower);
  b.usedExpeditionSlots = state.expeditions.length;
  b.availableExpeditionSlots = Math.max(0, b.expeditionSlots - b.usedExpeditionSlots);

  return b;
}

export function resourceMult(resource, b) {
  const map = {
    scrap: b.scrapMult, energy: b.energyMult, alloy: b.alloyMult,
    components: b.componentsMult, data: b.dataMult, research: b.researchMult,
    influence: b.influenceMult, relics: b.relicMult
  };
  return (map[resource] || 1) * b.allMult;
}

export function estimateRatesSnapshot() {
  const tempResources = JSON.parse(JSON.stringify(state.resources));
  const b = computeBonuses();
  const converterThrottle = Math.min(1, Math.max(0.25, Number(state.converterThrottle || 1)));
  const converterInputMult = Math.max(0.1, Number(b.converterInputMult || 1));
  const rates = RESOURCES.reduce((o, r) => (o[r] = 0, o), {});
  const produced = RESOURCES.reduce((o, r) => (o[r] = 0, o), {});
  const consumed = RESOURCES.reduce((o, r) => (o[r] = 0, o), {});
  const order = BUILD_ORDER.map(id => getBuilding(id)).filter(Boolean);
  for (const def of order) {
    const count = buildingCount(def.id);
    if (!count) continue;
    const milestone = 1 + Math.floor(count / 10) * 0.15; // +15% every 10 of THIS building
    const bMult = b.buildingMults[def.id] || 1;

    // We process producers in first pass, then converters in second.
    // However, to keep it simple and respect the BUILD_ORDER (which is mostly correct),
    // we let producers fill a 'per second budget' first.
    if (def.type === 'producer') {
      for (const [res, per] of Object.entries(def.outputs)) {
        const gain = count * def.rate * milestone * bMult * per * resourceMult(res, b);
        produced[res] += gain;
        rates[res] += gain;
        tempResources[res] = (tempResources[res] || 0) + gain;
      }
    }
  }

  // Second Pass: Converters
  for (const def of order) {
    const count = buildingCount(def.id);
    if (!count || def.type !== 'converter') continue;
    const milestone = 1 + Math.floor(count / 10) * 0.15;
    const bMult = b.buildingMults[def.id] || 1;

    let possible = count * def.rate * milestone * bMult * converterThrottle;
    for (const [res, need] of Object.entries(def.inputs)) {
      // Small epsilon to handle floating point issues near zero stock
      const available = (tempResources[res] || 0) + 1e-10;
      if (available <= 0) { possible = 0; break; }
      const scaledNeed = need * resourceMult(res, b);
      possible = Math.min(possible, available / ((scaledNeed || 1) * converterInputMult));
    }

    if (possible > 0) {
      for (const [res, need] of Object.entries(def.inputs)) {
        const scaledNeed = need * resourceMult(res, b);
        const consumption = scaledNeed * possible * converterInputMult;
        consumed[res] += consumption;
        tempResources[res] = Math.max(0, (tempResources[res] || 0) - consumption);
        rates[res] -= consumption;
      }
      for (const [res, per] of Object.entries(def.outputs)) {
        const gain = possible * per * resourceMult(res, b) * (res === 'relics' ? (1 + b.relicChance * 0.1) : 1);
        produced[res] += gain;
        rates[res] += gain;
        tempResources[res] = (tempResources[res] || 0) + gain;
      }
    }
  }
  let hadNegative = false;
  const deficits = [];
  RESOURCES.forEach((res) => {
    if ((rates[res] || 0) < 0) {
      hadNegative = true;
      const prod = produced[res] || 0;
      const cons = consumed[res] || 0;
      deficits.push({
        resource: res,
        produced: prod,
        consumed: cons,
        ratio: cons / Math.max(prod, 0.0001),
        deficit: cons - prod
      });
      rates[res] = 0;
    }
  });
  deficits.sort((a, b) => b.ratio - a.ratio);
  rates.__hadNegative = hadNegative;
  rates.__deficits = deficits;
  rates.__produced = produced;
  rates.__consumed = consumed;
  return rates;
}
