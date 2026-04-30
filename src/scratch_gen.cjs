const fs = require('fs');

const buildings = [
  'salvage', 'mining_outpost', 'planetary_cracker', 'nebula_harvester', 'void_dredge', 'asteroid_devourer', 'singularity_siphon', 'reality_weaver',
  'solar', 'geothermal', 'fusion_reactor', 'antimatter_condenser', 'dyson', 'starforge', 'quasar_tap', 'vacuum_extractor',
  'smelter', 'mega_smelter', 'stellar_forge', 'fabricator', 'quantum_fabricator', 'dataweave', 'planetary_datacenter', 'lab', 'galactic_lab',
  'relay', 'void_relais', 'observatory', 'dimension_scanner'
];

const tiers = [
  { threshold: 10, suffix: 'I', mult: 10 },
  { threshold: 50, suffix: 'II', mult: 800 },
  { threshold: 100, suffix: 'III', mult: 60000 },
  { threshold: 200, suffix: 'IV', mult: 5e6 },
  { threshold: 300, suffix: 'V', mult: 4e8 },
  { threshold: 400, suffix: 'VI', mult: 3e10 },
  { threshold: 500, suffix: 'VII', mult: 2e12 }
];

let addedTechs = [];
let addedEffects = [];

buildings.forEach(b => {
  let baseCost = 500;
  tiers.forEach((t, i) => {
    const id = `upg_${b}_${t.suffix}`;
    const cost = baseCost * Math.pow(t.mult, i+1);
    addedTechs.push(`  { id: '${id}', name: '${b.toUpperCase()} Upgrade ${t.suffix}', cost: ${cost}, prereq: [], desc: 'Verdoppelt die Effizienz von ${b}.' }`);
    addedEffects.push(`  ${id}: b => { b.buildingMults['${b}'] = (b.buildingMults['${b}'] || 1) * 2; }`);
  });
});

// Kittens
const kittens = [
  { id: 'ai_overmind_1', name: 'KI-Overmind Alpha', cost: 1e9, desc: 'Erhöht die Produktion basierend auf Errungenschaften.' },
  { id: 'ai_overmind_2', name: 'KI-Overmind Beta', cost: 1e14, desc: 'KI-Synergie wächst.' },
  { id: 'ai_overmind_3', name: 'KI-Overmind Gamma', cost: 1e19, desc: 'Das Netz ist vollendet.' }
];

kittens.forEach(k => {
  addedTechs.push(`  { id: '${k.id}', name: '${k.name}', cost: ${k.cost}, prereq: [], desc: '${k.desc}' }`);
});
addedEffects.push(`  ai_overmind_1: b => { b.kittenMult *= 1 + (globalThis.state?.achievements?.length || 0) * 0.05; }`);
addedEffects.push(`  ai_overmind_2: b => { b.kittenMult *= 1 + (globalThis.state?.achievements?.length || 0) * 0.10; }`);
addedEffects.push(`  ai_overmind_3: b => { b.kittenMult *= 1 + (globalThis.state?.achievements?.length || 0) * 0.20; }`);

let techsStr = fs.readFileSync('c:/Users/domin/WebstormProjects/astraforge/astraforge_idle_game/astraforge_idle_game/src/data/techs.js', 'utf8');
let effectsStr = fs.readFileSync('c:/Users/domin/WebstormProjects/astraforge/astraforge_idle_game/astraforge_idle_game/src/data/effects.js', 'utf8');

techsStr = techsStr.replace('];\n\nexport const AUTO_RESEARCH_ORDER', ',\n' + addedTechs.join(',\n') + '\n];\n\nexport const AUTO_RESEARCH_ORDER');
effectsStr = effectsStr.replace('  core_resonance: b => { b.clickPowerMult *= 2; }\n};', '  core_resonance: b => { b.clickPowerMult *= 2; },\n' + addedEffects.join(',\n') + '\n};');

fs.writeFileSync('c:/Users/domin/WebstormProjects/astraforge/astraforge_idle_game/astraforge_idle_game/src/data/techs.js', techsStr);
fs.writeFileSync('c:/Users/domin/WebstormProjects/astraforge/astraforge_idle_game/astraforge_idle_game/src/data/effects.js', effectsStr);

console.log("Done");
