// devops.js – Regeln der Automatisierung (engine/devops.js): Sparziel, Reserven, Auftrags-Fokus und zwei Profile.
// Jede Regel schaltet ein einmaliges Laborprojekt frei (data/lab.js, Feld `devops`).

// Regel → Laborprojekt, das sie freischaltet
export const DEVOPS_RULES = {
  target: 'release_planning',
  reserves: 'budget_policy',
  missionFocus: 'freelance_matching',
  profiles: 'config_as_code'
};

export const RULE_LABELS = { target: 'Sparziel', reserves: 'Reserven', missionFocus: 'Auftrags-Fokus', profiles: 'Profile' };

// Reserven: so viele Minuten Bruttoproduktion lässt die Automatisierung je Ressource immer liegen
export const RESERVE_MINUTES = [0, 15, 60, 240];

// Ein Sparziel hält seine Kosten erst zurück, wenn es innerhalb dieser Zeit erreichbar ist – vorher wächst die Firma weiter
export const SAVE_HORIZON_MIN = 30;

// Auftrags-Fokus von Auto-Freelance; Ressourcen-Fokus wertet den erwarteten Ertrag pro Stunde
export const MISSION_FOCI = [
  { id: 'power', name: 'Stärkster', desc: 'Wie bisher: der stärkste Auftrag, den die Auftrags-Power erlaubt.' },
  { id: 'relics', name: 'Legacy', res: 'relics', desc: 'Der Auftrag mit dem meisten Legacy Code pro Stunde.' },
  { id: 'influence', name: 'Hype', res: 'influence', desc: 'Der Auftrag mit dem meisten Hype pro Stunde.' },
  { id: 'research', name: 'Ideas', res: 'research', desc: 'Der Auftrag mit den meisten Ideas pro Stunde.' },
  { id: 'data', name: 'Users', res: 'data', desc: 'Der Auftrag mit den meisten Users pro Stunde.' },
  { id: 'short', name: 'Kurz', desc: 'Der kürzeste startbare Auftrag – wenn du bald wieder reinschaust.' },
  { id: 'long', name: 'Lang', desc: 'Der längste startbare Auftrag – vor einer langen Pause.' }
];

export const PROFILE_NAMES = ['Aufbau', 'Sparen'];
