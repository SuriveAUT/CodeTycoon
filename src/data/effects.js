// effects.js – Bonus-Funktionen für Techs, Releases, Artefakte, Doktrinen.
// Jede Funktion mutiert das Bonus-Objekt `b` aus store/bonuses.js → computeBonuses().

export const BONUS_EFFECTS = {
  frontend_basics: b => { b.allMult *= 1.02; },
  javascript_core: b => { b.energyMult *= 1.08; },
  backend_node: b => { b.alloyMult *= 1.08; },
  typescript_static: b => { b.scrapMult *= 1.08; },
  react_framework: b => { b.dataMult *= 1.10; b.researchMult *= 1.05; },
  docker_containers: b => { b.componentsMult *= 1.10; },
  agile_scrum: b => { b.researchMult *= 1.12; },
  performance_profiling: b => { b.allMult *= 1.04; b.converterInputMult *= 0.92; },
  seo_optimization: b => { b.influenceMult *= 1.10; },
  freelance_platform: b => { b.expeditionPower += 0.15; },
  cicd_pipelines: b => { b.colonyOutputMult *= 1.10; b.allMult *= 1.03; },
  auto_expeditions_tech: b => { b.autoExpeditions = true; },
  stackoverflow_access: b => { b.relicMult *= 1.10; },
  cobol_legacy: b => { b.relicMult *= 1.15; b.relicChance += 0.02; },
  remote_work_policy: b => { b.colonyCap += 1; },
  serverless_arch: b => { b.componentsMult *= 1.08; b.energyMult *= 1.05; },
  auto_research_tech: b => { b.autoResearch = true; },
  vpn_networking: b => { b.relicMult *= 1.08; b.relicChance += 0.03; },
  microservices_arch: b => { b.dataMult *= 1.08; b.researchMult *= 1.08; },
  auto_build_tech: b => { b.autoBuild = true; },
  kubernetes_orch: b => { b.allMult *= 1.03; b.eventResist += 0.04; },
  graphql: b => { b.dataMult *= 1.10; b.componentsMult *= 1.10; },
  linkedin_networking: b => { b.influenceMult *= 1.15; },
  big_data_analytics: b => { b.energyMult *= 1.12; },
  machine_learning: b => { b.scrapMult *= 1.15; b.autoBuildBoost *= 1.08; },
  auto_projects_tech: b => { b.autoProjects = true; },
  autogpt_agents: b => { b.allMult *= 1.05; },
  ai_assisted_dev: b => { b.scrapMult *= 1.12; b.clickPowerMult *= 2; b.clickRateFraction += 0.02; },
  time_tracking: b => { b.prestigeGainMult *= 1.20; b.offlineCapHours += 2; },
  company_culture: b => { b.allMult *= 1.02; b.doctrineUnlock = true; },
  open_source_path: b => { b.researchCostMult *= 0.75; b.projectCostMult *= 0.85; },
  enterprise_path: b => { b.energyMult *= 1.30; b.influenceMult *= 1.30; },
  monorepo_strategy: b => { b.perColonyMult += 0.015; },
  venture_capital: b => { b.buildingCostMult *= 0.95; b.projectCostMult *= 0.95; },
  dark_web_scraping: b => { b.relicMult *= 1.12; b.expeditionRewardMult += 0.08; },
  web3_blockchain: b => { b.researchMult *= 1.20; },
  generative_ai: b => { b.allMult *= 1.05; b.prestigeGainMult *= 1.25; },
  global_cdn: b => { b.expeditionPower += 0.20; b.expeditionSpeed *= 1.05; },
  agi_completion: b => { b.prestigeGainMult *= 1.25; b.projectCostMult *= 0.97; },
  platform_apis: b => { b.allMult *= 1.05; },
  marketplace_tech: b => { b.energyMult *= 1.2; },
  edge_computing: b => { b.allMult *= 1.1; b.offlineCapHours += 2; },
  quantum_computing: b => { b.researchMult *= 1.5; },
  neural_interfaces: b => { b.scrapMult *= 1.25; b.clickRateFraction += 0.02; },
  digital_twin: b => { b.prestigeGainMult *= 1.25; b.allMult *= 1.1; }
};

export const PROJECT_EFFECTS = {
  todo_app: b => { b.allMult *= 1.12; b.colonyCap += 1; },
  tech_blog: b => { b.dataMult *= 1.15; b.researchMult *= 1.15; b.offlineCapHours += 1; },
  b2b_saas: b => { b.buildingCostMult *= 0.95; b.projectCostMult *= 0.97; },
  freelance_portal: b => { b.expeditionSlots += 1; b.relicMult *= 1.12; },
  social_network: b => { b.influenceMult *= 1.15; b.relicChance += 0.04; },
  crypto_exchange: b => { b.energyMult *= 1.25; },
  metaverse_project: b => { b.colonyCap += 2; b.colonyOutputMult *= 1.12; },
  stackoverflow_clone: b => { b.autoResearch = true; b.researchCostMult *= 0.92; },
  operating_system: b => { b.allMult *= 1.50; },
  internet_three: b => { b.prestigeGainMult *= 1.50; b.offlineCapHours += 4; },
  super_app: b => { b.allMult *= 1.50; b.dataMult *= 1.25; b.influenceMult *= 1.25; }
};

export const ARTIFACT_EFFECTS = {
  floppy_disk: b => { b.dataMult *= 1.06; b.researchMult *= 1.06; },
  coffee_supply: b => { b.energyMult *= 1.08; },
  rubber_duck: b => { b.alloyMult *= 1.06; b.componentsMult *= 1.06; },
  stackoverflow_book: b => { b.relicMult *= 1.12; },
  mechanical_keyboard: b => { b.influenceMult *= 1.08; b.clickPowerMult *= 1.25; },
  monitor_setup: b => { b.colonyOutputMult *= 1.06; },
  premium_laptop: b => { b.expeditionRewardMult += 0.08; },
  vim_config: b => { b.allMult *= 1.03; },
  framework_cache: b => { b.buildingCostMult *= 0.97; },
  git_cheat_sheet: b => { b.expeditionSlots += 1; },
  ssd_upgrade: b => { b.offlineCapHours += 2; },
  seniority_badge: b => { b.prestigeGainMult *= 1.10; }
};

export const DOCTRINE_EFFECTS = {
  efficiency: b => { b.allMult *= 1.06; b.buildingCostMult *= 0.97; },
  expansion: b => { b.allMult *= 1.02; b.expeditionPower += 0.08; b.colonyCap += 1; },
  insight: b => { b.researchMult *= 1.12; b.relicMult *= 1.10; b.relicChance += 0.02; },
  dominion: b => { b.influenceMult *= 1.12; b.projectCostMult *= 0.95; b.eventResist += 0.03; }
};
