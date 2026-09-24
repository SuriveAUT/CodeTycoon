import { state, canAfford, hasTech, hasProject, log, isBuildingUnlocked, isTechUnlocked, isProjectUnlocked, calcNextBuildingCost, buildingCount } from '../store/gameState.js';
import { resourceMult, converterInputScale, currentRates, MODIFIER_CAP } from '../store/bonuses.js';
import { BUILDINGS, milestoneMult } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { MISSIONS } from '../data/misc.js';
import { clamp } from '../lib/format.js';
import { nextResearchCost, nextProjectCost, launchMission, missionPowerReq, purchaseBuilding, purchaseTech, purchaseProject } from './actions.js';

// Auto-Hire: kauft in Build-Reihenfolge, Konverter nur wenn ihre Inputs danach noch im Plus bleiben.
export function autoBuild(b) {
  const boost = b.autoBuildBoost || 1;
  const net = { ...currentRates() };
  delete net.__produced; delete net.__consumed; delete net.__utilization; delete net.__starved;

  for (const def of BUILDINGS) {
    const id = def.id;
    if (!isBuildingUnlocked(def)) continue;

    const oldCount = buildingCount(id);
    const newCount = oldCount + 1;
    const bm = b.buildingMults[id] || 1;
    // Effektive Stückzahl-Änderung inkl. Meilenstein (ein Meilenstein verdoppelt alle vorhandenen Einheiten)
    const unitsDelta = newCount * milestoneMult(newCount) - oldCount * milestoneMult(oldCount);

    if (def.type === 'modifier' && oldCount >= MODIFIER_CAP) continue;

    if (def.type === 'converter') {
      let safe = true;
      for (const [res, need] of Object.entries(def.inputs)) {
        const drain = need * converterInputScale(b) * def.rate * unitsDelta * bm;
        if ((net[res] || 0) - drain <= 0) { safe = false; break; }
      }
      if (!safe) continue;
    }

    if (!canAfford(calcNextBuildingCost(def))) continue;
    if (Math.random() >= clamp(0.7 * boost, 0.3, 0.95)) continue;
    if (!purchaseBuilding(id, 1, { quiet: true })) continue;

    if (def.type === 'converter') {
      for (const [res, need] of Object.entries(def.inputs)) net[res] = (net[res] || 0) - need * converterInputScale(b) * def.rate * unitsDelta * bm;
      for (const [res, per] of Object.entries(def.outputs)) net[res] = (net[res] || 0) + per * def.rate * unitsDelta * bm * resourceMult(res, b);
    } else if (def.type === 'producer') {
      for (const [res, per] of Object.entries(def.outputs)) net[res] = (net[res] || 0) + per * def.rate * unitsDelta * bm * resourceMult(res, b);
    }
  }
}

// Auto-Learn: günstigste verfügbare Technologie. Entweder/Oder-Entscheidungen bleiben dem Spieler überlassen.
export function autoResearch(b) {
  let next = null;
  for (const t of TECHS) {
    if (hasTech(t.id) || t.excludes || !isTechUnlocked(t)) continue;
    if (!next || t.cost < next.cost) next = t;
  }
  if (!next || state.resources.research < nextResearchCost(next, b)) return;
  if (purchaseTech(next.id, { quiet: true })) log(`Auto-Learn: ${next.name}.`);
}

export function autoProjects(b) {
  const next = PROJECTS.find(p => !hasProject(p.id) && isProjectUnlocked(p));
  if (!next || !canAfford(nextProjectCost(next, b))) return;
  if (purchaseProject(next.id, { quiet: true })) log(`Auto-Deploy: ${next.name}.`);
}

export function autoExpeditions(b) {
  let attempts = 0;
  while (state.expeditions.length < b.expeditionSlots && attempts < 5) {
    const available = b.expeditionPower - state.expeditions.reduce((acc, m) => acc + (m.powerUsed || 0), 0);
    const mission = [...MISSIONS].sort((a, z) => z.power - a.power).find(m => available >= missionPowerReq(m));
    if (!mission) break;
    const before = state.expeditions.length;
    launchMission(mission.id);
    if (state.expeditions.length === before) break;
    attempts++;
  }
}
