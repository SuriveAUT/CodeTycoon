// events.js – Zufallsereignisse (temporäre Effekte). Spawn-Logik in engine/events.js.

export const EVENT_POOL = [
  { name: 'Crunch Time', desc: 'Revenue +15%, Ideas −5%', duration: 5 * 60e3, effects: { energyMult: 1.15, researchMult: 0.95 } },
  { name: 'StackOverflow Hype', desc: 'Users +20%, Ideas +6%', duration: 4 * 60e3, effects: { dataMult: 1.20, researchMult: 1.06 } },
  { name: 'Hacker-Angriff', desc: 'Gesamt −15%, Fundchance +5%', duration: 5 * 60e3, effects: { allMult: 0.85, relicChance: 0.05 } },
  { name: 'Legacy Code Fund', desc: 'Legacy +15%, Hype +4%', duration: 5 * 60e3, effects: { relicMult: 1.15, influenceMult: 1.04 } },
  { name: 'VC Funding', desc: 'Gebäude −5%, Releases −3%', duration: 4 * 60e3, effects: { buildingCostMult: 0.95, projectCostMult: 0.97 } },
  { name: 'Spaghetti Code', desc: 'Gesamt −8%', duration: 4 * 60e3, effects: { allMult: 0.92 } },
  { name: 'Hacker News Frontpage', desc: 'Hype +30%, Users +10%', duration: 4 * 60e3, effects: { influenceMult: 1.30, dataMult: 1.10 } },
  { name: 'Kaffeemaschine kaputt', desc: 'Code −10%', duration: 3 * 60e3, effects: { scrapMult: 0.9 } }
];
