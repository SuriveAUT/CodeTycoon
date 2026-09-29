// chapters.js – Finanzierungsrunden: die Kapitel der Langzeit-Progression. Eine Runde schaltet Inhalte frei
// (Tech-Stufen über TECH_TIERS[].chapter, einzelne Techs/Releases/Labor-Projekte über `chapter`) und hat Ziele;
// sind alle erfüllt, beginnt die nächste Runde und die Belohnung der abgeschlossenen gilt für immer.
// Logik in engine/roadmap.js. Ziel-Typen siehe goalProgress() dort.
//
// reward: Bonus-Effekte (store/bonuses.js → applyEffects) plus labSlots/chipSlots, sobald die Runde abgeschlossen ist
// unlocks: Anzeige im Roadmap-Tab
// preview: Zwischenziel – bei halbem XP-Balken (PREVIEW_AT) wird diese Tech der nächsten Runde vorab freigeschaltet

export const CHAPTERS = [
  { id: 'garage', name: 'Garage', desc: 'Ein Keller, drei Laptops und sehr viel Koffein.',
    unlocks: ['Tech-Stufen 1–3', 'Sieben Releases'],
    goals: [{ type: 'refactors', value: 1 }, { type: 'xpEarned', value: 1e4 }, { type: 'lab', id: 'pitch_deck' }],
    reward: { allMult: 1.25 }, rewardLabel: 'Gesamt ×1,25' },
  { id: 'seed', name: 'Seed', desc: 'Business Angels glauben an dich. Zeit für Daten und KI.',
    unlocks: ['Tech-Stufe 4: Konzern', 'Release: StackOverflow Klon'],
    goals: [{ type: 'xpEarned', value: 2e6 }, { type: 'sprints', value: 1 }, { type: 'standups', value: 3 }, { type: 'lab', id: 'due_diligence' }],
    preview: 'venture_capital',
    reward: { allMult: 1.5, labSlots: 1 }, rewardLabel: 'Gesamt ×1,5, 2. Labor-Slot' },
  { id: 'series_a', name: 'Series A', desc: 'Echtes Wagniskapital. Die Singularität rückt näher.',
    unlocks: ['Tech-Stufe 5: Singularität', 'Releases: Betriebssystem, Internet 3.0'],
    goals: [{ type: 'xpEarned', value: 4e7 }, { type: 'release', id: 'operating_system' }, { type: 'sprints', value: 3 }, { type: 'lab', id: 'term_sheet' }],
    preview: 'platform_apis',
    reward: { allMult: 2, chipSlots: 1 }, rewardLabel: 'Gesamt ×2, 4. Chip-Slot' },
  { id: 'series_b', name: 'Series B', desc: 'Wachstum um jeden Preis. Aus dem Produkt wird eine Plattform.',
    unlocks: ['Tech-Stufe 6: Plattform (erste Hälfte)', 'Mitarbeiter: Platform Engineer, Marketplace', 'Release: Super-App'],
    goals: [{ type: 'xpEarned', value: 2.8e8 }, { type: 'release', id: 'internet_three' }, { type: 'lab', id: 'board_meeting' }],
    preview: 'quantum_computing',
    reward: { allMult: 2, labSlots: 1, offlineCapHours: 4 }, rewardLabel: 'Gesamt ×2, 3. Labor-Slot, Offline-Limit +4h' },
  { id: 'series_c', name: 'Series C', desc: 'Die letzte Runde vor dem Börsengang. Jetzt zählt nur noch Größe.',
    unlocks: ['Tech-Stufe 6: Plattform (zweite Hälfte)', 'Mitarbeiter: Hype-Maschine, Legacy-Rechenzentrum'],
    goals: [{ type: 'xpEarned', value: 7e8 }, { type: 'release', id: 'super_app' }, { type: 'sprints', value: 5 }, { type: 'lab', id: 'roadshow' }],
    reward: { allMult: 2 }, rewardLabel: 'Gesamt ×2' },
  { id: 'ipo', name: 'IPO', desc: 'Die Glocke an der Börse wartet. Ein letztes Release trennt dich vom Parkett.',
    unlocks: ['Release: Börsengang'],
    goals: [{ type: 'release', id: 'ipo' }],
    reward: { allMult: 3 }, rewardLabel: 'Gesamt ×3' },
  { id: 'public', name: 'Börsennotiert', desc: 'Du hast es geschafft. Ab jetzt zählt nur noch das Vermächtnis.',
    unlocks: ['Vorstandsmandate im Roadmap-Tab'],
    goals: [] }
];

// Zwischenziel: ab diesem Anteil des XP-Balkens gilt die Vorab-Tech (preview) der Runde als freigeschaltet
export const PREVIEW_AT = 0.5;

// Anteil des XP-Balkens: Größenordnungen ab Rundenbeginn (startXp), jede Verdopplung füllt gleich viel
export function xpBarFraction(cur, target, startXp = 0) {
  if (cur >= target) return 1;
  const start = Math.min(cur, startXp || 0);
  const span = Math.log1p(target) - Math.log1p(start);
  return span > 0 ? Math.max(0, (Math.log1p(cur) - Math.log1p(start)) / span) : 0;
}

// XP-Stand, bei dem der Balken den Anteil `fraction` erreicht (Umkehrung von xpBarFraction)
export function xpAtFraction(fraction, target, startXp = 0) {
  const start = Math.log1p(Math.max(0, startXp || 0));
  return Math.expm1(start + fraction * (Math.log1p(target) - start));
}

export function chapterXpGoal(chapter) {
  return chapter?.goals?.find(g => g.type === 'xpEarned')?.value || 0;
}

// Vorab-Tech der aktuellen Runde und ob ihr Zwischenziel erreicht ist (reine Funktionen des Spielstands)
export function previewTechId(s) {
  return CHAPTERS[s.roadmap?.chapter || 0]?.preview || null;
}
export function previewReached(s) {
  const chapter = CHAPTERS[s.roadmap?.chapter || 0];
  const goal = chapterXpGoal(chapter);
  if (!chapter?.preview || !goal) return false;
  return xpBarFraction(s.stats?.xpEarned || 0, goal, s.roadmap?.startXp || 0) >= PREVIEW_AT;
}
