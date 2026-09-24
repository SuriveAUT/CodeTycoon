// techs.js – Forschungsbaum. `tier` gruppiert die Anzeige, `cost` ist in Ideas (research).
// Effekte stehen in data/effects.js (BONUS_EFFECTS), Gebäude-Freischaltungen in data/buildings.js.

export const TECHS = [
  // ── Stufe 1: Garage ──
  { id: 'frontend_basics', name: 'HTML & CSS', tier: 1, cost: 40, prereq: [], desc: 'Die Basics. Erlaubt es dir, Buttons grün zu machen. Schaltet Junior Devs frei.' },
  { id: 'javascript_core', name: 'JavaScript', tier: 1, cost: 110, prereq: ['frontend_basics'], desc: 'Macht alles dynamisch. Und kaputt. Revenue +8%, schaltet Freemium frei.' },
  { id: 'backend_node', name: 'Node.js', tier: 1, cost: 260, prereq: ['javascript_core'], desc: 'JavaScript auf dem Server. Schaltet QA Tester frei (Bugs!).' },
  { id: 'typescript_static', name: 'TypeScript', tier: 1, cost: 550, prereq: ['javascript_core'], desc: 'Wie JS, aber kompiliert nicht, wenn man "any" vergisst. Code +8%, schaltet Code Monkeys frei.' },
  { id: 'react_framework', name: 'React', tier: 1, cost: 1100, prereq: ['typescript_static'], desc: 'Komplexer, aber cooler. Users +10%, schaltet Viral App und Growth Hacker frei.' },
  { id: 'docker_containers', name: 'Docker', tier: 1, cost: 2200, prereq: ['backend_node'], desc: '"Works on my machine" als Deployment-Strategie. Schaltet Mid-Level Devs und NPM Install frei.' },

  // ── Stufe 2: Startup ──
  { id: 'agile_scrum', name: 'Agile Methoden', tier: 2, cost: 4000, prereq: ['react_framework'], desc: 'Ideas +12%. Schaltet Brainstorming frei.' },
  { id: 'performance_profiling', name: 'Performance Profiling', tier: 2, cost: 6500, prereq: ['docker_containers'], desc: 'Bottlenecks finden. Alle Konverter verbrauchen 8% weniger, Gesamt +4%.' },
  { id: 'seo_optimization', name: 'SEO Basics', tier: 2, cost: 10000, prereq: ['agile_scrum'], desc: 'Keywords spammen für Hype. Schaltet Tech Blogger und Abo-Falle frei.' },
  { id: 'freelance_platform', name: 'Upwork Account', tier: 2, cost: 16000, prereq: ['seo_optimization'], desc: 'Schaltet Freelance-Aufträge und die Börse frei. Auftrags-Power +15%.' },
  { id: 'cicd_pipelines', name: 'CI/CD Pipelines', tier: 2, cost: 26000, prereq: ['performance_profiling'], desc: 'Automatisiert das Deployment. Schaltet Staff Engineer, DevOps, Package Manager und HR frei.' },
  { id: 'auto_expeditions_tech', name: 'Auto-Freelance', tier: 2, cost: 32000, prereq: ['freelance_platform'], desc: 'Ein Bot nimmt Upwork-Aufträge automatisch an.' },
  { id: 'stackoverflow_access', name: 'Stack Overflow Zugang', tier: 2, cost: 45000, prereq: ['freelance_platform'], desc: 'Direkter Zugang zu Legacy Code. Schaltet Code-Archäologen frei.' },
  { id: 'cobol_legacy', name: 'COBOL', tier: 2, cost: 70000, prereq: ['stackoverflow_access'], desc: 'Banken zahlen gut für diesen Legacy Code. Legacy +15%, Fundchance +2%.' },

  // ── Stufe 3: Scale-up ──
  { id: 'remote_work_policy', name: 'Remote Work', tier: 3, cost: 220000, prereq: ['cobol_legacy', 'cicd_pipelines'], desc: 'Erlaubt die Eröffnung von Standorten (+1 Limit). Schaltet Community Manager und Legal Team frei.' },
  { id: 'serverless_arch', name: 'Serverless', tier: 3, cost: 320000, prereq: ['cicd_pipelines'], desc: 'Kein Server, kein Problem. Module +8%, Revenue +5%, schaltet Hedge Fonds frei.' },
  { id: 'auto_research_tech', name: 'Auto-Tutorials', tier: 3, cost: 440000, prereq: ['remote_work_policy'], desc: 'Das Team lernt von alleine neue Stacks (Auto-Forschung).' },
  { id: 'vpn_networking', name: 'VPN Netzwerke', tier: 3, cost: 600000, prereq: ['remote_work_policy'], desc: 'Verbindet Remote-Offices sicher. Schaltet VPN Gateway frei.' },
  { id: 'microservices_arch', name: 'Microservices', tier: 3, cost: 900000, prereq: ['vpn_networking'], desc: 'Zerteilt ein Problem in hundert kleine Probleme. Schaltet Senior Devs und Scrum Master frei.' },
  { id: 'auto_build_tech', name: 'Auto-Hire Skript', tier: 3, cost: 1.2e+06, prereq: ['microservices_arch'], desc: 'Stellt automatisch Personal ein (Auto-Kauf).' },
  { id: 'kubernetes_orch', name: 'Kubernetes', tier: 3, cost: 1.6e+06, prereq: ['microservices_arch'], desc: 'Niemand versteht es, aber alle nutzen es. Schaltet Tech Leads frei.' },
  { id: 'graphql', name: 'GraphQL', tier: 3, cost: 2.2e+06, prereq: ['kubernetes_orch'], desc: 'Fragt exakt die Daten, die man braucht. Users und Module +10%, schaltet B2B Lizenzen frei.' },
  { id: 'linkedin_networking', name: 'LinkedIn Premium', tier: 3, cost: 3.2e+06, prereq: ['kubernetes_orch'], desc: 'Hype +15%. Schaltet Agile Workshops frei.' },

  // ── Stufe 4: Konzern ──
  { id: 'big_data_analytics', name: 'Big Data', tier: 4, cost: 2.88e+07, prereq: ['linkedin_networking'], desc: 'Daten sammeln, die niemand auswertet. Revenue +12%, schaltet Data Mining und Automated Testing frei.' },
  { id: 'machine_learning', name: 'Machine Learning', tier: 4, cost: 4.32e+07, prereq: ['big_data_analytics'], desc: 'Ein Haufen if-Statements, die von selbst lernen. Code +15%, schaltet Principal Engineers frei.' },
  { id: 'auto_projects_tech', name: 'Auto-Deploy', tier: 4, cost: 5.4e+07, prereq: ['machine_learning'], desc: 'Pusht Releases automatisch in Produktion.' },
  { id: 'autogpt_agents', name: 'Auto-GPT', tier: 4, cost: 7.2e+07, prereq: ['machine_learning'], desc: 'Automatisiert alles. Schaltet KI Co-Piloten und Viral Campaigns frei.' },
  { id: 'ai_assisted_dev', name: 'AI-Assistiertes Coding', tier: 4, cost: 9.6e+07, prereq: ['autogpt_agents'], desc: 'Code +12%, Klick-Kraft ×2 und jeder Klick bringt +2% der Code-Produktion.' },
  { id: 'time_tracking', name: 'Time Tracking', tier: 4, cost: 1.32e+08, prereq: ['autogpt_agents'], desc: 'XP-Gewinn +20%, Offline-Limit +2h. Schaltet Crypto Token frei.' },
  { id: 'company_culture', name: 'Core Values', tier: 4, cost: 1.8e+08, prereq: ['time_tracking'], desc: 'Schaltet die Unternehmenskultur (Doktrin) frei. Gesamt +2%.' },
  { id: 'open_source_path', name: 'Open Source', tier: 4, cost: 2.4e+08, prereq: ['company_culture'], excludes: ['enterprise_path'], desc: 'Community-Driven. Forschung 25% günstiger, Releases 15% günstiger. (Schließt Enterprise aus)' },
  { id: 'enterprise_path', name: 'Enterprise Software', tier: 4, cost: 2.4e+08, prereq: ['company_culture'], excludes: ['open_source_path'], desc: 'Monetarisierung. Revenue und Hype +30%. (Schließt Open Source aus)' },
  { id: 'monorepo_strategy', name: 'Monorepo', tier: 4, cost: 3.36e+08, prereq: ['company_culture'], desc: 'Alle Standorte arbeiten am selben Repository. +1,5% Gesamt pro Standort.' },

  // ── Stufe 5: Singularität ──
  { id: 'venture_capital', name: 'Venture Capital', tier: 5, cost: 4.8e+09, prereq: ['monorepo_strategy'], desc: 'Massives Funding: Gebäude und Releases 5% günstiger. Schaltet Keynote Speaker frei.' },
  { id: 'dark_web_scraping', name: 'Dark Web Scraper', tier: 5, cost: 7.2e+09, prereq: ['venture_capital'], desc: 'Findet die besten Legacy-Snippets im Untergrund. Schaltet die Stack Overflow API frei.' },
  { id: 'web3_blockchain', name: 'Web3 / Blockchain', tier: 5, cost: 1.08e+10, prereq: ['dark_web_scraping'], desc: 'Viel Forschung, wenig Nutzen. Ideas +20%.' },
  { id: 'generative_ai', name: 'Generative AI', tier: 5, cost: 1.68e+10, prereq: ['web3_blockchain'], desc: 'Die KI schreibt nun die KI. Gesamt +5%, XP +25%. Schaltet Gov Contracts und Chaos Monkey frei.' },
  { id: 'global_cdn', name: 'Globales CDN', tier: 5, cost: 2.4e+10, prereq: ['generative_ai'], desc: 'Beschleunigt alle Freelance-Aufträge. Auftrags-Power +20%.' },
  { id: 'agi_completion', name: 'AGI', tier: 5, cost: 3.84e+10, prereq: ['global_cdn'], desc: 'Das Endziel. Schaltet 10x Developer und Tech Monopol frei. Bereit für den ultimativen Refactor.' }
];

export const TECH_TIERS = [
  { tier: 1, name: 'Garage', desc: 'Die Grundlagen: erste Sprachen, erste Bugs.' },
  { tier: 2, name: 'Startup', desc: 'Prozesse, Marketing und erste Aufträge.' },
  { tier: 3, name: 'Scale-up', desc: 'Standorte, Automatisierung, Architektur.' },
  { tier: 4, name: 'Konzern', desc: 'Daten, KI und Unternehmenskultur.' },
  { tier: 5, name: 'Singularität', desc: 'Das Ende des Internets.' }
];
