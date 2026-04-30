import { state, setState, canAfford, spend, hasTech, log, getBuilding, isBuildingUnlocked, calcNextBuildingCost, colonyCount } from '../store/gameState.js';
import { computeBonuses, resourceMult } from '../store/bonuses.js';
import { BUILD_ORDER } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { MISSIONS } from '../data/misc.js';
import { clamp } from '../lib/format.js';
import { nextCostWithMultipliers, nextResearchCost, nextProjectCost, launchMission } from './actions.js';

export function autoBuild(b) {
  const boost = b.autoBuildBoost || 1;
  // Shallow copy — updated locally as buildings are purchased this tick so
  // subsequent checks within the same loop see the adjusted net rates.
  const rates = { ...(state.cache.rates || {}) };

  for (const id of BUILD_ORDER) {
    const def = getBuilding(id);
    if (!def || !isBuildingUnlocked(def)) continue;

    // Safety check: don't buy a converter if any input resource would go negative.
    if (def.type === 'converter') {
      let safe = true;
      const newCount = (state.buildings[id] || 0) + 1;
      // Use the same milestone formula as estimateRatesSnapshot
      const milestone = 1 + Math.floor(newCount / 10) * 0.15;
      const bMult = b.buildingMults[id] || 1;

      for (const [res, need] of Object.entries(def.inputs)) {
        const drain = need * def.rate * milestone * bMult * resourceMult(res, b);
        // Require the net rate to stay strictly positive after purchase
        if ((rates[res] || 0) - drain <= 0) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;
    }

    const cost = nextCostWithMultipliers(def, b);
    if (canAfford(cost) && Math.random() < clamp(0.7 * boost, 0.3, 0.95)) {
      spend(cost);
      setState('buildings', id, (state.buildings[id] || 0) + 1);

      // Update local rates so the next building check this tick sees the effect.
      const count = state.buildings[id];
      const milestone = 1 + Math.floor(count / 10) * 0.15;
      const bMult = b.buildingMults[id] || 1;
      if (def.type === 'converter') {
        for (const [res, need] of Object.entries(def.inputs)) {
          rates[res] = (rates[res] || 0) - need * def.rate * milestone * bMult * resourceMult(res, b);
        }
        for (const [res, per] of Object.entries(def.outputs)) {
          rates[res] = (rates[res] || 0) + per * def.rate * milestone * bMult * resourceMult(res, b);
        }
      } else if (def.type === 'producer') {
        for (const [res, per] of Object.entries(def.outputs)) {
          rates[res] = (rates[res] || 0) + per * def.rate * milestone * bMult * resourceMult(res, b);
        }
      }
    }
  }
}

export function autoResearch(b) {
  const next = TECHS.find(t => !hasTech(t.id) && t.prereq.every(p => hasTech(p)));
  if (!next) return;
  const cost = nextResearchCost(next, b);
  if (state.resources.research >= cost) {
    setState('resources', 'research', state.resources.research - cost);
    setState('techs', [...state.techs, next.id]);
    log(`Forschung abgeschlossen: ${next.name}.`);
  }
}

export function autoProjects(b) {
  const next = PROJECTS.find(p => !state.projects.includes(p.id) && p.prereq.every(id => hasTech(id)));
  if (!next) return;
  const cost = nextProjectCost(next, b);
  if (canAfford(cost)) {
    spend(cost);
    setState('projects', [...state.projects, next.id]);
    setState('stats', 'projectsBuilt', state.stats.projectsBuilt + 1);
    log(`Projekt gebaut: ${next.name}.`);
  }
}

export function autoExpeditions(b) {
  const slots = b.expeditionSlots;
  const power = b.expeditionPower + colonyCount() * 0.15;
  let attempts = 0;
  while (state.expeditions.length < slots && attempts < 5) {
    const mission = [...MISSIONS].sort((a, z) => z.power - a.power).find(m => power >= m.power * 0.75) || MISSIONS[0];
    const before = state.expeditions.length;
    launchMission(mission.id);
    if (state.expeditions.length === before) break;
    attempts++;
  }
}
