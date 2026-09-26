// chapters.js – Finanzierungsrunden: die Kapitel der Langzeit-Progression. Eine Runde schaltet Inhalte frei
// (Tech-Stufen über TECH_TIERS[].chapter, einzelne Techs/Releases/Labor-Projekte über `chapter`) und hat Ziele;
// sind alle erfüllt, beginnt die nächste Runde und die Belohnung der abgeschlossenen gilt für immer.
// Logik in engine/roadmap.js. Ziel-Typen siehe goalProgress() dort.
//
// reward: Bonus-Effekte (store/bonuses.js → applyEffects) plus labSlots/chipSlots, sobald die Runde abgeschlossen ist
// unlocks: Anzeige im Roadmap-Tab

export const CHAPTERS = [
  { id: 'garage', name: 'Garage', desc: 'Ein Keller, drei Laptops und sehr viel Koffein.',
    unlocks: ['Tech-Stufen 1–3', 'Sieben Releases'],
    goals: [{ type: 'refactors', value: 1 }, { type: 'xpEarned', value: 1e4 }, { type: 'lab', id: 'pitch_deck' }],
    reward: { allMult: 1.25 }, rewardLabel: 'Gesamt ×1,25' },
  { id: 'seed', name: 'Seed', desc: 'Business Angels glauben an dich. Zeit für Daten und KI.',
    unlocks: ['Tech-Stufe 4: Konzern', 'Release: StackOverflow Klon'],
    goals: [{ type: 'xpEarned', value: 2e6 }, { type: 'sprints', value: 1 }, { type: 'standups', value: 3 }, { type: 'lab', id: 'due_diligence' }],
    reward: { allMult: 1.5, labSlots: 1 }, rewardLabel: 'Gesamt ×1,5, 2. Labor-Slot' },
  { id: 'series_a', name: 'Series A', desc: 'Echtes Wagniskapital. Die Singularität rückt näher.',
    unlocks: ['Tech-Stufe 5: Singularität', 'Releases: Betriebssystem, Internet 3.0'],
    goals: [{ type: 'xpEarned', value: 4e7 }, { type: 'release', id: 'operating_system' }, { type: 'sprints', value: 3 }, { type: 'lab', id: 'term_sheet' }],
    reward: { allMult: 2, chipSlots: 1 }, rewardLabel: 'Gesamt ×2, 4. Chip-Slot' },
  { id: 'series_b', name: 'Series B', desc: 'Wachstum um jeden Preis. Aus dem Produkt wird eine Plattform.',
    unlocks: ['Tech-Stufe 6: Plattform (erste Hälfte)', 'Mitarbeiter: Platform Engineer, Marketplace', 'Release: Super-App'],
    goals: [{ type: 'xpEarned', value: 2e8 }, { type: 'release', id: 'internet_three' }, { type: 'lab', id: 'board_meeting' }],
    reward: { allMult: 2, labSlots: 1, offlineCapHours: 4 }, rewardLabel: 'Gesamt ×2, 3. Labor-Slot, Offline-Limit +4h' },
  { id: 'series_c', name: 'Series C', desc: 'Die letzte Runde vor dem Börsengang. Jetzt zählt nur noch Größe.',
    unlocks: ['Tech-Stufe 6: Plattform (zweite Hälfte)', 'Mitarbeiter: Hype-Maschine, Legacy-Rechenzentrum'],
    goals: [{ type: 'xpEarned', value: 5e8 }, { type: 'release', id: 'super_app' }, { type: 'sprints', value: 5 }, { type: 'lab', id: 'roadshow' }],
    reward: { allMult: 2 }, rewardLabel: 'Gesamt ×2' },
  { id: 'ipo', name: 'IPO', desc: 'Die Glocke an der Börse wartet. Ein letztes Release trennt dich vom Parkett.',
    unlocks: ['Release: Börsengang'],
    goals: [{ type: 'release', id: 'ipo' }],
    reward: { allMult: 3 }, rewardLabel: 'Gesamt ×3' },
  { id: 'public', name: 'Börsennotiert', desc: 'Du hast es geschafft. Ab jetzt zählt nur noch das Vermächtnis.',
    unlocks: ['Endlos-Projekte im Labor'],
    goals: [] }
];
