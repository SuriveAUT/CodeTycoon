import { createStore } from 'solid-js/store';
import { rand } from '../lib/format.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { RESOURCES } from '../data/misc.js';

export const SAVE_KEY = 'dev-tycoon-save-v1';
const VERSION = 6;

// Sehr alte Saves (Astraforge-Weltraum-Thema) auf die aktuellen IDs mappen.
const ID_MAP = {
  salvage: 'intern', mining_outpost: 'junior_dev', planetary_cracker: 'mid_dev', nebula_harvester: 'senior_dev',
  void_dredge: 'tech_lead', asteroid_devourer: 'principal_eng', singularity_siphon: 'ai_copilot', reality_weaver: 'ten_x_dev',
  solar: 'google_ads', geothermal: 'freemium_model', fusion_reactor: 'subscription_trap', antimatter_condenser: 'b2b_licenses',
  dyson: 'data_mining', starforge: 'crypto_scam', quasar_tap: 'gov_contracts', vacuum_extractor: 'tech_monopoly',
  smelter: 'qa_tester', mega_smelter: 'auto_testing', stellar_forge: 'chaos_monkey',
  fabricator: 'npm_install', quantum_fabricator: 'microservices_conv', analyzer: 'seo_expert',
  dataweave: 'growth_hacker', planetary_datacenter: 'viral_campaign', lab: 'brainstorming_lab',
  galactic_lab: 'agile_workshop', relay: 'tech_blogger', void_relais: 'keynote_speaker',
  observatory: 'code_archeologist', dimension_scanner: 'stackoverflow_api',
  expeditionHub: 'freelance_portal', archiveCore: 'scrum_master', terraformer: 'hr_department',
  quantumGate: 'vpn_gateway', bastion: 'legal_team',
  adaptive_logistics: 'frontend_basics', power_grid: 'javascript_core', smelting_protocols: 'backend_node',
  automated_sorting: 'typescript_static', data_compression: 'react_framework', fabrication_ai: 'docker_containers',
  lab_protocols: 'agile_scrum', relay_network: 'seo_optimization', expedition_training: 'freelance_platform',
  orbital_survey: 'stackoverflow_access', relic_studies: 'cobol_legacy', colony_charter: 'remote_work_policy',
  terraform_codes: 'cicd_pipelines', gate_theory: 'vpn_networking', deep_archive: 'microservices_arch',
  quantum_instrumentation: 'kubernetes_orch', diplomacy_protocols: 'linkedin_networking', dyson_shell_design: 'big_data_analytics',
  self_replicating: 'machine_learning', automation_suite: 'autogpt_agents', chrono_mechanics: 'time_tracking',
  strategic_doctrine: 'company_culture', archive_sovereignty: 'monorepo_strategy', pan_trade: 'venture_capital',
  blacksite_calibration: 'dark_web_scraping', living_libraries: 'web3_blockchain', singularity_math: 'generative_ai',
  stellar_cartography: 'global_cdn', ascension_studies: 'agi_completion',
  orbital_ring: 'todo_app', deep_archive_project: 'tech_blog', gate_array: 'freelance_portal',
  stellar_cathedral: 'social_network', dyson_bloom: 'crypto_exchange', quantum_foundry: 'b2b_saas',
  planetary_concord: 'metaverse_project', infinite_library: 'stackoverflow_clone', world_engine: 'operating_system',
  singularity_loom: 'internet_three',
  echo_lens: 'floppy_disk', sun_fragments: 'coffee_supply', alloy_heart: 'rubber_duck',
  relic_compass: 'stackoverflow_book', silent_choir: 'mechanical_keyboard', clockwork_seed: 'monitor_setup',
  void_prism: 'premium_laptop', archive_bone: 'vim_config', prism_vault: 'framework_cache',
  starglass_map: 'git_cheat_sheet', memory_engine: 'ssd_upgrade', crown_of_dust: 'seniority_badge'
};

const zeroResources = () => RESOURCES.reduce((o, r) => (o[r] = 0, o), {});

export function defaultState() {
  const buildings = {};
  BUILDINGS.forEach(b => buildings[b.id] = 0);
  return {
    version: VERSION,
    resources: zeroResources(),
    buildings,
    techs: [],
    projects: [],
    artifacts: [],
    colonies: [],
    expeditions: [],
    achievements: [],
    prestigeMilestones: [],
    questIndex: 0,
    chronicle: 0,
    chronicleUpgrades: {},
    doctrine: null,
    operationsMode: 'balanced',
    activeProtocol: null,
    activeProtocolEndsAt: 0,
    protocolCooldowns: {},
    converterThrottle: 1,
    buyAmount: 1,
    auto: { build: true, research: true, expeditions: true, projects: true },
    stats: {
      lifetime: 0,
      total: zeroResources(),
      totalAtLastPrestige: zeroResources(),
      max: zeroResources(),
      projectsBuilt: 0,
      expeditionsDone: 0,
      prestigeCount: 0,
      manualClicks: 0,
      protocolsUsed: 0,
      questsDone: 0,
      decisionsMade: 0,
      fleetXP: 0,
      fleetLevel: 0,
      lastSave: Date.now(),
      firstSeen: Date.now()
    },
    event: null,
    eventEnds: 0,
    nextEventAt: Date.now() + rand(4 * 60e3, 8 * 60e3),
    lastEventAt: 0,
    asteroidActive: false,
    nextAsteroidAt: Date.now() + rand(90e3, 180e3),
    cyberEvent: null,
    nextCyberEventAt: Date.now() + rand(4 * 60e3, 9 * 60e3),
    decision: null,
    nextDecisionAt: Date.now() + rand(6 * 60e3, 10 * 60e3),
    lastDecisionId: null,
    stocks: {},
    stockMarket: { prices: {}, history: {}, lastUpdate: 0 },
    mainframeSlots: 3,
    equippedChips: [],
    ownedChips: [],
    log: [{ text: 'System init. Hello World.', time: Date.now() }],
    selectedTab: 'overview',
    cache: {}
  };
}

function asFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) return fallback;
  return num;
}

function migrateState(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  if (candidate.version >= VERSION) return candidate;
  if (candidate.buildings) {
    Object.entries(ID_MAP).forEach(([oldId, newId]) => {
      if (candidate.buildings[oldId] !== undefined) {
        candidate.buildings[newId] = (candidate.buildings[newId] || 0) + candidate.buildings[oldId];
        delete candidate.buildings[oldId];
      }
    });
  }
  ['techs', 'projects', 'artifacts'].forEach(key => {
    if (Array.isArray(candidate[key])) candidate[key] = candidate[key].map(id => ID_MAP[id] || id);
  });
  // v4 → v5: Tabs wurden zusammengelegt, alte Felder entfernt
  if (candidate.selectedTab === 'colonies' || candidate.selectedTab === 'expeditions') candidate.selectedTab = 'expansion';
  delete candidate.market;
  delete candidate.tutorialDone;
  // v5 → v6 (Rework-Balance): offenes Run-Guthaben alter Saves für die neue XP-Formel auf 1 Mrd. Code deckeln
  if ((candidate.version || 0) < 6) {
    const total = candidate.stats?.total?.scrap || 0;
    const baseline = candidate.stats?.totalAtLastPrestige?.scrap || 0;
    if (total - baseline > 1e9) {
      candidate.stats.totalAtLastPrestige = { ...(candidate.stats.totalAtLastPrestige || {}), scrap: total - 1e9 };
    }
  }
  return candidate;
}

export function normalizeState(candidate) {
  candidate = migrateState(candidate);
  const base = defaultState();
  if (!candidate || typeof candidate !== 'object') return base;

  const merged = {
    ...base,
    ...candidate,
    resources: { ...base.resources, ...(candidate.resources || {}) },
    buildings: { ...base.buildings, ...(candidate.buildings || {}) },
    chronicleUpgrades: { ...base.chronicleUpgrades, ...(candidate.chronicleUpgrades || {}) },
    protocolCooldowns: { ...base.protocolCooldowns, ...(candidate.protocolCooldowns || {}) },
    auto: { ...base.auto, ...(candidate.auto || {}) },
    stats: {
      ...base.stats,
      ...(candidate.stats || {}),
      total: { ...base.stats.total, ...(candidate.stats?.total || {}) },
      totalAtLastPrestige: { ...base.stats.totalAtLastPrestige, ...(candidate.stats?.totalAtLastPrestige || {}) },
      max: { ...base.stats.max, ...(candidate.stats?.max || {}) }
    }
  };

  Object.keys(merged.resources).forEach(res => {
    merged.resources[res] = Math.max(0, asFiniteNumber(merged.resources[res], 0));
  });
  BUILDINGS.forEach((b) => {
    merged.buildings[b.id] = Math.max(0, Math.floor(asFiniteNumber(merged.buildings[b.id], 0)));
  });
  // Nur bekannte IDs behalten
  const knownTech = new Set(TECHS.map(t => t.id));
  const knownProj = new Set(PROJECTS.map(p => p.id));
  const knownArt = new Set(ARTIFACTS.map(a => a.id));
  merged.techs = Array.isArray(merged.techs) ? merged.techs.filter(id => knownTech.has(id)) : [];
  merged.projects = Array.isArray(merged.projects) ? merged.projects.filter(id => knownProj.has(id)) : [];
  merged.artifacts = Array.isArray(merged.artifacts) ? merged.artifacts.filter(id => knownArt.has(id)) : [];

  merged.chronicle = Math.max(0, asFiniteNumber(merged.chronicle, 0));
  merged.questIndex = Math.max(0, Math.floor(asFiniteNumber(merged.questIndex, 0)));
  merged.buyAmount = [1, 10, 100, 'max'].includes(merged.buyAmount) ? merged.buyAmount : 1;
  merged.operationsMode = typeof merged.operationsMode === 'string' ? merged.operationsMode : 'balanced';
  merged.activeProtocol = typeof merged.activeProtocol === 'string' ? merged.activeProtocol : null;
  merged.activeProtocolEndsAt = asFiniteNumber(merged.activeProtocolEndsAt, 0);
  merged.converterThrottle = Math.min(1, Math.max(0.25, asFiniteNumber(merged.converterThrottle, 1)));
  merged.stats.lastSave = asFiniteNumber(merged.stats.lastSave, Date.now());
  merged.stats.firstSeen = asFiniteNumber(merged.stats.firstSeen, Date.now());
  merged.stats.manualClicks = Math.max(0, Math.floor(asFiniteNumber(merged.stats.manualClicks, 0)));
  merged.stats.protocolsUsed = Math.max(0, Math.floor(asFiniteNumber(merged.stats.protocolsUsed, 0)));
  merged.stats.questsDone = Math.max(0, Math.floor(asFiniteNumber(merged.stats.questsDone, 0)));

  if (merged.stats.prestigeCount > 0 && !candidate.stats?.totalAtLastPrestige) {
    merged.stats.totalAtLastPrestige = { ...merged.stats.total };
  }

  merged.colonies = Array.isArray(merged.colonies) ? merged.colonies : [];
  merged.expeditions = Array.isArray(merged.expeditions) ? merged.expeditions : [];
  merged.achievements = Array.isArray(merged.achievements) ? merged.achievements : [];
  merged.prestigeMilestones = Array.isArray(merged.prestigeMilestones) ? merged.prestigeMilestones : [];
  merged.equippedChips = Array.isArray(merged.equippedChips) ? merged.equippedChips : [];
  merged.ownedChips = Array.isArray(merged.ownedChips) ? merged.ownedChips : [];
  merged.mainframeSlots = Math.max(3, Math.floor(asFiniteNumber(merged.mainframeSlots, 3)));
  merged.log = Array.isArray(merged.log) && merged.log.length > 0 ? merged.log : base.log;
  if (!merged.stocks || typeof merged.stocks !== 'object') merged.stocks = {};
  merged.stockMarket = base.stockMarket; // kommt immer vom Server
  if (!merged.nextCyberEventAt) merged.nextCyberEventAt = Date.now() + rand(4 * 60e3, 9 * 60e3);
  if (!merged.nextDecisionAt) merged.nextDecisionAt = Date.now() + rand(6 * 60e3, 10 * 60e3);
  // Flüchtige Zustände: fliegender Bug nie persistieren, abgelaufene Overlays verwerfen
  merged.asteroidActive = false;
  if (!merged.decision || typeof merged.decision !== 'object' || Number(merged.decision.endsAt || 0) <= Date.now()) merged.decision = null;
  if (!merged.cyberEvent || typeof merged.cyberEvent !== 'object' || Number(merged.cyberEvent.endsAt || 0) <= Date.now()) merged.cyberEvent = null;
  if (!merged.nextAsteroidAt) merged.nextAsteroidAt = Date.now() + rand(90e3, 180e3);
  merged.version = VERSION;
  return merged;
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; }
}

function loadState() {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeState(parsed);
  } catch (e) {
    console.warn('Could not load save', e);
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (raw) storage.setItem(`${SAVE_KEY}.corrupt.${Date.now()}`, raw);
    } catch (_) { /* ignore */ }
    return null;
  }
}

const _localSave = loadState();
export const hadLocalSave = _localSave !== null;
const initial = normalizeState(_localSave ?? defaultState());
initial.cache = { leaderboard: null, bonuses: null, rates: {} };

export const [state, setState] = createStore(initial);

let lastCloudSync = 0;

export function snapshotState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.stockMarket;
  delete snapshot.cache;
  return snapshot;
}

export function saveState() {
  try {
    setState('stats', 'lastSave', Date.now());
    const snapshot = snapshotState();
    const storage = safeStorage();
    if (storage) storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    if (AstraforgeAPI.isLoggedIn()) {
      const now = Date.now();
      if (now - lastCloudSync > 30000) {
        AstraforgeAPI.saveGame(snapshot).catch(e => console.warn('Cloud sync error:', e));
        lastCloudSync = now;
      }
    }
  } catch (e) {
    console.warn('Could not save', e);
  }
}

export function forceCloudSync() {
  if (AstraforgeAPI.isLoggedIn()) {
    return AstraforgeAPI.saveGame(snapshotState()).then(() => { lastCloudSync = Date.now(); });
  }
  return Promise.resolve();
}

// --- Helpers ---
export function totalBuildings(s = state) { return BUILDINGS.reduce((acc, b) => acc + (s.buildings[b.id] || 0), 0); }
export function techCount(s = state) { return s.techs.length; }
export function projectCount(s = state) { return s.projects.length; }
export function artifactCount(s = state) { return s.artifacts.length; }
export function colonyCount(s = state) { return s.colonies.length; }

export function hasTech(id) { return state.techs.includes(id); }
export function hasProject(id) { return state.projects.includes(id); }
export function hasArtifact(id) { return state.artifacts.includes(id); }
export function buildingCount(id) { return state.buildings[id] || 0; }
export function upgradeLevel(id) { return state.chronicleUpgrades[id] || 0; }

export function getBuilding(id) { return BUILDINGS.find(b => b.id === id); }
export function getTech(id) { return TECHS.find(t => t.id === id); }
export function getProject(id) { return PROJECTS.find(p => p.id === id); }
export function getArtifact(id) { return ARTIFACTS.find(a => a.id === id); }

export function canAfford(cost) {
  return Object.entries(cost).every(([res, amt]) => (state.resources[res] || 0) >= amt);
}

export function spend(cost) {
  Object.entries(cost).forEach(([res, amt]) => {
    const validAmt = asFiniteNumber(amt, 0);
    setState('resources', res, Math.max(0, asFiniteNumber(state.resources[res], 0) - validAmt));
  });
}

export function add(res, amt) {
  const validAmt = asFiniteNumber(amt, 0);
  if (validAmt <= 0) return;
  const nextValue = asFiniteNumber(state.resources[res], 0) + validAmt;
  setState('resources', res, nextValue);
  setState('stats', 'total', res, asFiniteNumber(state.stats.total[res], 0) + validAmt);
  setState('stats', 'max', res, Math.max(asFiniteNumber(state.stats.max[res], 0), nextValue));
}

export function log(text) {
  const newLog = [{ text, time: Date.now() }, ...state.log].slice(0, 12);
  setState('log', newLog);
}

export function calcBuildingCost(def, owned, amount = 1, bMult = state.cache?.bonuses?.buildingCostMult || 1) {
  const cost = {};
  Object.entries(def.cost).forEach(([res, base]) => {
    let sum = 0;
    for (let i = 0; i < amount; i++) {
      const lvl = owned + i;
      let costMult = Math.pow(def.growth, lvl);
      if (lvl > 100) costMult *= Math.pow(1.03, lvl - 100);
      sum += base * costMult;
    }
    cost[res] = sum * bMult;
  });
  return cost;
}

export function calcNextBuildingCost(def) { return calcBuildingCost(def, buildingCount(def.id), 1); }

// Wie viele Stück sind mit dem aktuellen Vorrat leistbar? (max 1000)
export function maxAffordable(def) {
  const owned = buildingCount(def.id);
  const bMult = state.cache?.bonuses?.buildingCostMult || 1;
  let n = 0;
  const remaining = { ...state.resources };
  while (n < 1000) {
    const c = calcBuildingCost(def, owned + n, 1, bMult);
    if (!Object.entries(c).every(([res, amt]) => (remaining[res] || 0) >= amt)) break;
    Object.entries(c).forEach(([res, amt]) => { remaining[res] -= amt; });
    n++;
  }
  return n;
}

export function isBuildingUnlocked(def) {
  if (def.unlock === 'start') return true;
  if (def.unlock.startsWith('tech:')) return hasTech(def.unlock.split(':')[1]);
  if (def.unlock.startsWith('project:')) return hasProject(def.unlock.split(':')[1]);
  return false;
}

export function unlockedBuildings() { return BUILDINGS.filter(isBuildingUnlocked); }

export function unlockReason(def) {
  if (def.unlock === 'start') return 'Start';
  if (def.unlock.startsWith('tech:')) {
    const id = def.unlock.split(':')[1];
    return hasTech(id) ? 'Freigeschaltet' : `Benötigt: ${getTech(id)?.name || id}`;
  }
  if (def.unlock.startsWith('project:')) {
    const id = def.unlock.split(':')[1];
    return hasProject(id) ? 'Freigeschaltet' : `Benötigt Release: ${getProject(id)?.name || id}`;
  }
  return 'Gesperrt';
}

export function isTechUnlocked(tech) {
  if (tech.excludes && tech.excludes.some(id => hasTech(id))) return false;
  return tech.prereq.every(id => hasTech(id));
}

export function isProjectRequirementMet(id) { return hasTech(id) || hasProject(id); }

export function projectRequirementLabel(id) {
  return getTech(id)?.name || getProject(id)?.name || id;
}

export function isProjectUnlocked(project) {
  return project.prereq.every((id) => isProjectRequirementMet(id));
}
