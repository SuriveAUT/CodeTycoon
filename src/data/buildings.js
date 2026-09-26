// buildings.js – Alle Gebäude / Mitarbeiter.
//
// Balancing-Grundsätze (Rework):
//  - Kosten wachsen pro Kauf um `growth` (1.15 für Producer/Converter, 1.6 für Modifier).
//  - Modifier wirken bis 20 Stück (MODIFIER_CAP in store/bonuses.js).
//  - Jede Stufe kostet ~8-12x mehr als die vorherige und produziert ~5-7x mehr.
//  - Converter verbrauchen echten Vorrat (siehe store/bonuses.js → simulateProduction).
//    `inputs` sind Einheiten pro produzierter Output-Einheit, `rate` ist Output/s pro Gebäude.
//  - Alle Werte sind Basiswerte ohne Multiplikatoren.

export const CATEGORIES = [
  { id: 'Dev Team', icon: 'scrap', desc: 'Produziert Code – die Basis für alles.' },
  { id: 'Sales & Ads', icon: 'energy', desc: 'Produziert Revenue. Wird für Gehälter, Konverter und Expansion gebraucht.' },
  { id: 'QA & DevOps', icon: 'alloy', desc: 'Wandelt Code in Bugs und Bugs in Module um.' },
  { id: 'Marketing & R&D', icon: 'research', desc: 'Erzeugt Ideas (Forschung) und Users.' },
  { id: 'Social Media', icon: 'influence', desc: 'Erzeugt Hype und gräbt Legacy Code aus.' },
  { id: 'Management', icon: 'briefcase', desc: 'Passive Boni auf das ganze Unternehmen.' },
];

export const BUILDINGS = [
  // ───────────────────────── Dev Team (Code) ─────────────────────────
  { id: 'intern', name: 'Praktikant', category: 'Dev Team', type: 'producer', unlock: 'start',
    cost: { scrap: 15 }, growth: 1.15, rate: 0.2, outputs: { scrap: 1 },
    desc: 'Kopiert Code von StackOverflow. Manchmal kompiliert es sogar.' },
  { id: 'junior_dev', name: 'Junior Dev', category: 'Dev Team', type: 'producer', unlock: 'tech:frontend_basics',
    cost: { scrap: 120 }, growth: 1.15, rate: 1.2, outputs: { scrap: 1 },
    desc: 'Schreibt viel Code. Versteht wenig davon.' },
  { id: 'code_monkey', name: 'Code Monkey', category: 'Dev Team', type: 'producer', unlock: 'tech:typescript_static',
    cost: { scrap: 1300, energy: 450 }, growth: 1.15, rate: 8, outputs: { scrap: 1 },
    desc: 'Tippt ab, was ChatGPT ausspuckt. Fragt nie warum.' },
  { id: 'mid_dev', name: 'Mid-Level Dev', category: 'Dev Team', type: 'producer', unlock: 'tech:docker_containers',
    cost: { scrap: 14000, energy: 5500 }, growth: 1.15, rate: 50, outputs: { scrap: 1 },
    desc: 'Solides Arbeitstier. Beschwert sich über die Codebase.' },
  { id: 'staff_engineer', name: 'Staff Engineer', category: 'Dev Team', type: 'producer', unlock: 'tech:cicd_pipelines',
    cost: { scrap: 150000, energy: 60000 }, growth: 1.15, rate: 300, outputs: { scrap: 1 },
    desc: 'Macht Code-Reviews und sagt "eigentlich hätte man das anders lösen können".' },
  { id: 'senior_dev', name: 'Senior Dev', category: 'Dev Team', type: 'producer', unlock: 'tech:microservices_arch',
    cost: { scrap: 1.8e6, energy: 7e5 }, growth: 1.15, rate: 1800, outputs: { scrap: 1 },
    desc: 'Schreibt in einer Stunde mehr als Praktikanten im Jahr.' },
  { id: 'tech_lead', name: 'Tech Lead', category: 'Dev Team', type: 'producer', unlock: 'tech:kubernetes_orch',
    cost: { scrap: 2.2e7, energy: 9e6 }, growth: 1.15, rate: 11000, outputs: { scrap: 1 },
    desc: 'Meetings und Architektur. Wenn sie coden, bebt die Erde.' },
  { id: 'principal_eng', name: 'Principal Engineer', category: 'Dev Team', type: 'producer', unlock: 'tech:machine_learning',
    cost: { scrap: 2.8e8, energy: 1.1e8 }, growth: 1.15, rate: 65000, outputs: { scrap: 1 },
    desc: 'Legende, die in Vim codet. Ohne Plugins.' },
  { id: 'ai_copilot', name: 'KI Co-Pilot', category: 'Dev Team', type: 'producer', unlock: 'tech:autogpt_agents',
    cost: { scrap: 3.6e9, energy: 1.4e9 }, growth: 1.15, rate: 400000, outputs: { scrap: 1 },
    desc: 'Generiert Code in Lichtgeschwindigkeit. Halluziniert nur selten.' },
  { id: 'ten_x_dev', name: '10x Developer', category: 'Dev Team', type: 'producer', unlock: 'tech:agi_completion',
    cost: { scrap: 5e10, energy: 2e10 }, growth: 1.15, rate: 2.5e6, outputs: { scrap: 1 },
    desc: 'Mythologisches Wesen. Schreibt das Universum in C neu.' },
  { id: 'platform_engineer', name: 'Platform Engineer', category: 'Dev Team', type: 'producer', unlock: 'tech:platform_apis',
    cost: { scrap: 7e11, energy: 2.8e11 }, growth: 1.15, rate: 1.6e7, outputs: { scrap: 1 },
    desc: 'Baut Werkzeuge, mit denen andere Werkzeuge bauen.' },

  // ───────────────────────── Sales & Ads (Revenue) ─────────────────────────
  { id: 'google_ads', name: 'Google Ads', category: 'Sales & Ads', type: 'producer', unlock: 'start',
    cost: { scrap: 25 }, growth: 1.15, rate: 0.15, outputs: { energy: 1 },
    desc: 'Bitte klick auf die Banner.' },
  { id: 'freemium_model', name: 'Freemium Modell', category: 'Sales & Ads', type: 'producer', unlock: 'tech:javascript_core',
    cost: { scrap: 220 }, growth: 1.15, rate: 0.7, outputs: { energy: 1 },
    desc: 'Lockt sie an, zockt sie ab.' },
  { id: 'viral_app', name: 'Viral App', category: 'Sales & Ads', type: 'producer', unlock: 'tech:react_framework',
    cost: { scrap: 2400, energy: 700 }, growth: 1.15, rate: 4.5, outputs: { energy: 1 },
    desc: 'Eine Million Downloads, null Gewinn. Erzählt aber gern davon.' },
  { id: 'subscription_trap', name: 'Abo-Falle', category: 'Sales & Ads', type: 'producer', unlock: 'tech:seo_optimization',
    cost: { scrap: 26000, energy: 9000 }, growth: 1.15, rate: 28, outputs: { energy: 1 },
    desc: 'Monatlich kündbar (nach 24 Monaten).' },
  { id: 'hedge_fund', name: 'Hedge Fonds', category: 'Sales & Ads', type: 'producer', unlock: 'tech:serverless_arch',
    cost: { scrap: 2.8e5, energy: 1e5 }, growth: 1.15, rate: 170, outputs: { energy: 1 },
    desc: 'Kauft Tech-Aktien. Irgendwie verdient man dabei immer Geld.' },
  { id: 'b2b_licenses', name: 'B2B Lizenzen', category: 'Sales & Ads', type: 'producer', unlock: 'tech:graphql',
    cost: { scrap: 3.3e6, energy: 1.2e6 }, growth: 1.15, rate: 1000, outputs: { energy: 1 },
    desc: 'Unternehmen zahlen jeden Preis für "Enterprise Ready".' },
  { id: 'data_mining', name: 'Data Mining', category: 'Sales & Ads', type: 'producer', unlock: 'tech:big_data_analytics',
    cost: { scrap: 4e7, energy: 1.5e7 }, growth: 1.15, rate: 6000, outputs: { energy: 1 },
    desc: 'Wir verkaufen eure Daten. Offiziell natürlich anonymisiert.' },
  { id: 'crypto_scam', name: 'Crypto Token', category: 'Sales & Ads', type: 'producer', unlock: 'tech:time_tracking',
    cost: { scrap: 5e8, energy: 2e8 }, growth: 1.15, rate: 36000, outputs: { energy: 1 },
    desc: 'Ein neuer Token. To the moon!' },
  { id: 'gov_contracts', name: 'Gov Contracts', category: 'Sales & Ads', type: 'producer', unlock: 'tech:generative_ai',
    cost: { scrap: 6.5e9, energy: 2.5e9 }, growth: 1.15, rate: 220000, outputs: { energy: 1 },
    desc: 'Regierungsaufträge. Unendlich Budget, null Deadline.' },
  { id: 'tech_monopoly', name: 'Tech Monopol', category: 'Sales & Ads', type: 'producer', unlock: 'tech:agi_completion',
    cost: { scrap: 9e10, energy: 3.5e10 }, growth: 1.15, rate: 1.4e6, outputs: { energy: 1 },
    desc: 'Du besitzt das Internet. Alle zahlen Miete.' },
  { id: 'marketplace', name: 'Marktplatz', category: 'Sales & Ads', type: 'producer', unlock: 'tech:marketplace_tech',
    cost: { scrap: 1.2e12, energy: 5e11 }, growth: 1.15, rate: 9e6, outputs: { energy: 1 },
    desc: 'Alle handeln bei dir. Du nimmst 30 % Gebühr.' },

  // ───────────────────────── QA & DevOps (Bugs → Module) ─────────────────────────
  { id: 'qa_tester', name: 'QA Tester', category: 'QA & DevOps', type: 'converter', unlock: 'tech:backend_node',
    cost: { scrap: 300, energy: 100 }, growth: 1.15, rate: 0.5, inputs: { scrap: 2 }, outputs: { alloy: 1 },
    desc: 'Findet Bugs in deinem Code. Zerstört dein Selbstwertgefühl.' },
  { id: 'npm_install', name: 'NPM Install', category: 'QA & DevOps', type: 'converter', unlock: 'tech:docker_containers',
    cost: { scrap: 3000, energy: 1000, alloy: 40 }, growth: 1.15, rate: 0.25, inputs: { alloy: 2, energy: 2 }, outputs: { components: 1 },
    desc: 'Löst Bugs durch Hinzufügen von 10.000 Dependencies.' },
  { id: 'devops_engineer', name: 'DevOps Engineer', category: 'QA & DevOps', type: 'converter', unlock: 'tech:cicd_pipelines',
    cost: { scrap: 90000, energy: 35000 }, growth: 1.15, rate: 40, inputs: { scrap: 1.5 }, outputs: { alloy: 1 },
    desc: 'Crasht Production um 3 Uhr morgens und weiß warum.' },
  { id: 'package_manager', name: 'Package Manager', category: 'QA & DevOps', type: 'converter', unlock: 'tech:cicd_pipelines',
    cost: { scrap: 140000, energy: 55000, alloy: 3000 }, growth: 1.15, rate: 20, inputs: { alloy: 1.5, energy: 0.8 }, outputs: { components: 1 },
    desc: 'Bündelt Dependencies, bis node_modules größer ist als das Universum.' },
  { id: 'auto_testing', name: 'Automated Testing', category: 'QA & DevOps', type: 'converter', unlock: 'tech:big_data_analytics',
    cost: { scrap: 6e7, energy: 2.5e7 }, growth: 1.15, rate: 5000, inputs: { scrap: 1.2 }, outputs: { alloy: 1 },
    desc: 'Produziert rote CI/CD-Pipelines am Fließband.' },
  { id: 'microservices_conv', name: 'Microservices', category: 'QA & DevOps', type: 'converter', unlock: 'tech:machine_learning',
    cost: { scrap: 4e8, energy: 1.6e8, alloy: 2e6 }, growth: 1.15, rate: 3000, inputs: { alloy: 1.2, energy: 0.6 }, outputs: { components: 1 },
    desc: 'Verteilt Bugs auf hunderte Docker-Container.' },
  { id: 'chaos_monkey', name: 'Chaos Monkey', category: 'QA & DevOps', type: 'converter', unlock: 'tech:generative_ai',
    cost: { scrap: 8e9, energy: 3e9 }, growth: 1.15, rate: 300000, inputs: { scrap: 1 }, outputs: { alloy: 1 },
    desc: 'Schaltet zufällig Server ab, um die Resilienz zu testen. Findet hauptsächlich Bugs.' },

  // ───────────────────────── Marketing & R&D (Ideas + Users) ─────────────────────────
  { id: 'seo_expert', name: 'SEO Experte', category: 'Marketing & R&D', type: 'converter', unlock: 'start',
    cost: { scrap: 45, energy: 8 }, growth: 1.15, rate: 0.25, inputs: { energy: 0.5 }, outputs: { research: 1, data: 0.3 },
    desc: 'Kauft Keywords und generiert erste Nutzer und Ideen.' },
  { id: 'growth_hacker', name: 'Growth Hacker', category: 'Marketing & R&D', type: 'converter', unlock: 'tech:react_framework',
    cost: { scrap: 5000, energy: 1800, components: 25 }, growth: 1.15, rate: 3, inputs: { components: 0.4, energy: 0.6 }, outputs: { data: 1 },
    desc: 'Spammt Foren voll für aktive Nutzerzahlen.' },
  { id: 'brainstorming_lab', name: 'Brainstorming', category: 'Marketing & R&D', type: 'converter', unlock: 'tech:agile_scrum',
    cost: { scrap: 9000, energy: 3500, data: 100 }, growth: 1.15, rate: 3, inputs: { data: 0.8, energy: 1.2 }, outputs: { research: 1 },
    desc: 'User-Feedback wird zu neuen Ideen. Post-Its inklusive.' },
  { id: 'agile_workshop', name: 'Agile Workshop', category: 'Marketing & R&D', type: 'converter', unlock: 'tech:linkedin_networking',
    cost: { scrap: 8e6, energy: 3e6, data: 2e5 }, growth: 1.15, rate: 150, inputs: { data: 0.6, energy: 0.5 }, outputs: { research: 1 },
    desc: 'Dutzende Post-Its generieren massiv Ideen.' },
  { id: 'viral_campaign', name: 'Viral Campaign', category: 'Marketing & R&D', type: 'converter', unlock: 'tech:autogpt_agents',
    cost: { scrap: 2e9, energy: 8e8, components: 5e6 }, growth: 1.15, rate: 40000, inputs: { components: 0.3, energy: 0.4 }, outputs: { data: 1 },
    desc: 'Millionen neuer User durch ein Meme auf TikTok.' },

  // ───────────────────────── Social Media (Hype + Legacy) ─────────────────────────
  { id: 'tech_blogger', name: 'Tech Blogger', category: 'Social Media', type: 'converter', unlock: 'tech:seo_optimization',
    cost: { scrap: 20000, energy: 8000, research: 300 }, growth: 1.15, rate: 1, inputs: { research: 0.5, energy: 2 }, outputs: { influence: 1 },
    desc: 'Schreibt Medium-Artikel über deine Ideen und generiert Hype.' },
  { id: 'community_mgr', name: 'Community Manager', category: 'Social Media', type: 'converter', unlock: 'tech:remote_work_policy',
    cost: { scrap: 250000, energy: 100000 }, growth: 1.15, rate: 12, inputs: { energy: 1.5 }, outputs: { influence: 1 },
    desc: 'Moderiert Discord und beantwortet täglich dieselben 5 Fragen.' },
  { id: 'keynote_speaker', name: 'Keynote Speaker', category: 'Social Media', type: 'converter', unlock: 'tech:venture_capital',
    cost: { scrap: 1.2e8, energy: 5e7, research: 3e5 }, growth: 1.15, rate: 600, inputs: { research: 0.3, energy: 0.8 }, outputs: { influence: 1 },
    desc: 'Präsentiert Vaporware auf großen Tech-Konferenzen.' },
  { id: 'code_archeologist', name: 'Code-Archäologe', category: 'Social Media', type: 'converter', unlock: 'tech:stackoverflow_access',
    cost: { scrap: 45000, energy: 18000, data: 500 }, growth: 1.15, rate: 0.05, inputs: { data: 3, energy: 4 }, outputs: { relics: 1 },
    desc: 'Gräbt in SVN-Repositories nach lauffähigem Legacy Code.' },
  { id: 'stackoverflow_api', name: 'Stack Overflow API', category: 'Social Media', type: 'converter', unlock: 'tech:dark_web_scraping',
    cost: { scrap: 5e8, energy: 2e8, data: 5e6, research: 2e6 }, growth: 1.15, rate: 40, inputs: { data: 2, energy: 3 }, outputs: { relics: 1 },
    desc: 'Kopiert Codefragmente aus 2011, die magisch alles fixen.' },
  { id: 'hype_machine', name: 'Hype-Maschine', category: 'Social Media', type: 'converter', unlock: 'tech:quantum_computing',
    cost: { scrap: 2e12, energy: 8e11, research: 5e9 }, growth: 1.15, rate: 5e5, inputs: { research: 0.3, energy: 0.8 }, outputs: { influence: 1 },
    desc: 'Eine KI schreibt Pressemitteilungen, eine zweite KI teilt sie.' },
  { id: 'legacy_datacenter', name: 'Legacy-Rechenzentrum', category: 'Social Media', type: 'converter', unlock: 'tech:neural_interfaces',
    cost: { scrap: 4e12, energy: 1.6e12, data: 5e10, research: 2e10 }, growth: 1.15, rate: 5e3, inputs: { data: 2, energy: 3 }, outputs: { relics: 1 },
    desc: 'Mainframes aus den 80ern, perfekt gekühlt. Sie laufen einfach weiter.' },

  // ───────────────────────── Management (Modifier) ─────────────────────────
  { id: 'freelance_portal', name: 'Freelance Portal', category: 'Management', type: 'modifier', unlock: 'tech:freelance_platform',
    cost: { scrap: 30000, energy: 6000 }, growth: 1.6, rate: 0, outputs: {},
    desc: '+18% Auftrags-Power, +2% Auftrags-Belohnung. Jedes 4. Portal: +1 Auftrags-Slot.' },
  { id: 'hr_department', name: 'HR Department', category: 'Management', type: 'modifier', unlock: 'tech:cicd_pipelines',
    cost: { scrap: 180000, energy: 40000, alloy: 4000 }, growth: 1.6, rate: 0, outputs: {},
    desc: '+2% Standort-Output. Jedes 2. HR: +1 Standort-Limit. Obstkörbe inklusive.' },
  { id: 'scrum_master', name: 'Scrum Master', category: 'Management', type: 'modifier', unlock: 'tech:microservices_arch',
    cost: { scrap: 2e6, energy: 4e5, data: 20000 }, growth: 1.6, rate: 0, outputs: {},
    desc: '+3% Gesamtproduktion, +4% Ideas. Blockiert das Team mit Dailys, zahlt sich aber aus.' },
  { id: 'vpn_gateway', name: 'VPN Gateway', category: 'Management', type: 'modifier', unlock: 'tech:vpn_networking',
    cost: { scrap: 1.5e6, energy: 3e5, research: 30000 }, growth: 1.6, rate: 0, outputs: {},
    desc: '+1% Legacy-Fundchance. Jedes 8. Gateway: +1 Auftrags-Slot.' },
  { id: 'legal_team', name: 'Legal Team', category: 'Management', type: 'modifier', unlock: 'tech:remote_work_policy',
    cost: { scrap: 600000, energy: 120000, alloy: 8000 }, growth: 1.6, rate: 0, outputs: {},
    desc: '+1% Event-Resistenz, +1,5% Standort-Output. Verklagt Mitbewerber.' }
];

export const BUILD_ORDER = BUILDINGS.map((b) => b.id);

// Meilensteine: bei diesen Stückzahlen verdoppelt sich der Output des Gebäudes.
export const MILESTONE_STEPS = [10, 25, 50, 100, 200, 300, 400, 500];

export function milestoneMult(count) {
  let mult = 1;
  for (const step of MILESTONE_STEPS) {
    if (count >= step) mult *= 2; else break;
  }
  return mult;
}

export function nextMilestone(count) {
  return MILESTONE_STEPS.find((step) => count < step) || null;
}
