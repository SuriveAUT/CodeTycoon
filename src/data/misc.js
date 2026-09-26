export const RESOURCES = ['scrap', 'energy', 'alloy', 'components', 'data', 'research', 'influence', 'relics'];

export const zeroResources = () => RESOURCES.reduce((o, r) => (o[r] = 0, o), {});

export const COLONY_MAX_LEVEL = 15;

export const RESOURCE_LABELS = {
  scrap: 'Code', energy: 'Revenue', alloy: 'Bugs', components: 'Module',
  data: 'Users', research: 'Ideas', influence: 'Hype', relics: 'Legacy Code'
};

export const RESOURCE_LORE = {
  scrap: 'Lines of Code. Die Basis für alles – Gehälter, Server, Releases.',
  energy: 'Euros, Dollar, Kaffee. Hält den Betrieb am Laufen und füttert Konverter.',
  alloy: 'Unvermeidbares Nebenprodukt komplexer Systeme. Wird zu Modulen verarbeitet.',
  components: 'Wiederverwendbare Code-Schnipsel und NPM-Packages. Für Growth und Releases.',
  data: 'Aktive Nutzer. Werden von Brainstorming zu Ideas und von Archäologen zu Legacy Code.',
  research: 'Brainstorming-Ergebnisse. Schalten neue Technologien frei.',
  influence: 'Social-Media-Präsenz, Hacker-News-Upvotes. Nötig für Standorte und große Releases.',
  relics: 'Uralter, unantastbarer Code, der magisch funktioniert. Selten und wertvoll.'
};

export const WORLDS = [
  { id: 'barren', name: 'Mamas Keller', icon: '🏠', theme: 'starter', bonus: { scrapMult: 1.08, allMult: 1.01 }, desc: 'Günstig, gemütlich, Code +8%.' },
  { id: 'verdant', name: 'Neo-Berlin', icon: '🇩🇪', theme: 'berlin', bonus: { alloyMult: 1.20, componentsMult: 1.10, scrapMult: 1.05 }, desc: 'Bugs +20%, Module +10%, Code +5%.' },
  { id: 'halo', name: 'Silicon Valley', icon: '🌉', theme: 'valley', bonus: { energyMult: 1.15, buildingCostMult: 0.90, allMult: 1.04 }, desc: 'Revenue +15%, Gebäude 10% günstiger, Gesamt +4%.' },
  { id: 'crystal', name: 'Night-City', icon: '🌃', theme: 'nightcity', bonus: { relicChance: 0.06, relicMult: 1.25, influenceMult: 1.08 }, desc: 'Legacy +25%, Fundchance +6%, Hype +8%.' },
  { id: 'forge', name: 'Neo-Tokyo', icon: '🗼', theme: 'tokyo', bonus: { componentsMult: 1.15, dataMult: 1.10, converterInputMult: 0.85 }, desc: 'Module +15%, Users +10%, Konverter-Verbrauch −15%.' },
  { id: 'void', name: 'Lagos Tech Hub', icon: '🌍', theme: 'lagos', bonus: { influenceMult: 1.20, expeditionSpeed: 1.15, expeditionPower: 0.12 }, desc: 'Hype +20%, Aufträge 15% schneller.' }
];

export const FOCI = [
  { id: 'extraction', name: 'Crunch Time', desc: 'Mehr Code und Bugs.' },
  { id: 'science', name: 'Brainstorming', desc: 'Mehr Ideas und Users.' },
  { id: 'industry', name: 'Refactoring', desc: 'Mehr Module und Bugs.' },
  { id: 'diplomacy', name: 'Marketing', desc: 'Mehr Hype, günstigere Gebäude.' },
  { id: 'relics', name: 'Code Archeology', desc: 'Mehr Legacy Code und Fundchance.' },
  { id: 'stability', name: 'Work-Life Balance', desc: 'Höhere Gesamtproduktivität und Event-Resistenz.' }
];

export const DOCTRINES = [
  { id: 'efficiency', name: 'Move Fast & Break Things', desc: 'Produktivität hoch, Kosten runter.', effects: ['+6% Gesamtproduktion', '−3% Gebäudekosten'] },
  { id: 'expansion', name: 'Hypergrowth', desc: 'Standorte und Freelancer werden stärker.', effects: ['+2% Gesamtproduktion', '+8% Auftrags-Power', '+1 Standort-Limit'] },
  { id: 'insight', name: 'Engineering Excellence', desc: 'Lernen und Legacy Code profitieren.', effects: ['+12% Ideas', '+10% Legacy Code', '+2% Fundchance'] },
  { id: 'dominion', name: 'Monopol', desc: 'Hype, Releases und Stressresistenz.', effects: ['+12% Hype', '−5% Release-Kosten', '+3% Event-Resistenz'] }
];

export const OPERATIONS_MODES = [
  { id: 'balanced', name: 'Agile Standard', desc: 'Normale 40-Stunden-Woche. Keine Modifikatoren.' },
  { id: 'efficiency', name: 'Vier-Tage-Woche', desc: 'Konverter verbrauchen 18% weniger, Gesamt-Output −6%.' },
  { id: 'overdrive', name: 'Death March', desc: 'Bugs, Module und Users +12%, Konverter verbrauchen 25% mehr.' },
  { id: 'survey', name: 'Hackathon', desc: 'Ideas und Users +18%, Code −8% und Revenue −6%.' }
];

export const PROTOCOLS = [
  {
    id: 'resource_surge', name: 'Kaffee-Injektion', desc: 'Kurzzeitig +55% Code und Revenue.',
    prereq: ['javascript_core'], duration: 45, cooldown: 210,
    cost: { research: 60 }, effects: { scrapMult: 1.55, energyMult: 1.55 }
  },
  {
    id: 'precision_window', name: 'Code Freeze', desc: 'Konverter verbrauchen 32% weniger, Gesamt +5%.',
    prereq: ['typescript_static'], duration: 60, cooldown: 260,
    cost: { research: 200, data: 100 }, effects: { converterInputMult: 0.68, allMult: 1.05 }
  },
  {
    id: 'relay_bloom', name: 'Viral gehen', desc: 'Hype +35%, Aufträge schneller und stärker.',
    prereq: ['seo_optimization'], duration: 50, cooldown: 260,
    cost: { research: 800, influence: 60 }, effects: { influenceMult: 1.35, expeditionSpeed: 1.2, expeditionPower: 0.35 }
  },
  {
    id: 'insight_wave', name: 'Schwerer Bug (P1)', desc: 'Alles steht still: Users +40%, Ideas +60%.',
    prereq: ['docker_containers'], duration: 55, cooldown: 300,
    cost: { research: 1500, components: 40 }, effects: { dataMult: 1.4, researchMult: 1.6 }
  }
];

// Freelance-Aufträge. duration in Sekunden. `rewards` sind Basiswerte, dazu kommt
// `yieldFraction` × (aktuelle Produktion × Dauer) in den genannten Ressourcen.
export const MISSIONS = [
  { id: 'survey', name: 'Bug Bounty', duration: 300, power: 1.0, yieldFraction: 0.35, rewards: { scrap: 40, research: 15 }, relicChance: 0.02, desc: 'Schnell ein paar Bugs für Kopfgeld fixen.' },
  { id: 'salvage', name: 'WordPress Fix', duration: 720, power: 1.3, yieldFraction: 0.4, rewards: { scrap: 200, energy: 60, alloy: 20 }, relicChance: 0.025, desc: 'Plugins updaten, Theme retten, Kunde glücklich.' },
  { id: 'chart', name: 'Shopify Setup', duration: 1200, power: 1.5, yieldFraction: 0.45, rewards: { energy: 300, research: 60, data: 80 }, relicChance: 0.03, desc: 'Ein Onlineshop für den Nachbarn. Zahlt gut.' },
  { id: 'diplomacy', name: 'Consulting', duration: 1800, power: 1.7, yieldFraction: 0.5, rewards: { influence: 150, research: 100, relics: 1 }, relicChance: 0.02, desc: 'Slides bauen, Buzzwords werfen, Rechnung stellen.' },
  { id: 'vault', name: 'Legacy Refactor', duration: 2700, power: 2.0, yieldFraction: 0.5, rewards: { relics: 4, research: 200, data: 300 }, relicChance: 0.08, desc: 'Uralter Code. Niemand weiß, was er tut. Er läuft.' },
  { id: 'ai_sprint', name: 'KI-Startup Sprint', duration: 3600, power: 2.2, yieldFraction: 0.55, rewards: { scrap: 3000, energy: 1500, data: 800, research: 400 }, relicChance: 0.04, desc: 'Ein Wochenende, ein Pitch, viel Koffein.' },
  { id: 'open_source_audit', name: 'Open Source Audit', duration: 4500, power: 1.8, yieldFraction: 0.5, rewards: { relics: 8, research: 500, data: 600 }, relicChance: 0.12, desc: 'Fremden Code lesen und dabei Schätze finden.' },
  { id: 'void', name: 'Enterprise Contract', duration: 7200, power: 2.6, yieldFraction: 0.6, rewards: { energy: 20000, data: 3000, relics: 6 }, relicChance: 0.07, desc: '24 Monate Laufzeit, 400 Seiten Vertrag.' },
  { id: 'dsgvo', name: 'DSGVO-Compliance', duration: 10800, power: 2.8, yieldFraction: 0.65, rewards: { data: 8000, influence: 3000, research: 2000 }, relicChance: 0.06, desc: 'Cookie-Banner für alle. Niemand hat gesagt, dass es Spaß macht.' }
];

export const ACHIEVEMENTS = [
  { id: 'scrap_100k', name: 'Hello World', desc: '100.000 Zeilen Code geschrieben.' },
  { id: 'scrap_1b', name: 'Senior-Coder', desc: '1 Milliarde Zeilen Code geschrieben.' },
  { id: 'energy_100k', name: 'Ramen Profitabel', desc: '100.000 Revenue gesammelt.' },
  { id: 'alloy_50k', name: 'Bug-Driven', desc: '50.000 Bugs verursacht.' },
  { id: 'data_50k', name: 'Traction', desc: '50.000 Nutzer erreicht.' },
  { id: 'research_25k', name: 'Ideenreich', desc: '25.000 Ideen gebrainstormt.' },
  { id: 'influence_10k', name: 'Influencer', desc: '10.000 Hype generiert.' },
  { id: 'influence_100k', name: 'Tech-Guru', desc: '100.000 Hype generiert.' },
  { id: 'relics_500', name: 'Archäologe', desc: '500 Legacy-Code-Snippets gefunden.' },
  { id: 'build_50', name: 'Start-Up', desc: '50 Mitarbeiter eingestellt.' },
  { id: 'build_200', name: 'Konzern', desc: '200 Mitarbeiter eingestellt.' },
  { id: 'build_500', name: 'Großkonzern', desc: '500 Mitarbeiter eingestellt.' },
  { id: 'milestone_1', name: 'Verdoppler', desc: 'Ersten Team-Meilenstein (×2) erreicht.' },
  { id: 'tech_5', name: 'Full-Stack', desc: '5 Technologien gelernt.' },
  { id: 'tech_15', name: 'CTO Material', desc: '15 Technologien gelernt.' },
  { id: 'tech_25', name: 'Polyglott', desc: '25 Technologien gemeistert.' },
  { id: 'project_1', name: 'MVP Launch', desc: 'Erstes Release veröffentlicht.' },
  { id: 'project_5', name: 'Serial Entrepreneur', desc: 'Fünf Releases veröffentlicht.' },
  { id: 'colony_1', name: 'Ausbau', desc: 'Ersten Standort eröffnet.' },
  { id: 'colony_4', name: 'Multinational', desc: 'Vier Standorte eröffnet.' },
  { id: 'colony_6', name: 'Multinational+', desc: 'Sechs Standorte weltweit.' },
  { id: 'exp_5', name: 'Side Hustle', desc: 'Fünf Freelance-Aufträge abgeschlossen.' },
  { id: 'exp_25', name: 'Agentur', desc: '25 Freelance-Aufträge abgeschlossen.' },
  { id: 'exp_50', name: 'Freelance-König', desc: '50 Freelance-Aufträge abgeschlossen.' },
  { id: 'artifact_1', name: 'Open Source', desc: 'Ersten Fund gesichert.' },
  { id: 'artifact_6', name: 'Contributor', desc: 'Sechs Funde gesichert.' },
  { id: 'quests_10', name: 'Sprint-Held', desc: '10 Aufgaben abgeschlossen.' },
  { id: 'doctrine', name: 'Culture Fit', desc: 'Core Values definiert.' },
  { id: 'prestige_1', name: 'Pivot', desc: 'Einmal refactored.' },
  { id: 'prestige_5', name: 'Serial Pivot', desc: '1.000 XP über alle Refactors verdient.' },
  { id: 'prestige_10', name: 'Seriengründer', desc: '10.000 XP über alle Refactors verdient.' },
  { id: 'world_engine', name: 'Monopol', desc: 'Das eigene Betriebssystem gebaut.' },
  { id: 'singularity', name: 'Web 3.0', desc: 'Das Internet neu erfunden.' },
  { id: 'clicks_1k', name: 'Hackerman', desc: '1.000 Tastenanschläge.' },
  { id: 'clicks_50k', name: 'Mechanische Tastatur', desc: '50.000 Tastenanschläge.' },
  { id: 'clicks_100k', name: 'Karpaltunnel', desc: '100.000 Tastenanschläge.' },
  { id: 'streak_7', name: 'Daily Driver', desc: '7 Tage in Folge beim Daily Standup.' },
  { id: 'streak_30', name: 'Routine', desc: '30 Tage in Folge beim Daily Standup.' },
  { id: 'tickets_50', name: 'Ticket-Maschine', desc: '50 Tages-Tickets erledigt.' },
  { id: 'coffee_10', name: 'Koffein-Junkie', desc: '10 Kaffee getrunken.' },
  { id: 'bugs_25', name: 'Bug-Jäger', desc: '25 fliegende Bugs gefangen.' },
  { id: 'sprint_1', name: 'Sprint-Finisher', desc: 'Ersten Sprint abgeschlossen.' },
  { id: 'sprints_all', name: 'Marathon', desc: 'Alle Sprints abgeschlossen.' },
  { id: 'playtime_1d', name: 'All-Nighter', desc: '24 Stunden Uptime.' },
  { id: 'playtime_7d', name: 'Crunch Week', desc: '7 Tage Uptime.' },
  { id: 'playtime_30d', name: 'Burnout', desc: '30 Tage Uptime.' }
];

// Chronicle-Upgrades: mit XP kaufbar, bleiben für immer. `max` optional.
export const CHRONICLE_UPGRADES = [
  { id: 'origin', name: 'Clean Architecture', desc: 'Gesamtproduktion +8% pro Stufe.', base: 5 },
  { id: 'monument', name: 'Seed Funding', desc: 'Startkapital und Start-Team steigen, Gesamt +2,5% pro Stufe.', base: 8 },
  { id: 'deep_time', name: 'Async Workflow', desc: 'Offline-Limit +1,5h pro Stufe.', base: 8 },
  { id: 'bureau', name: 'Management-Overhead', desc: 'Auto-Skripte kaufen 10% aggressiver pro Stufe.', base: 10 },
  { id: 'logistics', name: 'Remote-First', desc: 'Standort-Limit +1 alle zwei Stufen.', base: 15 },
  { id: 'resonance', name: 'Tech Debt Mastery', desc: 'Legacy Code +8% und Fundchance +0,5% pro Stufe.', base: 18 },
  { id: 'funds', name: 'Series A', desc: 'Gebäude und Releases 3% günstiger pro Stufe.', base: 25 },
  { id: 'epoch', name: 'IPO', desc: 'XP-Gewinn +10% pro Stufe.', base: 30 },
  { id: 'time_dilation', name: '4-Tage-Woche', desc: 'Offline-Effizienz +10% pro Stufe (50% → max. 90%).', base: 40, max: 4 },
  { id: 'infinite_synergy', name: 'Synergie-Effekte', desc: 'Gesamtproduktion +15% pro Stufe (endlos).', base: 80 },
  { id: 'quantum_click', name: '10x Typist', desc: 'Jeder Klick bringt zusätzlich 0,5% der Code-Produktion pro Sekunde, pro Stufe.', base: 100, max: 10 }
];

export const CHRONICLE_COST_GROWTH = 1.32;

// XP-Kosten der Stufe `lvl` → `lvl + 1` eines Chronicle-Upgrades
export function chronicleCostFor(id, lvl) {
  const def = CHRONICLE_UPGRADES.find(x => x.id === id);
  if (!def) return Infinity;
  return Math.floor(def.base * Math.pow(CHRONICLE_COST_GROWTH, lvl));
}

// Permanente Meilensteine: einmal freigeschaltet, für immer aktiv (auch nach Prestige).
export const PRESTIGE_MILESTONES = [
  { id: 'pm_lifetime_1h', name: 'Marathon-Session', desc: '1 Stunde Gesamtspielzeit.', condition: (s) => s.stats.lifetime >= 3600, effects: { allMult: 1.03 }, label: 'Gesamt +3%' },
  { id: 'pm_clicks_1k', name: 'Keyboard-Warrior', desc: '1.000 manuelle Klicks.', condition: (s) => (s.stats.manualClicks || 0) >= 1000, effects: { clickPowerMult: 1.15 }, label: 'Klick +15%' },
  { id: 'pm_clicks_50k', name: 'RSI-Held', desc: '50.000 manuelle Klicks.', condition: (s) => (s.stats.manualClicks || 0) >= 50000, effects: { clickPowerMult: 1.30 }, label: 'Klick +30%' },
  { id: 'pm_scrap_100m', name: '100M Lines of Code', desc: '100 Millionen Code in der Lebenszeit.', condition: (s) => (s.stats.total?.scrap || 0) >= 1e8, effects: { scrapMult: 1.10 }, label: 'Code +10%' },
  { id: 'pm_scrap_1b', name: 'Senior-Dev', desc: '1 Milliarde Code in der Lebenszeit.', condition: (s) => (s.stats.total?.scrap || 0) >= 1e9, effects: { scrapMult: 1.20, allMult: 1.05 }, label: 'Code +20%, Gesamt +5%' },
  { id: 'pm_research_50m', name: 'Deep Tech', desc: '5 Millionen Ideas in der Lebenszeit.', condition: (s) => (s.stats.total?.research || 0) >= 5e6, effects: { researchMult: 1.10, researchCostMult: 0.95 }, label: 'Ideas +10%, Forschung −5%' },
  { id: 'pm_expeditions_25', name: 'On-Site-Veteran', desc: '25 Aufträge abgeschlossen.', condition: (s) => s.stats.expeditionsDone >= 25, effects: { expeditionRewardMult: 0.10 }, label: 'Auftrags-Belohnung +10%' },
  { id: 'pm_expeditions_100', name: 'Globetrotter', desc: '100 Aufträge abgeschlossen.', condition: (s) => s.stats.expeditionsDone >= 100, effects: { expeditionRewardMult: 0.20, expeditionSpeed: 1.10 }, label: 'Belohnung +20%, Aufträge 10% schneller' },
  { id: 'pm_first_prestige', name: 'Erster Neustart', desc: 'Den ersten Hard Refactor durchgeführt.', condition: (s) => s.stats.prestigeCount >= 1, effects: { allMult: 1.05 }, label: 'Gesamt +5%' },
  { id: 'pm_prestige_3', name: 'Serienentwickler', desc: '250 XP über alle Refactors verdient.', condition: (s) => (s.stats.xpEarned || 0) >= 250, effects: { allMult: 1.10 }, label: 'Gesamt +10%' },
  { id: 'pm_prestige_5', name: 'Veteranen-Coder', desc: '2.500 XP über alle Refactors verdient.', condition: (s) => (s.stats.xpEarned || 0) >= 2500, effects: { allMult: 1.15, researchMult: 1.10 }, label: 'Gesamt +15%, Ideas +10%' },
  { id: 'pm_streak_14', name: 'Zwei Wochen Standup', desc: '14 Tage in Folge beim Daily Standup.', condition: (s) => (s.daily?.bestStreak || 0) >= 14, effects: { offlineCapHours: 2 }, label: 'Offline-Limit +2h' },
  { id: 'pm_sprints_3', name: 'Sprint-Veteran', desc: 'Drei Sprints abgeschlossen.', condition: (s) => (s.challengesDone || []).length >= 3, effects: { allMult: 1.10 }, label: 'Gesamt +10%' },
  { id: 'pm_prestige_10', name: 'Hardcore-Optimierer', desc: '25.000 XP über alle Refactors verdient.', condition: (s) => (s.stats.xpEarned || 0) >= 25000, effects: { allMult: 1.20, clickPowerMult: 1.25 }, label: 'Gesamt +20%, Klick +25%' }
];
