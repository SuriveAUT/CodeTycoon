export const PROJECTS = [
  { id: 'todo_app', name: 'ToDo App', cost: { scrap: 1800000, energy: 900000, alloy: 160000, research: 180000 }, prereq: ['microservices_arch'], desc: 'Der Klassiker. Produktivitaet +12%, Buerolimit +1.' },
  { id: 'tech_blog', name: 'Tech Blog', cost: { scrap: 2600000, data: 700000, research: 320000, relics: 40 }, prereq: ['microservices_arch'], desc: 'Schreibe ueber Dinge, die du selbst nicht verstehst. Ideen und User +15%, Offline-Limit +1h.' },
  { id: 'freelance_portal', name: 'Freelance Portal', cost: { scrap: 5200000, energy: 2400000, research: 900000, relics: 90 }, prereq: ['vpn_networking'], desc: 'Ein eigener Marktplatz. Freelance-Slots +1, Legacy Code +12%.' },
  { id: 'social_network', name: 'Social Network', cost: { scrap: 9000000, energy: 4200000, influence: 1500000, relics: 150 }, prereq: ['cobol_legacy'], desc: 'Macht die Gesellschaft kaputt. Hype +15%, Fork-Chance steigt.' },
  { id: 'crypto_exchange', name: 'Crypto Exchange', cost: { scrap: 18000000, energy: 9000000, research: 3000000 }, prereq: ['big_data_analytics'], desc: 'Druckt quasi Geld. Revenue +25%.' },
  { id: 'b2b_saas', name: 'B2B SaaS', cost: { scrap: 32000000, alloy: 55000, components: 22000, research: 48000 }, prereq: ['docker_containers'], desc: 'Subscription based enterprise software. Senkt Ausgaben.' },
  { id: 'metaverse_project', name: 'Metaverse', cost: { scrap: 65000000, energy: 30000000, influence: 12000000, research: 9500000 }, prereq: ['remote_work_policy'], desc: 'Niemand braucht es, aber alle investieren. Buerolimit +2, Bueros staerker.' },
  { id: 'stackoverflow_clone', name: 'StackOverflow Klon', cost: { data: 18000000, research: 14000000, relics: 450 }, prereq: ['web3_blockchain'], desc: 'Kopiert die Kopierer. Auto-Learn verbessert, Lernkurve sinkt.' },
  { id: 'operating_system', name: 'Betriebssystem', cost: { scrap: 220000000, energy: 120000000, research: 65000000, influence: 30000000, relics: 1800 }, prereq: ['agi_completion'], desc: 'Du forderst Windows heraus. Produktivitaet +50%.' },
  { id: 'internet_three', name: 'Das Internet 3.0', cost: { scrap: 950000000, energy: 450000000, research: 220000000, relics: 7000, influence: 90000000 }, prereq: ['operating_system'], desc: 'Du hast das Internet neu erfunden. XP-Gain massiv erhoeht, Offline-Limit +4h.' }
];

export const AUTO_PROJECT_ORDER = PROJECTS.map((p) => p.id);
