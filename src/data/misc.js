export const RESOURCES = ['scrap', 'energy', 'alloy', 'components', 'data', 'research', 'influence', 'relics'];

export const RESOURCE_LABELS = {
  scrap: 'Code', energy: 'Revenue', alloy: 'Bugs', components: 'Module',
  data: 'Users', research: 'Ideas', influence: 'Hype', relics: 'Legacy Code'
};

export const WORLDS = [
  { id: 'barren', name: 'Mamas Keller', icon: '🏠', theme: 'starter', bonus: { scrapMult: 1.08, allMult: 1.01 } },
  { id: 'verdant', name: 'Neo-Berlin', icon: '🇩🇪', theme: 'berlin', bonus: { alloyMult: 1.20, componentsMult: 1.10, scrapMult: 1.05 } },
  { id: 'halo', name: 'Silicon Valley', icon: '🌉', theme: 'valley', bonus: { energyMult: 1.15, buildingCostMult: 0.90, allMult: 1.04 } },
  { id: 'crystal', name: 'Night-City', icon: '🌃', theme: 'nightcity', bonus: { relicChance: 0.06, relicMult: 1.25, influenceMult: 1.08 } },
  { id: 'forge', name: 'Neo-Tokyo', icon: '🗼', theme: 'tokyo', bonus: { componentsMult: 1.15, dataMult: 1.10, converterInputMult: 0.85 } },
  { id: 'void', name: 'Lagos Tech Hub', icon: '🌍', theme: 'lagos', bonus: { influenceMult: 1.20, expeditionSpeed: 1.15, expeditionPower: 0.12 } }
];

export const FOCI = [
  { id: 'extraction', name: 'Crunch Time', desc: 'Mehr Code und Bugs.' },
  { id: 'science', name: 'Brainstorming', desc: 'Mehr Ideas und Users.' },
  { id: 'industry', name: 'Refactoring', desc: 'Mehr Module und Bugs.' },
  { id: 'diplomacy', name: 'Marketing', desc: 'Mehr Hype, günstigere Mieten.' },
  { id: 'relics', name: 'Code Archeology', desc: 'Mehr Legacy Code und Fundchance.' },
  { id: 'stability', name: 'Work-Life Balance', desc: 'Höhere Gesamtproduktivität und Zufriedenheit.' }
];

export const DOCTRINES = [
  { id: 'efficiency', name: 'Move Fast & Break Things', desc: 'Produktivität hoch, Kosten runter. (Zuckerberg Style)' },
  { id: 'expansion', name: 'Hypergrowth', desc: 'Standorte und Freelancer werden stärker.' },
  { id: 'insight', name: 'Engineering Excellence', desc: 'Lernen, Legacy Code und Open Source profitieren.' },
  { id: 'dominion', name: 'Monopol', desc: 'Hype, Software-Releases und Stressresistenz.' }
];

export const OPERATIONS_MODES = [
  { id: 'balanced', name: 'Agile Standard', desc: 'Normale 40-Stunden Woche. Keine Sonderrisiken (Standard).' },
  { id: 'efficiency', name: 'Vier-Tage-Woche', desc: 'Weniger Input-Kosten (-18%), dafür leicht geringerer Gesamt-Output (-6%).' },
  { id: 'overdrive', name: 'Death March', desc: 'Massiver Output (+30%), aber deutlich höhere Input-Kosten (+25%).' },
  { id: 'survey', name: 'Hackathon', desc: 'Fokus auf Analyse. Mehr Ideas/Users (+25%), dafür etwas weniger Code (-15%).' }
];

export const PROTOCOLS = [
  {
    id: 'resource_surge',
    name: 'Kaffee-Injektion',
    desc: 'Kurzzeitig massiv mehr Code und Revenue.',
    prereq: ['javascript_core'],
    duration: 45,
    cooldown: 210,
    cost: { data: 300, research: 120 },
    effects: { scrapMult: 1.55, energyMult: 1.55 }
  },
  {
    id: 'precision_window',
    name: 'Code Freeze',
    desc: 'Server und QA verbrauchen deutlich weniger Ressourcen.',
    prereq: ['typescript_static'],
    duration: 60,
    cooldown: 260,
    cost: { data: 800, research: 260, influence: 80 },
    effects: { converterInputMult: 0.68, allMult: 1.05 }
  },
  {
    id: 'relay_bloom',
    name: 'Viral gehen',
    desc: 'Temporärer Fokus auf Hype und Freelance-Performance.',
    prereq: ['react_framework'],
    duration: 50,
    cooldown: 260,
    cost: { research: 400, influence: 220, relics: 3 },
    effects: { influenceMult: 1.35, expeditionSpeed: 1.2, expeditionPower: 0.35 }
  },
  {
    id: 'insight_wave',
    name: 'Schwerer Bug (P1)',
    desc: 'Alles steht still, Fokus voll auf Analyse und Ideas.',
    prereq: ['docker_containers'],
    duration: 55,
    cooldown: 300,
    cost: { data: 1200, research: 650, components: 180 },
    effects: { dataMult: 1.4, researchMult: 1.6 }
  }
];

export const MISSIONS = [
  { id: 'survey', name: 'Bug Bounty', duration: 1200, power: 1.0, rewards: { data: 200, research: 40, influence: 12 }, relicChance: 0.02 },
  { id: 'salvage', name: 'Wordpress Fix', duration: 2400, power: 1.3, rewards: { scrap: 1500, alloy: 250, components: 60 }, relicChance: 0.025 },
  { id: 'chart', name: 'Shopify Setup', duration: 3600, power: 1.5, rewards: { research: 150, influence: 80, data: 300 }, relicChance: 0.03 },
  { id: 'vault', name: 'Legacy Refactor', duration: 5400, power: 2.0, rewards: { relics: 5, research: 120, data: 350 }, relicChance: 0.08 },
  { id: 'diplomacy', name: 'Consulting', duration: 3600, power: 1.7, rewards: { influence: 250, research: 60, relics: 2 }, relicChance: 0.015 },
  { id: 'void', name: 'Enterprise Contract', duration: 7200, power: 2.6, rewards: { data: 800, relics: 4, research: 150 }, relicChance: 0.07 },
  { id: 'ai_sprint', name: 'KI-Startup Sprint', duration: 5400, power: 2.2, rewards: { scrap: 2000, energy: 1500, data: 600, research: 200 }, relicChance: 0.04 },
  { id: 'open_source_audit', name: 'Open Source Audit', duration: 4800, power: 1.8, rewards: { relics: 8, research: 200, data: 400 }, relicChance: 0.12 },
  { id: 'dsgvo', name: 'DSGVO-Compliance', duration: 8400, power: 2.8, rewards: { data: 1200, influence: 400, research: 180 }, relicChance: 0.06 }
];

export const ACHIEVEMENTS = [
  { id: 'scrap_100k', name: 'Hello World', desc: '100.000 Lines of Code geschrieben.' },
  { id: 'energy_100k', name: 'Ramen Profitabel', desc: '100.000 Revenue gesammelt.' },
  { id: 'alloy_50k', name: 'Bug-Driven', desc: '50.000 Bugs verursacht.' },
  { id: 'data_50k', name: 'Traction', desc: '50.000 Nutzer erreicht.' },
  { id: 'research_25k', name: 'Ideenreich', desc: '25.000 Ideen gebrainstormt.' },
  { id: 'influence_10k', name: 'Influencer', desc: '10.000 Hype generiert.' },
  { id: 'relics_500', name: 'Archeologe', desc: '500 Legacy Code Snippets gefunden.' },
  { id: 'build_50', name: 'Start-Up', desc: '50 Mitarbeiter eingestellt.' },
  { id: 'build_200', name: 'Konzern', desc: '200 Mitarbeiter eingestellt.' },
  { id: 'tech_5', name: 'Full-Stack', desc: '5 Frameworks gelernt.' },
  { id: 'tech_15', name: 'CTO Material', desc: '15 Frameworks gelernt.' },
  { id: 'project_1', name: 'MVP Launch', desc: 'Erstes Produkt veröffentlicht.' },
  { id: 'project_5', name: 'Serial Entrepreneur', desc: 'Fünf Produkte veröffentlicht.' },
  { id: 'colony_1', name: 'Ausbau', desc: 'Erstes Büro eröffnet.' },
  { id: 'colony_4', name: 'Multinational', desc: 'Vier Büros eröffnet.' },
  { id: 'exp_5', name: 'Side Hustle', desc: 'Fünf Freelance-Aufträge abgeschlossen.' },
  { id: 'exp_25', name: 'Agentur', desc: '25 Freelance-Aufträge abgeschlossen.' },
  { id: 'artifact_1', name: 'Open Source', desc: 'Ein Repo geforked.' },
  { id: 'artifact_6', name: 'Contributor', desc: 'Sechs Repos geforked.' },
  { id: 'doctrine', name: 'Culture Fit', desc: 'Core Values definiert.' },
  { id: 'prestige_1', name: 'Pivot', desc: 'Einmal das Geschäftsmodell gewechselt (Refactor).' },
  { id: 'prestige_5', name: 'Serial Pivot', desc: 'Fünfmal refactored.' },
  { id: 'world_engine', name: 'Monopol', desc: 'Das eigene Betriebssystem gebaut.' },
  { id: 'singularity', name: 'Web 3.0', desc: 'Das Internet neu erfunden.' },
  { id: 'clicks_1k', name: 'Hackerman', desc: '1.000 Tastenanschläge.' },
  { id: 'clicks_50k', name: 'Mechanische Tastatur', desc: '50.000 Tastenanschläge.' },
  { id: 'clicks_100k', name: 'Karpaltunnel', desc: '100.000 Tastenanschläge.' },
  { id: 'playtime_1d', name: 'All-Nighter', desc: '24 Stunden Uptime.' },
  { id: 'playtime_7d', name: 'Crunch Week', desc: '7 Tage Uptime.' },
  { id: 'playtime_30d', name: 'Burnout', desc: '30 Tage Uptime.' },
  { id: 'build_500', name: 'Großkonzern', desc: '500 Mitarbeiter eingestellt.' },
  { id: 'tech_25', name: 'Polyglott', desc: '25 Frameworks gemeistert.' },
  { id: 'exp_50', name: 'Freelance-König', desc: '50 Freelance-Aufträge abgeschlossen.' },
  { id: 'colony_6', name: 'Multinational+', desc: 'Sechs Büros weltweit.' },
  { id: 'prestige_10', name: 'Seriengründer', desc: 'Zehnmal neu gestartet.' },
  { id: 'scrap_1b', name: 'Senior-Coder', desc: '1 Milliarde Lines of Code geschrieben.' },
  { id: 'influence_100k', name: 'Tech-Guru', desc: '100.000 Hype generiert.' }
];

export const CHRONICLE_UPGRADES = [
  { id: 'origin', name: 'Clean Architecture', desc: 'Produktivität +5% pro Stufe.', base: 5 },
  { id: 'deep_time', name: 'Async Workflow', desc: 'CI/CD Limit +1h pro Stufe.', base: 8 },
  { id: 'bureau', name: 'Management-Overhead', desc: 'Auto-Skripte +8% pro Stufe.', base: 8 },
  { id: 'monument', name: 'Seed Funding', desc: 'Startkapital steigt pro Stufe.', base: 12 },
  { id: 'logistics', name: 'Remote-First', desc: 'Büro-Limit steigt alle zwei Stufen.', base: 15 },
  { id: 'resonance', name: 'Tech Debt Mastery', desc: 'Legacy Code und Repos +8% pro Stufe.', base: 18 },
  { id: 'funds', name: 'Series A', desc: 'Gehälter und Serverkosten sinken pro Stufe.', base: 25 },
  { id: 'epoch', name: 'IPO', desc: 'XP-Ausbeute +10% pro Stufe.', base: 30 },
  { id: 'time_dilation', name: '4-Tage Woche', desc: 'Server Uptime Effizienz +10% pro Stufe (Start: 50%, Max: 80%).', base: 40 },
  { id: 'infinite_synergy', name: 'Synergie-Effekte', desc: 'Team-Synergien +12% pro Stufe (endlos).', base: 80 },
  { id: 'quantum_click', name: '10x Typist', desc: 'Tastenanschlag-Kraft x2 pro Stufe (endlos).', base: 100 }
];




