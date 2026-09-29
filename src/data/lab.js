// lab.js – R&D-Labor: Projekte mit Echtzeit-Timer. Starten kostet Ressourcen des laufenden Runs, danach läuft
// die Zeit auch offline weiter; fertige Projekte holt der Spieler ab (Logik in engine/lab.js).
//
// chapter:  ab welcher Finanzierungsrunde das Projekt verfügbar ist
// key:      Schlüsselprojekt einer Runde (Rundenziel in data/chapters.js)
// cost:     Minuten der aktuellen Bruttoproduktion je Ressource (wie bei den Tages-Tickets), mindestens LAB_MIN_COST.
//           Bezahlt wird mit Hype und Legacy Code – Ideas bleiben dem Tech-Baum vorbehalten.
// effects:  permanente Bonus-Effekte nach dem Abholen (store/bonuses.js → applyEffects)
// flag:     Sonderwirkung (autoStart = Auto-Hire und Auto-Learn ab Run-Beginn)
// devops:   schaltet eine Regel der Automatisierung frei (data/devops.js, engine/devops.js)
// repeatable: endlos wiederholbar; perLevel = Bonus je Stufe (Faktor 1 + Wert · Stufe),
//             Dauer hours + hoursPerLevel · Stufe (max. maxHours), Kosten × costGrowth je Stufe

export const LAB_PROJECTS = [
  // ── Schlüsselprojekte der Runden ──
  { id: 'pitch_deck', name: 'Pitch-Deck', chapter: 0, hours: 4, key: true,
    cost: { influence: 15 }, desc: 'Zwölf Folien, ein Hockeystick-Diagramm. Überzeugt die ersten Angels.' },
  { id: 'due_diligence', name: 'Due Diligence', chapter: 1, hours: 10, key: true,
    cost: { influence: 20, relics: 20 }, desc: 'Investoren wollen alles sehen. Wirklich alles.' },
  { id: 'term_sheet', name: 'Term Sheet', chapter: 2, hours: 14, key: true,
    cost: { influence: 20, relics: 20 }, desc: 'Liquidationspräferenzen verhandeln, ohne die Firma zu verschenken.' },
  { id: 'board_meeting', name: 'Board Meeting', chapter: 3, hours: 18, key: true,
    cost: { influence: 25, relics: 25 }, desc: 'Der Aufsichtsrat will Wachstum sehen. Und zwar gestern.' },
  { id: 'roadshow', name: 'IPO-Roadshow', chapter: 4, hours: 22, key: true,
    cost: { influence: 30, relics: 30 }, desc: 'Zehn Städte, zehn Pitches. Die Banken zeichnen die Aktien vor.' },

  // ── Upgrades (einmalig) ──
  { id: 'async_standups', name: 'Async Standups', chapter: 0, hours: 6,
    cost: { influence: 10 }, effects: { offlineCapHours: 2 }, label: 'Offline-Limit +2h',
    desc: 'Updates im Slack-Thread statt Meeting. Das Team arbeitet auch, wenn du weg bist.' },
  { id: 'hiring_pipeline', name: 'Hiring-Pipeline', chapter: 0, hours: 6,
    cost: { influence: 15 }, effects: { scrapMult: 1.5 }, label: 'Code ×1,5',
    desc: 'Recruiter, Coding-Challenge, Onboarding-Buddy. Neue Devs sind ab Tag eins produktiv.' },
  { id: 'sales_playbook', name: 'Sales-Playbook', chapter: 1, hours: 8,
    cost: { influence: 10, relics: 5 }, effects: { energyMult: 1.5 }, label: 'Revenue ×1,5',
    desc: 'Jeder Verkäufer nutzt dasselbe Skript. Die Abschlussquote steigt.' },
  { id: 'onboarding_docs', name: 'Onboarding-Doku', chapter: 1, hours: 8,
    cost: { influence: 15, relics: 10 }, flag: 'autoStart', label: 'Auto-Hire und Auto-Learn ab Run-Beginn',
    desc: 'Wer neu anfängt, findet alles im Wiki. Nach jedem Refactor läuft das Team sofort von selbst.' },
  { id: 'remote_culture', name: 'Remote-Kultur', chapter: 1, hours: 6,
    cost: { influence: 10, relics: 10 }, effects: { offlineEfficiency: 0.1 }, label: 'Offline-Effizienz +10%',
    desc: 'Dokumentiert, asynchron, über Zeitzonen verteilt. Weniger Leerlauf, wenn du offline bist.' },
  { id: 'ml_pipeline', name: 'ML-Pipeline', chapter: 2, hours: 12,
    cost: { influence: 20, relics: 15 }, effects: { allMult: 1.5 }, label: 'Gesamt ×1,5',
    desc: 'Modelle trainieren sich nachts selbst. Morgens ist alles ein bisschen besser.' },
  { id: 'career_ladder', name: 'Karriereleiter', chapter: 2, hours: 10,
    cost: { influence: 15, relics: 10 }, effects: { prestigeGainMult: 1.2 }, label: 'XP-Gewinn +20%',
    desc: 'Klare Level von Junior bis Principal. Wer refactort, lernt mehr dabei.' },
  { id: 'follow_the_sun', name: 'Follow the Sun', chapter: 3, hours: 12,
    cost: { influence: 15, relics: 20 }, effects: { offlineEfficiency: 0.1, offlineCapHours: 2 }, label: 'Offline-Effizienz +10%, Limit +2h',
    desc: 'Teams in drei Zeitzonen übergeben sich die Arbeit. Irgendwo ist immer Tag.' },
  { id: 'open_source_program', name: 'Open-Source-Programm', chapter: 3, hours: 16,
    cost: { influence: 20, relics: 20 }, effects: { researchCostMult: 0.8, researchMult: 1.5 }, label: 'Ideas ×1,5, Forschung −20%',
    desc: 'Die Community baut mit. Gute Ideen kommen jetzt von überall.' },
  { id: 'data_moat', name: 'Daten-Burggraben', chapter: 4, hours: 20,
    cost: { influence: 25, relics: 25 }, effects: { allMult: 1.5 }, label: 'Gesamt ×1,5',
    desc: 'Niemand hat so viele Nutzerdaten wie du. Die Konkurrenz holt nicht mehr auf.' },

  // ── DevOps (data/devops.js): schalten Regeln der Automatisierung frei, keine Produktionswirkung ──
  { id: 'release_planning', name: 'Release-Planung', chapter: 0, hours: 4, devops: 'target',
    cost: { influence: 10 }, label: 'Schaltet das Sparziel frei',
    desc: 'Ein Kalender mit Meilensteinen. Die Automatisierung spart gezielt auf ein Release oder eine Tech.' },
  { id: 'budget_policy', name: 'Budget-Policy', chapter: 0, hours: 4, devops: 'reserves',
    cost: { influence: 10 }, label: 'Schaltet Reserven frei',
    desc: 'Der CFO legt Rücklagen fest. Die Automatisierung lässt einen Mindestvorrat liegen.' },
  { id: 'freelance_matching', name: 'Freelance-Matching', chapter: 1, hours: 4, devops: 'missionFocus',
    cost: { influence: 10, relics: 5 }, label: 'Schaltet den Auftrags-Fokus frei',
    desc: 'Ein Matching-Algorithmus sucht Aufträge nach dem, was die Firma gerade braucht.' },
  { id: 'config_as_code', name: 'Config as Code', chapter: 1, hours: 6, devops: 'profiles',
    cost: { influence: 15, relics: 10 }, label: 'Schaltet zwei Profile frei',
    desc: 'Alle Einstellungen im Repo. Zwei Profile per Klick, Arbeitsmodus und Drossel überstehen den Refactor.' },

  // ── Wiederholbar ──
  { id: 'hackathon', name: 'Hackathon', chapter: 0, repeatable: true, hours: 6, hoursPerLevel: 1.5, maxHours: 24,
    cost: { influence: 10, relics: 5 }, costGrowth: 1.25, perLevel: { allMult: 0.1 }, label: 'Gesamt +10% je Stufe',
    desc: 'Ein Wochenende, Pizza, Prototypen. Jedes Mal kommt etwas Brauchbares heraus.' },
  { id: 'patent_pool', name: 'Patent-Pool', chapter: 2, repeatable: true, hours: 6, hoursPerLevel: 2, maxHours: 24,
    cost: { influence: 15, relics: 10 }, costGrowth: 1.25, perLevel: { prestigeGainMult: 0.05 }, label: 'XP-Gewinn +5% je Stufe',
    desc: 'Jede Idee wird angemeldet. Refactors zahlen sich mehr aus, wenn man sein Wissen schützt.' },

  // ── Vorstandsmandate (data/mandates.js): nur während des Mandats startbar, zählen je Durchgang neu ──
  { id: 'mandate_datacenter', name: 'Rechenzentrum planen', mandate: 'sovereign_cloud', chapter: 6, hours: 36,
    cost: { influence: 30, relics: 30 }, label: 'Mandat: Souveräne Cloud',
    desc: 'Standort, Strom, Kühlung, Glasfaser: Das eigene Rechenzentrum braucht einen belastbaren Plan.' },
  { id: 'mandate_foundation', name: 'Open-Source-Stiftung gründen', mandate: 'open_infrastructure', chapter: 6, hours: 36,
    cost: { influence: 30, relics: 30 }, label: 'Mandat: Öffentliche Infrastruktur',
    desc: 'Satzung, Beirat, erste Förderprojekte. Die Stiftung gehört bald allen, nicht nur dir.' },
  { id: 'mandate_agi_research', name: 'AGI-Forschung', mandate: 'moonshot', chapter: 6, hours: 36,
    cost: { influence: 30, relics: 30 }, label: 'Mandat: Moonshot',
    desc: 'Die besten Köpfe, die größten Cluster, eine einzige Frage: Kann die Maschine selbst denken?' },

  // ── Endlos-Projekte der Mandate: nach dem ersten Abschluss des Mandats (unlockMandate) ──
  { id: 'datacenter_expansion', name: 'RZ-Ausbau', unlockMandate: 'sovereign_cloud', chapter: 6, repeatable: true,
    hours: 6, hoursPerLevel: 2, maxHours: 24, cost: { influence: 20, relics: 20 }, costGrowth: 2,
    perLevel: { offlineCapHours: 1, offlineEfficiency: 0.01 }, label: 'Offline-Limit +1 h und Effizienz +1% je Stufe',
    desc: 'Noch ein Serverraum, noch eine Notstromanlage. Die Firma läuft immer länger ohne dich.' },
  { id: 'community_program', name: 'Community-Programm', unlockMandate: 'open_infrastructure', chapter: 6, repeatable: true,
    hours: 6, hoursPerLevel: 2, maxHours: 24, cost: { influence: 20, relics: 20 }, costGrowth: 2,
    perLevel: { ticketRewardMult: 0.1, standupRewardMult: 0.1 }, label: 'Tickets und Standup +10% je Stufe',
    desc: 'Meetups, Mentoring, Bug-Bounties. Die Community erledigt die Tagesarbeit gleich mit.' },
  { id: 'acquisition_team', name: 'Übernahme-Team', unlockMandate: 'moonshot', chapter: 6, repeatable: true, maxLevel: 10,
    hours: 6, hoursPerLevel: 2, maxHours: 24, cost: { influence: 20, relics: 20 }, costGrowth: 2,
    perLevel: { buildingCarryover: 0.02 }, label: 'Behält 2% der Mitarbeiter je Stufe über den Refactor (max. 20%)',
    desc: 'Nach jedem Refactor wechselt ein eingespieltes Kernteam direkt in die neue Firma.' }
];

export const LAB_MIN_COST = 100;
export const LAB_MAX_STOCK_SHARE = 0.5;   // höchstens die Hälfte des aktuellen Vorrats

export function getLabProject(id) {
  return LAB_PROJECTS.find(p => p.id === id) || null;
}

// Beschleuniger aus dem Tages-Loop
export const STANDUP_LAB_SPEEDUP_MS = 30 * 60e3;          // jeder Standup verkürzt laufende Projekte um 30 min …
export const STANDUP_WEEK_LAB_SPEEDUP_MS = 2 * 3600e3;    // … am 7. Streak-Tag um 2 h
export const OVERTIME_LAB_SPEEDUP_MS = 3 * 3600e3;        // Kaffee „Überstunden“: −3 h
