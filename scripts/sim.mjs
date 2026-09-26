// sim.mjs – Headless-Balancing-Simulation. Ein Bot spielt CodeTycoon mit derselben Engine wie das Spiel
// (store/, engine/, data/) und misst das Tempo. Nicht Teil des Builds.
//
//   npm run sim                                 → Modelle active + daily, je 5 Seeds, Report
//   npm run sim -- --model daily --seeds 3      → nur ein Modell
//   npm run sim -- --model save --save x.json   → echter Spielstand, danach wie `daily`
//   npm run sim -- --json                       → Rohdaten statt Report
//
// Modelle:
//   active – spielt durchgehend (--hours, Standard 12)
//   daily  – zwei Sessions pro Tag um 08:00 und 20:00 (--session Minuten, Standard 20), dazwischen
//            Offline-Nachholen über engine/offline.js wie im Spiel (--days, Standard 30)
//   save   – lädt einen exportierten Spielstand (JSON wie im localStorage) und spielt dann wie `daily`
//
// Vereinfachungen gegenüber dem Browser: 1 Tick pro Sekunde (Automation 1×/s statt pro Frame),
// Cyber-Events und Entscheidungs-Events werden nicht ausgelöst, Börsenkurse bleiben auf dem Basispreis.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

// ─────────────────────────────── Parent: Worker starten, Report ───────────────────────────────

async function runParent(opts) {
  const models = opts.model ? [opts.model] : ['active', 'daily'];
  const seeds = Number(opts.seeds || 5);
  if (models.includes('save') && !opts.save) throw new Error('--model save braucht --save <datei>');
  const jobs = [];
  for (const model of models) for (let seed = 1; seed <= seeds; seed++) jobs.push({ model, seed });

  const started = Date.now();
  const results = await runPool(jobs, Math.max(1, Math.min(cpus().length - 1, 8)), (job) => runChild(job, opts));
  if (opts.json) { console.log(JSON.stringify(results, null, 2)); return; }
  for (const model of models) report(model, results.filter(r => r.model === model));
  reportTargets(results);
  console.log(`\n(${jobs.length} Läufe in ${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

async function runPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

function runChild(job, opts) {
  const pass = ['hours', 'days', 'session', 'save', 'min-gain', 'grow'].flatMap(k => (opts[k] !== undefined ? [`--${k}`, String(opts[k])] : []));
  const childArgs = [fileURLToPath(import.meta.url), '--worker', '--model', job.model, '--seed', String(job.seed), ...pass];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, { env: { ...process.env, TZ: 'UTC' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => {
      const line = stdout.trim().split('\n').pop();
      if (code !== 0 || !line) return reject(new Error(`Worker ${job.model}/${job.seed} fehlgeschlagen (${code}):\n${stderr}`));
      resolve(JSON.parse(line));
    });
  });
}

// ─────────────────────────────── Worker: ein Modell, ein Seed ───────────────────────────────

async function runWorker(opts) {
  const model = opts.model || 'active';
  const seed = Number(opts.seed || 1);
  const saveJson = opts.save ? readFileSync(opts.save, 'utf8') : null;

  // Start: Montag 5.10.2026 08:00 UTC (erste Session), bei `save` der letzte Speicherzeitpunkt des Spielstands
  let clock = Date.UTC(2026, 9, 5, 8, 0, 0);
  if (saveJson) clock = Number(JSON.parse(saveJson).stats?.lastSave) || clock;
  const start = clock;

  // Browser-Umgebung stubben, bevor die Engine geladen wird (api-client liest localStorage beim Import)
  Date.now = () => clock;
  Math.random = mulberry32(seed * 7919);
  const storage = new Map();
  globalThis.localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear()
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' });
  if (saveJson) storage.set('dev-tycoon-save-v1', saveJson);

  const load = (p) => import(new URL(p, import.meta.url));
  const gs = await load('../src/store/gameState.js');
  const { state, setState } = gs;
  const bonusesMod = await load('../src/store/bonuses.js');
  const { processTick, runProgressChecks } = await load('../src/engine/tick.js');
  const { simulateOffline } = await load('../src/engine/offline.js');
  const actions = await load('../src/engine/actions.js');
  const { autoExpeditions } = await load('../src/engine/automation.js');
  const { clickAnomaly } = await load('../src/engine/events.js');
  const daily = await load('../src/engine/daily.js');
  const challenges = await load('../src/engine/challenges.js');
  const { buyStock, sharesToCap, getStockPrice } = await load('../src/engine/stocks.js');
  const { bestInvestmentId } = await load('../src/engine/advisor.js');
  const { BUILDINGS, milestoneMult } = await load('../src/data/buildings.js');
  const { TECHS } = await load('../src/data/techs.js');
  const { PROJECTS } = await load('../src/data/projects.js');
  const { PROTOCOLS, CHRONICLE_UPGRADES } = await load('../src/data/misc.js');
  const { CHALLENGES } = await load('../src/data/challenges.js');
  const { STOCKS } = await load('../src/data/stocks.js');
  const { QUESTS } = await load('../src/data/quests.js');

  const CLICKS_PER_SEC = 2;
  const BOT_EVERY = 5;             // Bot handelt alle 5 s
  const MIN_RUN_MIN = 10;          // Refactor frühestens nach 10 min Run
  const PRESTIGE_DROP = 0.8;       // … wenn XP/min unter 80 % des Run-Maximums fällt
  const MIN_GAIN = Number(opts['min-gain'] || 10);  // … und mindestens so viele XP bringt
  const GROW = Number(opts.grow || 0.5);            // … und mindestens 50 % der bisher verdienten XP
  const EXCLUSIVE_SKIP = new Set(['enterprise_path']); // Entweder/Oder: der Bot nimmt Open Source

  const marks = {};
  const refactors = [];
  let activeSec = 0;
  let peakRate = 0;
  let tickCount = 0;

  const wall = () => (clock - start) / 1000;
  function mark(name) {
    if (!marks[name]) marks[name] = { wall: wall(), active: activeSec };
  }

  function checkMarks() {
    if (state.techs.length >= 1) mark('tech_first');
    for (const id of state.techs) {
      const tier = TECHS.find(t => t.id === id)?.tier;
      if (tier) mark(`tier${tier}`);
    }
    if (state.techs.length >= TECHS.length - 1) mark('techs_all');
    for (const id of state.projects) mark(`rel:${id}`);
    const pc = state.stats.prestigeCount || 0;
    for (let n = 1; n <= Math.min(pc, 20); n++) mark(`refactor${n}`);
    const sprints = (state.challengesDone || []).length;
    for (let n = 1; n <= sprints; n++) mark(`sprints${n}`);
    if ((state.questIndex || 0) >= QUESTS.length) mark('quests_all');
    if (state.roadmap && Number.isFinite(state.roadmap.chapter)) {
      for (let c = 1; c <= state.roadmap.chapter; c++) mark(`round${c}`);
    }
  }

  function bonuses() { return bonusesMod.currentBonuses(); }

  function click(n) { for (let i = 0; i < n; i++) actions.handleManualClick(); }

  // Fliegender Bug: gleiche Typ-Verteilung wie App.jsx → spawnBug; ein aktiver Spieler fängt jeden.
  function maybeBug() {
    if (state.asteroidActive || clock < (state.nextAsteroidAt || 0) || state.stats.lifetime <= 60) return;
    const rnd = Math.random();
    let type = 'scrap';
    if (rnd > 0.97) type = 'relics';
    else if (rnd > 0.85) type = 'frenzy';
    else if (rnd > 0.75) type = 'click_frenzy';
    else if (rnd > 0.55) type = 'energy';
    setState('asteroidActive', true);
    clickAnomaly(type);
  }

  function buyTechs() {
    let bought = true;
    while (bought) {
      bought = false;
      const b = bonuses();
      const next = TECHS
        .filter(t => !state.techs.includes(t.id) && !EXCLUSIVE_SKIP.has(t.id) && gs.isTechUnlocked(t))
        .sort((a, z) => a.cost - z.cost)[0];
      if (next && state.resources.research >= actions.nextResearchCost(next, b)) bought = actions.purchaseTech(next.id, { quiet: true });
    }
  }

  function buyProjects() {
    for (const p of PROJECTS) {
      if (!state.projects.includes(p.id) && gs.isProjectUnlocked(p)) actions.purchaseProject(p.id, { quiet: true });
    }
  }

  // Konverter nur kaufen, wenn ihre Inputs danach im Plus bleiben (wie Auto-Hire)
  function converterSafe(def, net, b) {
    if (def.type !== 'converter') return true;
    const oldCount = gs.buildingCount(def.id);
    const unitsDelta = (oldCount + 1) * milestoneMult(oldCount + 1) - oldCount * milestoneMult(oldCount);
    const bm = b.buildingMults[def.id] || 1;
    return Object.entries(def.inputs).every(([res, need]) =>
      (net[res] || 0) - need * bonusesMod.converterInputScale(b) * def.rate * unitsDelta * bm > 0);
  }

  function buyBuildings() {
    const b = bonuses();
    // Modifier bis zum Cap, solange sie höchstens ein Viertel des Code-Vorrats kosten
    for (const def of BUILDINGS) {
      if (def.type !== 'modifier' || !gs.isBuildingUnlocked(def) || gs.buildingCount(def.id) >= bonusesMod.MODIFIER_CAP) continue;
      const cost = gs.calcNextBuildingCost(def);
      if (gs.canAfford(cost) && (cost.scrap || 0) <= 0.25 * (state.resources.scrap || 0)) actions.purchaseBuilding(def.id, 1, { quiet: true });
    }
    const net = { ...bonusesMod.estimateRatesSnapshot() };
    const blocked = new Set();
    for (let i = 0; i < 300; i++) {
      const id = bestInvestmentId(b, { affordableOnly: true, exclude: blocked });
      if (!id) break;
      const def = gs.getBuilding(id);
      // Konverter, der seine Inputs aushungern würde, für diese Runde überspringen
      if (!converterSafe(def, net, b)) { blocked.add(id); continue; }
      if (!actions.purchaseBuilding(id, 1, { quiet: true })) break;
      if (def.type === 'converter') {
        const unitsDelta = gs.buildingCount(id) * milestoneMult(gs.buildingCount(id)) - (gs.buildingCount(id) - 1) * milestoneMult(gs.buildingCount(id) - 1);
        const bm = b.buildingMults[id] || 1;
        for (const [res, need] of Object.entries(def.inputs)) net[res] = (net[res] || 0) - need * bonusesMod.converterInputScale(b) * def.rate * unitsDelta * bm;
      }
    }
  }

  function manageColonies() {
    let guard = 0;
    while (actions.canFoundColony() && guard++ < 8) actions.foundColony();
    if (state.colonies.length) actions.upgradeAllColonies();
  }

  function useProtocol() {
    const now = clock;
    if (state.activeProtocol && state.activeProtocolEndsAt > now) return;
    for (const p of PROTOCOLS) {
      if (actions.activateProtocol(p.id).ok) return;
    }
  }

  function manageChips() {
    for (const id of state.ownedChips || []) {
      if (state.equippedChips.length >= (state.mainframeSlots || 3)) break;
      if (!state.equippedChips.includes(id)) actions.equipChip(id);
    }
  }

  // Aktien bis zum Dividenden-Cap, solange es höchstens 20 % des Revenue-Vorrats kostet
  function manageStocks() {
    if (!state.techs.includes('freelance_platform')) return;
    for (const st of STOCKS) {
      const missing = sharesToCap(st.id);
      if (missing <= 0) continue;
      const price = getStockPrice(st.id);
      const n = Math.min(missing, Math.floor(0.2 * (state.resources.energy || 0) / price));
      if (n > 0) buyStock(st.id, n);
    }
  }

  function spendXp() {
    let guard = 0;
    while (guard++ < 500) {
      const next = CHRONICLE_UPGRADES
        .filter(u => !(u.max && gs.upgradeLevel(u.id) >= u.max))
        .map(u => ({ id: u.id, cost: actions.chronicleCost(u.id) }))
        .sort((a, z) => a.cost - z.cost)[0];
      if (!next || state.chronicle < next.cost || !actions.buyChronicle(next.id)) break;
    }
  }

  function dailyChores() {
    if (daily.dailyUnlocked() && daily.canClaimStandup()) daily.claimStandup();
    if ((state.coffee?.beans || 0) > 0 && !state.boost && daily.coffeeUseAvailable('espresso')) daily.useCoffee('espresso');
  }

  function maybePrestige() {
    if (state.challenge) return;
    const runMin = (clock - state.stats.runStartedAt) / 60000;
    const raw = actions.prestigeGainRaw();
    const rate = raw / Math.max(1, runMin);
    peakRate = Math.max(peakRate, rate);
    const gain = actions.prestigeGain();
    if (runMin < MIN_RUN_MIN || gain < Math.max(MIN_GAIN, GROW * chronicleTotal()) || rate >= PRESTIGE_DROP * peakRate) return;
    const sprint = CHALLENGES.find(c => challenges.challengeStatus(c) === 'ready');
    const runWall = runMin * 60;
    const ok = sprint ? challenges.startChallenge(sprint.id) : actions.doPrestigeReset();
    if (!ok) return;
    refactors.push({ wall: wall(), active: activeSec, gain, runWall, sprint: sprint?.id || null });
    peakRate = 0;
    spendXp();
  }

  function botAct() {
    dailyChores();
    if (!state.doctrine && bonuses().doctrineUnlock) actions.setDoctrine('efficiency');
    manageChips();
    buyTechs();
    buyProjects();
    manageColonies();
    if (state.techs.includes('freelance_platform')) autoExpeditions(bonuses());
    useProtocol();
    buyBuildings();
    manageStocks();
    spendXp();
    maybePrestige();
    checkMarks();
  }

  function activeSecond() {
    processTick(1, { silent: true, auto: true, offline: true });
    runProgressChecks(true);
    click(CLICKS_PER_SEC);
    maybeBug();
    if (++tickCount % BOT_EVERY === 0) botAct();
    clock += 1000;
    activeSec += 1;
  }

  const finaleReached = () => marks['rel:internet_three'] || marks['rel:ipo'];

  setState('cache', 'bonuses', bonusesMod.computeBonuses());
  setState('cache', 'rates', bonusesMod.estimateRatesSnapshot());

  if (model === 'active') {
    const limit = Number(opts.hours || 12) * 3600;
    while (activeSec < limit && !finaleReached()) activeSecond();
  } else {
    const days = Number(opts.days || 30);
    const sessionSec = Number(opts.session || 20) * 60;
    const endAt = start + days * 86400e3;
    const perDay = [];
    let lastLeave = clock;
    let first = true;
    for (let slot = nextSlot(clock); slot < endAt && !finaleReached(); slot = nextSlot(clock + 1)) {
      const gap = (slot - lastLeave) / 1000;
      clock = slot;
      // Wie App.jsx beim Laden: Cache auffrischen, dann Abwesenheit nachholen
      setState('cache', 'bonuses', bonusesMod.computeBonuses());
      setState('cache', 'rates', bonusesMod.estimateRatesSnapshot());
      if (!first || saveJson) simulateOffline(gap);
      first = false;
      setState('cache', 'rates', bonusesMod.estimateRatesSnapshot());
      checkMarks();
      for (let s = 0; s < sessionSec && !finaleReached(); s++) activeSecond();
      botAct();
      lastLeave = clock;
      const day = Math.floor((clock - start) / 86400e3);
      perDay[day] = { refactors: refactors.filter(r => Math.floor(r.wall / 86400) === day).length, chronicleTotal: chronicleTotal() };
    }
    marks.__perDay = perDay;
  }

  function chronicleTotal() {
    let spent = state.chronicle;
    for (const u of CHRONICLE_UPGRADES) {
      const lvl = gs.upgradeLevel(u.id);
      for (let l = 0; l < lvl; l++) spent += bonusesMod.chronicleCostFor(u.id, l);
    }
    return spent;
  }

  // Sessions um 08:00 und 20:00 UTC
  function nextSlot(t) {
    const d = new Date(t);
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    for (const h of [8, 20, 32]) {
      const slot = day + h * 3600e3;
      if (slot >= t) return slot;
    }
    return day + 32 * 3600e3;
  }

  checkMarks();
  const perDay = marks.__perDay || null;
  delete marks.__perDay;
  const result = {
    model, seed,
    simulated: { wall: wall(), active: activeSec },
    marks, refactors, perDay,
    final: {
      prestigeCount: state.stats.prestigeCount || 0,
      xpEarned: chronicleTotal(),
      techs: state.techs.length,
      projects: state.projects.length,
      questIndex: state.questIndex,
      sprints: (state.challengesDone || []).length,
      achievements: state.achievements.length,
      chronicleUpgrades: { ...state.chronicleUpgrades }
    }
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────── Report ───────────────────────────────

const MARK_ORDER = [
  'tech_first', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6', 'techs_all',
  'refactor1', 'refactor2', 'refactor3', 'refactor5', 'refactor10', 'sprints1', 'sprints3', 'sprints6',
  'round1', 'round2', 'round3', 'round4', 'round5',
  'rel:operating_system', 'rel:internet_three', 'rel:ipo', 'quests_all'
];

function median(xs) {
  const s = [...xs].sort((a, z) => a - z);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmtDuration(sec, model) {
  if (sec === null || sec === undefined) return '–';
  if (model !== 'active') return `Tag ${(sec / 86400).toFixed(1)}`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`;
}

function report(model, runs) {
  if (!runs.length) return;
  const title = { active: 'Aktiv (durchgehend)', daily: 'Daily (2 × Session/Tag)', save: 'Echter Spielstand, dann Daily' }[model] || model;
  console.log(`\n══ ${title} — ${runs.length} Seeds ══`);
  const names = [...new Set(runs.flatMap(r => Object.keys(r.marks)))];
  const ordered = [...MARK_ORDER.filter(n => names.includes(n)), ...names.filter(n => !MARK_ORDER.includes(n) && !n.startsWith('refactor') && !n.startsWith('sprints') && !n.startsWith('rel:')).sort()];
  console.log('Meilenstein'.padEnd(24) + 'Median'.padEnd(14) + 'Spannweite'.padEnd(26) + 'erreicht');
  for (const name of ordered) {
    const vals = runs.map(r => r.marks[name]?.wall).filter(v => v !== undefined);
    if (!vals.length) continue;
    const range = `${fmtDuration(Math.min(...vals), model)} – ${fmtDuration(Math.max(...vals), model)}`;
    console.log(name.padEnd(24) + fmtDuration(median(vals), model).padEnd(14) + range.padEnd(26) + `${vals.length}/${runs.length}`);
  }
  const reached = runs.filter(r => r.marks['rel:internet_three'] || r.marks['rel:ipo']).length;
  console.log(`Finale erreicht: ${reached}/${runs.length} · simuliert: ${fmtDuration(median(runs.map(r => r.simulated.wall)), model)} (Median)`);
  const firstRuns = runs.map(r => r.refactors[0]).filter(Boolean);
  if (firstRuns.length) console.log(`Erster Refactor: ${median(firstRuns.map(r => r.gain))} XP nach ${fmtDuration(median(firstRuns.map(r => r.runWall)), 'active')} Run-Zeit (Median)`);
  const runLens = runs.flatMap(r => r.refactors.slice(1, 8).map(x => x.runWall));
  if (runLens.length) console.log(`Run-Dauer Refactor 2–8: ${fmtDuration(median(runLens), 'active')} (Median)`);
  if (model !== 'active') {
    const perDay = runs.flatMap(r => (r.perDay || []).filter(Boolean).slice(0, 14).map(d => d.refactors));
    if (perDay.length) console.log(`Refactors pro Tag (Tag 1–14): Median ${median(perDay)}, max ${Math.max(...perDay)}`);
  }
  console.log(`Ende: ${median(runs.map(r => r.final.prestigeCount))} Refactors, ${Math.round(median(runs.map(r => r.final.xpEarned)))} XP verdient, Quest ${median(runs.map(r => r.final.questIndex))}, ${median(runs.map(r => r.final.sprints))} Sprints (Median)`);
}

// Zielwerte aus dem Plan. Werte außerhalb → FAIL. Fehlende Meilensteine → n/a.
const TARGETS = [
  { model: 'active', mark: 'tech_first', max: 120, label: 'Erste Tech < 2 min' },
  { model: 'active', mark: 'tier2', max: 20 * 60, label: 'Tier 2 ≤ 20 min' },
  { model: 'active', mark: 'refactor1', min: 90 * 60, max: 120 * 60, label: 'Erster Refactor nach 90–120 min' },
  { model: 'daily', mark: 'rel:internet_three', min: 16 * 86400, label: 'Finale (Internet 3.0) nicht vor Tag 16' }
];

function reportTargets(results) {
  const models = new Set(results.map(r => r.model));
  const relevant = TARGETS.filter(t => models.has(t.model));
  if (!relevant.length) return;
  console.log('\n══ Zielwerte ══');
  for (const t of relevant) {
    const runs = results.filter(r => r.model === t.model);
    const vals = runs.map(r => r.marks[t.mark]?.wall).filter(v => v !== undefined);
    let status = 'n/a';
    let shown = '–';
    if (vals.length) {
      const med = median(vals);
      shown = fmtDuration(med, t.model);
      status = (t.min === undefined || med >= t.min) && (t.max === undefined || med <= t.max) ? 'PASS' : 'FAIL';
    }
    console.log(`${status.padEnd(6)}${t.label.padEnd(44)}${shown}`);
  }
}

// Einstieg am Dateiende, damit alle Konstanten oben initialisiert sind
const args = parseArgs(process.argv.slice(2));
if (args.worker) await runWorker(args);
else await runParent(args);
