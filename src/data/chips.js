// chips.js – Mainframe Chip-Definitionen (RPG-Elemente)
export const CHIPS = [
  {
    id: 'multi_threading',
    name: 'Multi-Threading Core',
    desc: '+20% Produktion, aber -25% Revenue.',
    rarity: 'common',
    effects: { allMult: 1.20 },
    tradeoffs: { energyMult: 0.75 }
  },
  {
    id: 'overclocking',
    name: 'Overclocking Unit',
    desc: '+35% Code Output, aber 1.6× Energiekosten.',
    rarity: 'rare',
    effects: { scrapMult: 1.35 },
    tradeoffs: { converterInputMult: 1.6 }
  },
  {
    id: 'neural_cache',
    name: 'Neural Cache',
    desc: '+30% Ideas-Produktion, aber -15% Module.',
    rarity: 'common',
    effects: { researchMult: 1.30 },
    tradeoffs: { componentsMult: 0.85 }
  },
  {
    id: 'quantum_optimizer',
    name: 'Quantum Optimizer',
    desc: '-20% Forschungskosten, aber -12% Hype.',
    rarity: 'rare',
    effects: { researchCostMult: 0.80 },
    tradeoffs: { influenceMult: 0.88 }
  },
  {
    id: 'darknet_router',
    name: 'Dark Net Router',
    desc: '+25% Legacy Code, aber -20% Revenue.',
    rarity: 'rare',
    effects: { relicMult: 1.25, relicChance: 0.03 },
    tradeoffs: { energyMult: 0.80 }
  },
  {
    id: 'stability_matrix',
    name: 'Stability Matrix',
    desc: '+15% Event-Resist, +10% Offline-Effizienz.',
    rarity: 'common',
    effects: { eventResist: 0.15, offlineCapHours: 2 },
    tradeoffs: {}
  },
  {
    id: 'gpu_cluster',
    name: 'GPU Cluster',
    desc: '+40% User-Produktion, aber -30% Code.',
    rarity: 'epic',
    effects: { dataMult: 1.40 },
    tradeoffs: { scrapMult: 0.70 }
  },
  {
    id: 'auto_scaler',
    name: 'Auto-Scaler',
    desc: '+18% aller Gebaude, -12% Freelance-Power.',
    rarity: 'rare',
    effects: { allMult: 1.18 },
    tradeoffs: { expeditionPower: -0.15 }
  },
  {
    id: 'quantum_entangler',
    name: 'Quantum Entangler',
    desc: '+25% Hype, +15% Freelance-Speed, -10% Ideas.',
    rarity: 'epic',
    effects: { influenceMult: 1.25, expeditionSpeed: 1.15 },
    tradeoffs: { researchMult: 0.90 }
  },
  {
    id: 'legacy_decoder',
    name: 'Legacy Decoder',
    desc: '+40% Legacy Code Chance, -15% Ideas.',
    rarity: 'epic',
    effects: { relicChance: 0.06, relicMult: 1.20 },
    tradeoffs: { researchMult: 0.85 }
  }
];

export function getChip(id) {
  return CHIPS.find(c => c.id === id);
}
