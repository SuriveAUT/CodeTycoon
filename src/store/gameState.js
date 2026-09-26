import { createStore } from 'solid-js/store';
import { rand } from '../lib/format.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { BUILDINGS } from '../data/buildings.js';
import { TECHS, TECH_TIERS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { zeroResources, chronicleCostFor } from '../data/misc.js';
import { QUESTS } from '../data/quests.js';
import { COFFEE_INTERVAL_MS } from '../data/daily.js';
import { CHALLENGES } from '../data/challenges.js';
import { CHAPTERS } from '../data/chapters.js';
import { MAX_DIVIDEND_BONUS, DIVIDEND_PER_SHARE } from '../data/stocks.js';
import { LAB_PROJECTS } from '../data/lab.js';
import { emitToast } from '../lib/toast.js';

export const SAVE_KEY = 'dev-tycoon-save-v1';
export const BUY_AMOUNTS = [1, 10, 100, 'max'];
const VERSION = 9;

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
      hiresTotal: 0,
      techsLearned: 0,
      bugsFixed: 0,
      stockTrades: 0,
      sprintsDone: 0,
      xpEarned: 0,
      releasedEver: [],
      runStartedAt: Date.now(),
      lastSave: Date.now(),
      firstSeen: Date.now()
    },
    // Tages-Loop (engine/daily.js): Streak, Tickets, Kaffee, temporärer Boost
    daily: { lastClaimDay: -1, streak: 0, bestStreak: 0, claimsTotal: 0, ticketsDay: -1, tickets: [], rerolls: 0, allDoneDay: -1, ticketsDone: 0 },
    coffee: { beans: 1, nextBeanAt: Date.now() + COFFEE_INTERVAL_MS, used: 0 },
    boost: null,
    // Sprints (engine/challenges.js)
    challenge: null,
    challengesDone: [],
    // Finanzierungsrunden (engine/roadmap.js): aktuelle Runde, reachedAt[i] = Zeitpunkt, an dem Runde i begann,
    // seen = zuletzt gefeierte Runde (App.jsx zeigt für jede neue Runde einen Dialog)
    roadmap: { chapter: 0, reachedAt: [], seen: 0 },
    // R&D-Labor (engine/lab.js): laufende Projekte mit Endzeit, abgeholte Projekte, Stufen endloser Projekte
    lab: { running: [], done: [], levels: {} },
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
  // v6 → v7: neue Aufgaben wurden in die Reihenfolge eingefügt – questIndex entsprechend verschieben
  if ((candidate.version || 0) < 7 && Number.isFinite(candidate.questIndex)) {
    let idx = Math.max(0, Math.floor(candidate.questIndex));
    QUESTS.forEach((q, pos) => { if (q.since === 7 && idx >= pos) idx++; });
    candidate.questIndex = idx;
  }
  if ((candidate.version || 0) < 8) migrateToV8(candidate);
  if ((candidate.version || 0) < 9) migrateToV9(candidate);
  return candidate;
}

// v8 → v9 (Runden mit Labor und Release-Zielen)
function migrateToV9(candidate) {
  // Releases, die schon einmal veröffentlicht wurden: aktuelle plus die, die Errungenschaften belegen
  const achievements = candidate.achievements || [];
  const ever = new Set(candidate.projects || []);
  if (achievements.includes('world_engine')) ever.add('operating_system');
  if (achievements.includes('singularity')) ever.add('internet_three');
  candidate.stats = { ...(candidate.stats || {}), releasedEver: [...ever] };
  // Bestehende Runden nicht nachträglich feiern
  candidate.roadmap = { ...(candidate.roadmap || {}), seen: Number(candidate.roadmap?.chapter) || 0 };
}

// v7 → v8 (Finanzierungsrunden, XP-basierte Meilensteine, neuer 10x Typist)
function migrateToV8(candidate) {
  const levels = { ...(candidate.chronicleUpgrades || {}) };
  // Bis v7 kostete jede Stufe base · 1,32^Stufe – so viel XP wurden tatsächlich ausgegeben
  const LEGACY_GROWTH = 1.32;
  const spentOn = (id) => {
    const base = chronicleCostFor(id, 0);
    if (!Number.isFinite(base)) return 0;
    let sum = 0;
    for (let lvl = 0; lvl < (levels[id] || 0); lvl++) sum += Math.floor(base * Math.pow(LEGACY_GROWTH, lvl));
    return sum;
  };
  // Verdiente XP = Guthaben + alles, was in Chronicle-Upgrades steckt
  const spent = Object.keys(levels).reduce((sum, id) => sum + spentOn(id), 0);
  candidate.stats = { ...(candidate.stats || {}), xpEarned: Math.max(0, Number(candidate.chronicle) || 0) + spent };
  // 10x Typist wirkt jetzt anders: bisher investierte XP zurückgeben
  if (levels.quantum_click > 0) {
    candidate.chronicle = (Number(candidate.chronicle) || 0) + spentOn('quantum_click');
    candidate.chronicleUpgrades = { ...levels, quantum_click: 0 };
  }
  // Startrunde aus dem bisherigen Fortschritt: vorhandene Techs und Releases bleiben immer erhalten
  const techTier = (id) => TECHS.find(t => t.id === id)?.tier || 0;
  const maxTier = (candidate.techs || []).reduce((m, id) => Math.max(m, techTier(id)), 0);
  const achievements = candidate.achievements || [];
  const projects = candidate.projects || [];
  let chapter = 0;
  if (maxTier >= 4 || achievements.includes('tech_25')) chapter = 1;
  if (maxTier >= 5 || ['world_engine', 'singularity'].some(a => achievements.includes(a))
    || ['operating_system', 'internet_three'].some(p => projects.includes(p))) chapter = 2;
  candidate.roadmap = { chapter: Math.max(chapter, Number(candidate.roadmap?.chapter) || 0), reachedAt: [] };
  // Aktien kosteten bisher nur den Basispreis. Zum neuen, skalierten Kurs wären alte Bestände ein Vermögen:
  // auf den Dividenden-Cap kürzen (die volle Dividende bleibt bis zum nächsten Refactor erhalten)
  const capShares = Math.ceil(MAX_DIVIDEND_BONUS / DIVIDEND_PER_SHARE);
  if (candidate.stocks && typeof candidate.stocks === 'object') {
    for (const id of Object.keys(candidate.stocks)) {
      candidate.stocks[id] = Math.min(capShares, Math.max(0, Math.floor(Number(candidate.stocks[id]) || 0)));
    }
  }
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
    daily: { ...base.daily, ...(candidate.daily || {}) },
    coffee: { ...base.coffee, ...(candidate.coffee || {}) },
    roadmap: { ...base.roadmap, ...(candidate.roadmap || {}) },
    lab: { ...base.lab, ...(candidate.lab || {}) },
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
  merged.buyAmount = BUY_AMOUNTS.includes(merged.buyAmount) ? merged.buyAmount : 1;
  merged.operationsMode = typeof merged.operationsMode === 'string' ? merged.operationsMode : 'balanced';
  merged.activeProtocol = typeof merged.activeProtocol === 'string' ? merged.activeProtocol : null;
  merged.activeProtocolEndsAt = asFiniteNumber(merged.activeProtocolEndsAt, 0);
  merged.converterThrottle = Math.min(1, Math.max(0.25, asFiniteNumber(merged.converterThrottle, 1)));
  merged.stats.lastSave = asFiniteNumber(merged.stats.lastSave, Date.now());
  merged.stats.firstSeen = asFiniteNumber(merged.stats.firstSeen, Date.now());
  merged.stats.manualClicks = Math.max(0, Math.floor(asFiniteNumber(merged.stats.manualClicks, 0)));
  merged.stats.protocolsUsed = Math.max(0, Math.floor(asFiniteNumber(merged.stats.protocolsUsed, 0)));
  merged.stats.questsDone = Math.max(0, Math.floor(asFiniteNumber(merged.stats.questsDone, 0)));
  ['hiresTotal', 'techsLearned', 'bugsFixed', 'stockTrades', 'sprintsDone'].forEach(k => { merged.stats[k] = Math.max(0, Math.floor(asFiniteNumber(merged.stats[k], 0))); });
  merged.stats.xpEarned = Math.max(0, asFiniteNumber(merged.stats.xpEarned, 0));
  merged.roadmap.chapter = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(asFiniteNumber(merged.roadmap.chapter, 0))));
  merged.roadmap.reachedAt = Array.isArray(merged.roadmap.reachedAt) ? merged.roadmap.reachedAt.map(t => (t == null ? t : asFiniteNumber(t, 0))) : [];
  merged.roadmap.seen = Math.min(merged.roadmap.chapter, Math.max(0, Math.floor(asFiniteNumber(merged.roadmap.seen, merged.roadmap.chapter))));
  merged.stats.releasedEver = Array.isArray(merged.stats.releasedEver) ? merged.stats.releasedEver.filter(id => knownProj.has(id)) : [];
  const knownLab = new Set(LAB_PROJECTS.map(p => p.id));
  merged.lab.running = Array.isArray(merged.lab.running)
    ? merged.lab.running.filter(r => r && knownLab.has(r.id) && Number.isFinite(r.endsAt)).map(r => ({ id: r.id, startedAt: asFiniteNumber(r.startedAt, 0), endsAt: r.endsAt }))
    : [];
  merged.lab.done = Array.isArray(merged.lab.done) ? [...new Set(merged.lab.done.filter(id => knownLab.has(id)))] : [];
  const repeatable = new Set(LAB_PROJECTS.filter(p => p.repeatable).map(p => p.id));
  // Jedes Projekt läuft höchstens einmal; ein schon abgeschlossenes Einmal-Projekt würde seinen Slot sonst für immer belegen
  const runningIds = new Set();
  merged.lab.running = merged.lab.running.filter(r => {
    if (runningIds.has(r.id) || (!repeatable.has(r.id) && merged.lab.done.includes(r.id))) return false;
    runningIds.add(r.id);
    return true;
  });
  merged.lab.levels =Object.fromEntries(Object.entries(merged.lab.levels && typeof merged.lab.levels === 'object' ? merged.lab.levels : {})
    .filter(([id]) => repeatable.has(id)).map(([id, lvl]) => [id, Math.max(0, Math.floor(asFiniteNumber(lvl, 0)))]));
  merged.stats.runStartedAt = asFiniteNumber(merged.stats.runStartedAt, Date.now());
  // Tages-Loop / Sprints
  merged.daily.tickets = Array.isArray(merged.daily.tickets) ? merged.daily.tickets.filter(t => t && typeof t.id === 'string') : [];
  ['lastClaimDay', 'ticketsDay', 'allDoneDay'].forEach(k => { merged.daily[k] = Math.floor(asFiniteNumber(merged.daily[k], -1)); });
  ['streak', 'bestStreak', 'claimsTotal', 'rerolls', 'ticketsDone'].forEach(k => { merged.daily[k] = Math.max(0, Math.floor(asFiniteNumber(merged.daily[k], 0))); });
  merged.coffee.beans = Math.max(0, Math.min(3, Math.floor(asFiniteNumber(merged.coffee.beans, 0))));
  merged.coffee.nextBeanAt = asFiniteNumber(merged.coffee.nextBeanAt, 0);
  merged.coffee.used = Math.max(0, Math.floor(asFiniteNumber(merged.coffee.used, 0)));
  if (!merged.boost || typeof merged.boost !== 'object' || Number(merged.boost.endsAt || 0) <= Date.now()) merged.boost = null;
  const knownChallenge = new Set(CHALLENGES.map(c => c.id));
  merged.challenge = knownChallenge.has(merged.challenge) ? merged.challenge : null;
  merged.challengesDone = Array.isArray(merged.challengesDone) ? merged.challengesDone.filter(id => knownChallenge.has(id)) : [];

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
        AstraforgeAPI.saveGame(snapshot).catch(e => {
          console.warn('Cloud sync error:', e);
          // Server lehnt Saves eines veralteten Tabs ab (neueres Save-Format in der Cloud)
          if (/neu laden/.test(e?.message || '')) emitToast(e.message, 'bad');
        });
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
export function buildingCount(id, s = state) { return s.buildings?.[id] || 0; }
export function upgradeLevel(id, s = state) { return s.chronicleUpgrades?.[id] || 0; }

export function getBuilding(id) { return BUILDINGS.find(b => b.id === id); }
export function getTech(id) { return TECHS.find(t => t.id === id); }
export function getProject(id) { return PROJECTS.find(p => p.id === id); }

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

// Kostenkurve: Stück Nr. lvl kostet base · growth^lvl, ab Stufe SOFTCAP_LEVEL zusätzlich ×SOFTCAP_GROWTH^(lvl-SOFTCAP_LEVEL).
const SOFTCAP_LEVEL = 100;
const SOFTCAP_GROWTH = 1.03;

// Geometrische Summe q^from + … + q^to (inklusive)
function geoSum(q, from, to) {
  if (to < from) return 0;
  const n = to - from + 1;
  if (Math.abs(q - 1) < 1e-12) return n;
  return Math.pow(q, from) * (Math.pow(q, n) - 1) / (q - 1);
}

// Summe der Kostenmultiplikatoren für `amount` Stück ab Stufe `owned` – geschlossene Form statt Schleife.
function costMultiplierSum(growth, owned, amount) {
  if (amount <= 0) return 0;
  const last = owned + amount - 1;
  const plain = geoSum(growth, owned, Math.min(last, SOFTCAP_LEVEL));
  if (last <= SOFTCAP_LEVEL) return plain;
  const from = Math.max(owned, SOFTCAP_LEVEL + 1);
  // growth^lvl · SOFTCAP_GROWTH^(lvl-100) = SOFTCAP_GROWTH^-100 · (growth·SOFTCAP_GROWTH)^lvl
  return plain + Math.pow(SOFTCAP_GROWTH, -SOFTCAP_LEVEL) * geoSum(growth * SOFTCAP_GROWTH, from, last);
}

export function calcBuildingCost(def, owned, amount = 1, bMult = state.cache?.bonuses?.buildingCostMult || 1) {
  const mult = costMultiplierSum(def.growth, owned, amount) * bMult;
  const cost = {};
  for (const res in def.cost) cost[res] = def.cost[res] * mult;
  return cost;
}

export function calcNextBuildingCost(def) { return calcBuildingCost(def, buildingCount(def.id), 1); }

// Wie viele Stück sind mit dem aktuellen Vorrat leistbar? (max 1000) – binäre Suche über die geschlossene Form.
export function maxAffordable(def) {
  const owned = buildingCount(def.id);
  const bMult = state.cache?.bonuses?.buildingCostMult || 1;
  const affordable = (n) => canAfford(calcBuildingCost(def, owned, n, bMult));
  if (!affordable(1)) return 0;
  let lo = 1, hi = 1000;
  if (affordable(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (affordable(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

export function isBuildingUnlocked(def) {
  if (def.unlock === 'start') return true;
  if (def.unlock.startsWith('tech:')) return hasTech(def.unlock.split(':')[1]);
  if (def.unlock.startsWith('project:')) return hasProject(def.unlock.split(':')[1]);
  return false;
}

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

// Ab welcher Finanzierungsrunde eine Tech erforscht werden kann (Stufe aus TECH_TIERS, einzeln überschreibbar)
export function techChapter(tech) {
  return tech.chapter ?? TECH_TIERS.find(t => t.tier === tech.tier)?.chapter ?? 0;
}

export function isTechUnlocked(tech) {
  if (techChapter(tech) > (state.roadmap?.chapter || 0)) return false;
  if (tech.excludes && tech.excludes.some(id => hasTech(id))) return false;
  return tech.prereq.every(id => hasTech(id));
}

export function isProjectRequirementMet(id) { return hasTech(id) || hasProject(id); }

export function projectRequirementLabel(id) {
  return getTech(id)?.name || getProject(id)?.name || id;
}

export function isProjectUnlocked(project) {
  if ((project.chapter || 0) > (state.roadmap?.chapter || 0)) return false;
  return project.prereq.every((id) => isProjectRequirementMet(id));
}
