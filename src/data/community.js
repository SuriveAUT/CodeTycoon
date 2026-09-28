// community.js – Community-Daten: Paketarten des gemeinsamen Open-Source-Projekts, Bonus, Meilenstein-Boost und
// die Kategorien der Wochenwertung. Kontingent, Projektziele und Abzeichen führt der Server (backend/lib/community.js).

// Alle Arten zählen gleich viel; sie kosten nur verschiedene Ressourcen – man gibt, was man entbehren kann
export const PACKAGE_TYPES = [
  { id: 'code', res: 'scrap', name: 'Code-Paket', desc: 'Features und Bugfixes für das Projekt.' },
  { id: 'qa', res: 'alloy', name: 'QA-Paket', desc: 'Deine gesammelten Bugs als saubere Issue-Reports.' },
  { id: 'docs', res: 'research', name: 'Doku-Paket', desc: 'Ideen fürs README, damit andere mitmachen können.' }
];

export const PACKAGE_MINUTES = 15;                 // Kosten: so viele Minuten Bruttoproduktion der Ressource
export const COMMUNITY_QUOTA_MAX = 9;              // wie QUOTA_MAX im Backend
export const COMMUNITY_BONUS_PER_PROJECT = 0.03;   // +3 % Gesamtproduktion je fertigem Projekt
export const COMMUNITY_MAX_PENDING = 30;           // bezahlte, noch unbestätigte Pakete
export const COMMUNITY_MAX_CLAIMED = 60;           // gemerkte Meilenstein-Belohnungen

// Meilensteine 25/50/75 %: jede*r Beteiligte bekommt diesen Boost (über die Boost-Warteschlange)
export const MILESTONE_BOOST = { name: 'Community-Schub', effects: { allMult: 2 }, duration: 20 * 60e3 };

export const WEEKLY_CATEGORIES = [
  { id: 'growth', name: 'Wachstum', icon: 'prestige', desc: 'Verdiente XP dieser Woche im Verhältnis zum Stand am Montag (mindestens 1.000 XP als Basis).' },
  { id: 'sprint', name: 'Wochen-Sprint', icon: 'zap', desc: 'Dein Code bei Minute 30 des Wochen-Sprints im Vergleich zu deinen normalen Runs. Der beste Versuch zählt.' },
  { id: 'lab', name: 'Forschung', icon: 'research', desc: 'Nennstunden abgeschlossener Laborprojekte je Slot-Tag – ein Slot zählt so viel wie vier.' }
];

export function getPackageType(id) { return PACKAGE_TYPES.find(p => p.id === id) || null; }
