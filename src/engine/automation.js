import { state, setState, canAfford, spend, hasTech, log, getBuilding, isBuildingUnlocked, calcNextBuildingCost, colonyCount } from '../store/gameState.js';
import { resourceMult, converterInputScale } from '../store/bonuses.js';
import { BUILD_ORDER, milestoneMult } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { MISSIONS } from '../data/misc.js';
import { clamp } from '../lib/format.js';
import { nextResearchCost, nextProjectCost, launchMission, missionPowerReq } from './actions.js';

// Auto-Hire: kauft in Build-Reihenfolge, Konverter nur wenn ihre Inputs danach noch im Plus bleiben.
export function autoBuild(b) {
  const boost = b.autoBuildBoost || 1;
  const cached = state.cache.rates || {};
  const net = { ...cached };
  delete net.__produced; delete net.__consumed; delete net.__utilization; delete net.__starved;

  for (const id of BUILD_ORDER) {
    const def = getBuilding(id);
    if (!def || !isBuildingUnlocked(def)) continue;

    const newCount = (state.buildings[id] || 0) + 1;
    const ms = milestoneMult(newCount);
    const bm = b.buildingMults[id] || 1;

    if (def.type === 'converter') {
      let safe = true;
      for (const [res, need] of Object.entries(def.inputs)) {
        const drain = need * converterInputScale(b) * def.rate * ms * bm;
        if ((net[res] || 0) - drain <= 0) { safe = false; break; }
      }
      if (!safe) continue;
    }

    const cost = calcNextBuildingCost(def);
    if (!canAfford(cost)) continue;
    if (Math.random() >= clamp(0.7 * boost, 0.3, 0.95)) continue;

    spend(cost);
    setState('buildings', id, newCount);
    if (def.type === 'converter') {
      for (const [res, need] of Object.entries(def.inputs)) net[res] = (net[res] || 0) - need * converterInputScale(b) * def.rate * ms * bm;
      for (const [res, per] of Object.entries(def.outputs)) net[res] = (net[res] || 0) + per * def.rate * ms * bm * resourceMult(res, b);
    } else if (def.type === 'producer') {
      for (const [res, per] of Object.entries(def.outputs)) net[res] = (net[res] || 0) + per * def.rate * ms * bm * resourceMult(res, b);
    }
  }
}

// Auto-Learn: günstigste verfügbare Technologie.
export function autoResearch(b) {
  const candidates = TECHS.filter(t => !hasTech(t.id) && t.prereq.every(p => hasTech(p)) && !(t.excludes || []).some(id => hasTech(id)));
  if (!candidates.length) return;
  const next = candidates.sort((a, z) => a.cost - z.cost)[0];
  const cost = nextResearchCost(next, b);
  if (state.resources.research >= cost) {
    setState('resources', 'research', state.resources.research - cost);
    setState('techs', [...state.techs, next.id]);
    log(`Auto-Learn: ${next.name}.`);
  }
}

export function autoProjects(b) {
  const next = PROJECTS.find(p => !state.projects.includes(p.id) && p.prereq.every(id => hasTech(id) || state.projects.includes(id)));
  if (!next) return;
  const cost = nextProjectCost(next, b);
  if (canAfford(cost)) {
    spend(cost);
    setState('projects', [...state.projects, next.id]);
    setState('stats', 'projectsBuilt', state.stats.projectsBuilt + 1);
    log(`Auto-Deploy: ${next.name}.`);
  }
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
