// challenges.js – Sprints: Runs mit Handicap und festem Ziel. Ein Sprint startet wie ein Hard Refactor;
// wer das Ziel erreicht, bekommt eine permanente Belohnung. Logik in engine/challenges.js,
// Modifikatoren/Belohnungen werden in store/bonuses.js angewendet.
//
// mods:   Handicap während des Sprints (Multiplikatoren auf Bonus-Keys, plus Flags noAuto/noSynergy)
// goal:   { type: 'scrap' | 'techs', value }  – Run-Code bzw. gelernte Techs im Run
// reward: permanenter Bonus nach Abschluss (Multiplikatoren, synergyMult = Team-Synergie-Faktor)
// requires: so viele Sprints müssen vorher abgeschlossen sein

export const CHALLENGES = [
  { id: 'sp_manual', name: 'Handbetrieb', icon: 'keyboard', requires: 0,
    desc: 'Auto-Hire, Auto-Learn, Auto-Freelance und Auto-Deploy sind aus. Alles läuft per Hand.',
    mods: { noAuto: true }, modLabel: 'Keine Automatisierung',
    goal: { type: 'scrap', value: 1e8 }, reward: { clickPowerMult: 2 }, rewardLabel: 'Klick-Kraft ×2' },
  { id: 'sp_lean', name: 'Sparflamme', icon: 'settings', requires: 0,
    desc: 'Konverter brauchen doppelt so viel Input. Basisproduktion ist alles.',
    mods: { converterInputMult: 2 }, modLabel: 'Konverter-Input ×2',
    goal: { type: 'scrap', value: 1e8 }, reward: { converterInputMult: 0.9 }, rewardLabel: 'Konverter-Input −10%' },
  { id: 'sp_bootstrap', name: 'Bootstrapped', icon: 'briefcase', requires: 1,
    desc: 'Kein Investor in Sicht: Mitarbeiter kosten das Doppelte.',
    mods: { buildingCostMult: 2 }, modLabel: 'Mitarbeiter ×2 teurer',
    goal: { type: 'scrap', value: 2e8 }, reward: { buildingCostMult: 0.95 }, rewardLabel: 'Mitarbeiter −5%' },
  { id: 'sp_solo', name: 'Einzelkämpfer', icon: 'team', requires: 1,
    desc: 'Keine Team-Synergie. Jeder arbeitet für sich.',
    mods: { noSynergy: true }, modLabel: 'Team-Synergie aus',
    goal: { type: 'scrap', value: 2e8 }, reward: { synergyMult: 1.25 }, rewardLabel: 'Team-Synergie +25%' },
  { id: 'sp_brain', name: 'Brain Drain', icon: 'tech', requires: 2,
    desc: 'Ideas-Produktion auf ein Viertel. Lern trotzdem 15 Technologien.',
    mods: { researchMult: 0.25 }, modLabel: 'Ideas ×0,25',
    goal: { type: 'techs', value: 15 }, reward: { researchCostMult: 0.9 }, rewardLabel: 'Forschung −10%' },
  { id: 'sp_speed', name: 'Speedrun', icon: 'zap', requires: 3, timeLimit: 40 * 60e3,
    desc: '10 Millionen Code in 40 Minuten. Läuft die Zeit ab, endet der Sprint ohne Belohnung.',
    mods: {}, modLabel: 'Zeitlimit 40 min',
    goal: { type: 'scrap', value: 1e7 }, reward: { prestigeGainMult: 1.15 }, rewardLabel: 'XP-Gewinn +15%' }
];

// Vorstands-Sprints der Mandate (data/mandates.js): nur während ihres Mandats startbar. Ziel ist ein Anteil des
// Rekord-Runs, festgelegt beim Übernehmen des Mandats (state.mandates.sprintGoals). Kein eigener Dauerbonus –
// der Abschluss zählt als Schritt des Mandats und nicht zu challengesDone.
export const MANDATE_SPRINTS = [
  { id: 'ms_sovereign', name: 'Datensouveränität', icon: 'shield', mandate: 'sovereign_cloud',
    desc: 'Keine Automatisierung, Konverter brauchen doppelt so viel Input. Alles aus eigener Kraft.',
    mods: { noAuto: true, converterInputMult: 2 }, modLabel: 'Keine Automatisierung · Konverter-Input ×2',
    goal: { type: 'scrap', mandate: true }, rewardLabel: 'Schritt des Mandats „Souveräne Cloud“' },
  { id: 'ms_community', name: 'Community-Build', icon: 'team', mandate: 'open_infrastructure',
    desc: 'Keine Team-Synergie, Mitarbeiter kosten das Doppelte. Jeder Beitrag zählt einzeln.',
    mods: { noSynergy: true, buildingCostMult: 2 }, modLabel: 'Team-Synergie aus · Mitarbeiter ×2 teurer',
    goal: { type: 'scrap', mandate: true }, rewardLabel: 'Schritt des Mandats „Öffentliche Infrastruktur“' },
  { id: 'ms_moonshot', name: 'Skunkworks', icon: 'zap', mandate: 'moonshot',
    desc: 'Ideas-Produktion auf ein Viertel, Mitarbeiter kosten das Doppelte. Ein kleines Team gegen alle Wahrscheinlichkeit.',
    mods: { researchMult: 0.25, buildingCostMult: 2 }, modLabel: 'Ideas ×0,25 · Mitarbeiter ×2 teurer',
    goal: { type: 'scrap', mandate: true }, rewardLabel: 'Schritt des Mandats „Moonshot“' }
];

export function getChallenge(id) {
  return CHALLENGES.find(c => c.id === id) || MANDATE_SPRINTS.find(c => c.id === id) || null;
}
