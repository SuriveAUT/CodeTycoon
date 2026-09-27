// mandates.js – Vorstandsmandate nach dem Börsengang (Runde „Börsennotiert“). Logik in engine/mandates.js.
// Immer eins aktiv, die Reihenfolge wählt der Spieler. Jedes Mandat hat drei Schritte in beliebiger Reihenfolge:
// Labor-Projekt (data/lab.js, Feld `mandate`), Vorstands-Sprint (data/challenges.js → MANDATE_SPRINTS) und
// Mandats-Release, finanziert über ein Budget, das Refactors überlebt (Einzahlungen aus dem Vorrat) – nach dem
// Börsengang wächst der Vorrat kaum noch, ein Release aus einem einzigen Run wäre sofort oder nie bezahlbar.
// Der erste Abschluss schaltet `unlock` frei (Labor-Slots, Core Value, Chip, Endlos-Projekt); danach kommen die
// Mandate als nächste Stufe wieder und geben Gesamt ×MANDATE_REPEAT_BONUS.

export const MANDATE_STEPS = ['lab', 'sprint', 'release'];
export const MANDATE_STEP_LABELS = { lab: 'Labor', sprint: 'Vorstands-Sprint', release: 'Release' };

// Ab Stufe 2: je erfülltem Mandat dauerhaft Gesamt ×1,15
export const MANDATE_REPEAT_BONUS = 1.15;
// Vorstands-Sprint: Ziel = dieser Anteil des Rekord-Runs, ×1,2 je bereits erfülltem Mandat
export const MANDATE_SPRINT_SHARE = 0.25;
export const MANDATE_SPRINT_GROWTH = 1.2;
// Release-Budget: Ziel × MANDATE_BUDGET_GROWTH je bereits erfülltem Mandat (egal in welcher Reihenfolge). Beim
// Refactor fließt der übrige Hype/Legacy automatisch ein, der Knopf „Einzahlen“ nimmt höchstens
// MANDATE_DEPOSIT_SHARE des Vorrats (Sim, 2 Besuche am Tag: 5,5 / 8 / 8 Tage je Mandat)
export const MANDATE_BUDGET = { influence: 6e21, relics: 3e21 };
export const MANDATE_BUDGET_GROWTH = 1.15;
export const MANDATE_DEPOSIT_SHARE = 0.5;
// Mandats-Labor: Grunddauer (data/lab.js) + 6 h je bereits erfülltem Mandat, höchstens 72 h
export const MANDATE_LAB_HOURS_PER_LEVEL = 6;
export const MANDATE_LAB_MAX_HOURS = 72;

export const MANDATES = [
  { id: 'sovereign_cloud', name: 'Souveräne Cloud', icon: 'shield',
    desc: 'Der Aufsichtsrat will Unabhängigkeit: eigene Rechenzentren statt gemieteter Clouds.',
    lab: 'mandate_datacenter', sprint: 'ms_sovereign',
    release: { name: 'Eigenes Rechenzentrum', desc: 'Eigene Hardware, eigene Regeln. Keine Cloud-Rechnung mehr, kein fremder Admin.' },
    unlock: { labSlots: 1, doctrine: 'sovereign', chip: 'edge_node', lab: 'datacenter_expansion' },
    rewardLabel: '4. Labor-Slot · Core Value „Souverän“ · Chip „Edge-Knoten“ · Endlos-Projekt „RZ-Ausbau“' },
  { id: 'open_infrastructure', name: 'Öffentliche Infrastruktur', icon: 'team',
    desc: 'Der Aufsichtsrat will Ansehen: eine Open-Source-Stiftung, von der alle etwas haben.',
    lab: 'mandate_foundation', sprint: 'ms_community',
    release: { name: 'Offene Plattform', desc: 'Deine Plattform als offene Infrastruktur. Jeder darf darauf bauen, alle bauen mit.' },
    unlock: { doctrine: 'community_first', chip: 'community_mesh', lab: 'community_program' },
    rewardLabel: 'Core Value „Community First“ · Chip „Community-Mesh“ · Endlos-Projekt „Community-Programm“' },
  { id: 'moonshot', name: 'Moonshot', icon: 'zap',
    desc: 'Der Aufsichtsrat will das nächste große Ding: eine allgemeine KI, gebaut im eigenen Haus.',
    lab: 'mandate_agi_research', sprint: 'ms_moonshot',
    release: { name: 'AGI', desc: 'Die allgemeine KI. Sie schreibt ab jetzt den Code – du schreibst Geschichte.' },
    unlock: { doctrine: 'moonshot_mindset', chip: 'agi_core', lab: 'acquisition_team' },
    rewardLabel: 'Core Value „Moonshot Mindset“ · Chip „AGI-Kern“ · Endlos-Projekt „Übernahme-Team“' }
];

export function getMandate(id) {
  return MANDATES.find(m => m.id === id) || null;
}
