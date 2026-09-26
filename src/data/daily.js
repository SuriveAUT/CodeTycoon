// daily.js – Tages-Loop: Daily Standup (Login-Streak), Tages-Tickets und Kaffee (langsame Echtzeit-Ressource).
// Alles hier ist statischer Inhalt; die Logik liegt in engine/daily.js.

export const DAY_MS = 86400000;

// Lokaler Kalendertag als Ganzzahl (Tage seit Epoche in der Zeitzone des Spielers).
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60000) / DAY_MS);
}

// Standup-Belohnung: Minuten aktueller Produktion je Streak-Tag (Tag 7 = großer Bonus, dann wieder von vorn).
export const STREAK_CYCLE = 7;
export const STANDUP_MINUTES = [5, 6, 8, 10, 12, 15, 30];
export const STANDUP_WEEK_RELICS = 5;          // Legacy Code am 7. Tag, × abgeschlossene Wochen (max. 10 Wochen)
export const STANDUP_WEEK_BOOST = { name: 'Retro-Bonus', effects: { allMult: 2 }, duration: 15 * 60e3 };

// Kaffee: 1 Bohne alle 6 h Echtzeit (auch offline), maximal 3 auf Vorrat.
export const COFFEE_INTERVAL_MS = 6 * 3600e3;
export const COFFEE_MAX = 3;
export const COFFEE_USES = [
  { id: 'espresso', name: 'Espresso', icon: 'zap', desc: '20 Minuten ×2 Gesamtproduktion.', boost: { name: 'Espresso', effects: { allMult: 2 }, duration: 20 * 60e3 } },
  { id: 'crunch', name: 'Crunch', icon: 'briefcase', desc: 'Alle laufenden Aufträge sofort abschließen.' },
  { id: 'reroll', name: 'Neue Tickets', icon: 'settings', desc: 'Offene Tages-Tickets neu würfeln.' },
  { id: 'overtime', name: 'Überstunden', icon: 'time', desc: 'Alle laufenden Labor-Projekte 3 Stunden schneller.' }
];

// Bonus, wenn alle drei Tickets eines Tages erledigt sind.
export const TICKETS_PER_DAY = 3;
export const TICKETS_ALL_DONE_BOOST = { name: 'Tages-Bonus', effects: { allMult: 1.5 }, duration: 30 * 60e3 };

// Zähler, die Tickets messen (Lebenszeit-Statistiken; Fortschritt = Wert − Tagesbasis).
export const TICKET_COUNTERS = {
  clicks: (s) => s.stats.manualClicks || 0,
  hires: (s) => s.stats.hiresTotal || 0,
  techs: (s) => s.stats.techsLearned || 0,
  missions: (s) => s.stats.expeditionsDone || 0,
  protocols: (s) => s.stats.protocolsUsed || 0,
  bugs: (s) => s.stats.bugsFixed || 0,
  trades: (s) => s.stats.stockTrades || 0,
  quests: (s) => s.stats.questsDone || 0,
  scrap: (s) => s.stats.total?.scrap || 0,
  research: (s) => s.stats.total?.research || 0
};

// Ticket-Pool. target/reward bekommen (state, bonuses, rates); `minutes(res, m, min)` = m Minuten aktueller
// Bruttoproduktion von `res` (mindestens `min`) – so bleiben Tickets in jeder Spielphase relevant.
export const TICKET_POOL = [
  { id: 't_clicks', counter: 'clicks', label: (n) => `Schreib ${n}× Code (Klick/Leertaste)`,
    target: (s) => 150 + Math.min(350, Math.floor((s.stats.lifetime || 0) / 600)) * 1,
    reward: (h) => ({ scrap: h.minutes('scrap', 10, 300) }) },
  { id: 't_hires', counter: 'hires', label: (n) => `Stell ${n} Mitarbeiter ein`,
    target: (s) => 15 + Math.min(45, Math.floor((s.stats.lifetime || 0) / 1200)),
    reward: (h) => ({ energy: h.minutes('energy', 10, 100) }) },
  { id: 't_scrap', counter: 'scrap', label: (n, f) => `Produziere ${f(n)} Code`,
    target: (s, b, h) => h.minutes('scrap', 15, 500),
    reward: (h) => ({ research: h.minutes('research', 8, 50) }) },
  { id: 't_research', counter: 'research', label: (n, f) => `Sammle ${f(n)} Ideas`,
    available: (s, b, h) => h.gross('research') > 0,
    target: (s, b, h) => h.minutes('research', 15, 100),
    reward: (h) => ({ scrap: h.minutes('scrap', 12, 400) }) },
  { id: 't_techs', counter: 'techs', label: (n) => `Lerne ${n} Technologie${n > 1 ? 'n' : ''}`,
    target: (s) => (s.techs.length >= 8 ? 2 : 1),
    reward: (h) => ({ research: h.minutes('research', 10, 80), scrap: h.minutes('scrap', 5, 100) }) },
  { id: 't_missions', counter: 'missions', label: (n) => `Schließ ${n} Freelance-Aufträge ab`,
    available: (s) => s.techs.includes('freelance_platform'),
    target: (s) => 2 + Math.min(3, Math.floor((s.stats.expeditionsDone || 0) / 25)),
    reward: (h) => ({ relics: 3, energy: h.minutes('energy', 8, 100) }) },
  { id: 't_protocol', counter: 'protocols', label: () => 'Aktiviere ein Protokoll',
    available: (s) => s.techs.includes('agile_scrum'),
    target: () => 1,
    reward: (h) => ({ scrap: h.minutes('scrap', 8, 200) }) },
  { id: 't_bugs', counter: 'bugs', label: (n) => `Fang ${n} fliegende Bugs`,
    target: () => 2,
    reward: (h) => ({ scrap: h.minutes('scrap', 6, 150), energy: h.minutes('energy', 6, 60) }) },
  { id: 't_trades', counter: 'trades', label: (n) => `Handle ${n}× an der Börse`,
    available: (s) => s.techs.includes('freelance_platform'),
    target: () => 3,
    reward: (h) => ({ energy: h.minutes('energy', 15, 200) }) },
  { id: 't_quests', counter: 'quests', label: (n) => `Erledige ${n} Aufgaben`,
    available: (s, b, h) => h.questsLeft >= 2,
    target: () => 2,
    reward: (h) => ({ scrap: h.minutes('scrap', 10, 300), research: h.minutes('research', 5, 40) }) }
];
