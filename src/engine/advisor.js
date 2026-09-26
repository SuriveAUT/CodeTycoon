// advisor.js – „Beste Investition“: Output-Wert pro Kosten (nur Producer/Konverter).
// Nutzen der Tipp im Team-Tab und die Balancing-Simulation (scripts/sim.mjs).
import { canAfford, buildingCount, calcNextBuildingCost, isBuildingUnlocked, state } from '../store/gameState.js';
import { buildingOutputPerSecond, buildingInputPerSecond } from '../store/bonuses.js';
import { BUILDINGS, milestoneMult } from '../data/buildings.js';

// Grober Wert je Ressource, damit sich verschiedene Outputs und Kosten vergleichen lassen
const RES_VALUE = { scrap: 1, energy: 3, alloy: 6, components: 20, data: 6, research: 8, influence: 25, relics: 2000 };

// affordableOnly: nur Gebäude, die gerade leistbar sind; exclude: Set von IDs, die nicht in Frage kommen
export function bestInvestmentId(b, { affordableOnly = false, exclude = null } = {}) {
  let best = null, bestScore = 0;
  for (const def of BUILDINGS) {
    if (def.type === 'modifier' || !isBuildingUnlocked(def) || exclude?.has(def.id)) continue;
    const cost = calcNextBuildingCost(def);
    if (affordableOnly && !canAfford(cost)) continue;
    const costValue = Object.entries(cost).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0);
    if (costValue <= 0) continue;
    const owned = buildingCount(def.id);
    const out = buildingOutputPerSecond(def, state, b);
    const inp = buildingInputPerSecond(def, state, b);
    let value = Object.entries(out).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0)
      - Object.entries(inp).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0) * 0.5;
    const stepUp = milestoneMult(owned + 1) / milestoneMult(Math.max(owned, 1));
    value *= stepUp;
    if (value <= 0) continue;
    const score = value / costValue;
    if (score > bestScore) { bestScore = score; best = def.id; }
  }
  return best;
}
