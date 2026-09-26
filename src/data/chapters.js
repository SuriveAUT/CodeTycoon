// chapters.js – Finanzierungsrunden: die Kapitel der Langzeit-Progression. Eine Runde schaltet Inhalte frei
// (Tech-Stufen über TECH_TIERS[].chapter) und hat Ziele; sind alle erfüllt, beginnt die nächste Runde.
// Logik in engine/roadmap.js. Ziel-Typen siehe goalProgress() dort.

export const CHAPTERS = [
  { id: 'garage', name: 'Garage', desc: 'Ein Keller, drei Laptops und sehr viel Koffein.',
    goals: [{ type: 'refactors', value: 1 }, { type: 'xpEarned', value: 100 }] },
  { id: 'seed', name: 'Seed', desc: 'Business Angels glauben an dich. Zeit für Daten und KI.',
    goals: [{ type: 'xpEarned', value: 600 }] },
  { id: 'series_a', name: 'Series A', desc: 'Echtes Wagniskapital. Die Singularität rückt näher.',
    goals: [] }
];
