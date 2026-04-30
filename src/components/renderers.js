import t from '../data/i18n.js';
import {
  state,
  canAfford,
  buildingCount,
  calcNextBuildingCost,
  isBuildingUnlocked,
  unlockReason,
  isTechUnlocked,
  hasTech,
  hasProject,
  hasArtifact,
  totalBuildings,
  techCount,
  projectCount,
  artifactCount,
  colonyCount,
  isProjectRequirementMet,
  projectRequirementLabel,
  getTech
} from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot } from '../store/bonuses.js';
import {
  nextResearchCost,
  nextProjectCost,
  chronicleCost,
  colonyFoundCost,
  canFoundColony,
  colonyUpgradeCost,
  prestigeGain
} from '../engine/actions.js';
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { ARTIFACTS } from '../data/artifacts.js';
import {
  RESOURCES,
  RESOURCE_LABELS,
  MISSIONS,
  WORLDS,
  FOCI,
  DOCTRINES,
  OPERATIONS_MODES,
  PROTOCOLS,
  ACHIEVEMENTS,
  CHRONICLE_UPGRADES
} from '../data/misc.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { fmt, fmtSec } from '../lib/format.js';
import { getIcon, resIcon } from '../lib/icons.js';
import { escapeHtml } from '../lib/sanitize.js';
import { CHIPS } from '../data/chips.js';
import { STOCKS, BROKER_FEE, getStockPrice, getOwnedShares, portfolioValue, totalDividendRate, timeUntilNextPriceUpdate } from '../engine/stocks.js';
import { getDynamicMissionRewards } from '../engine/events.js';

function applyI18n(arr, prefix) {
  arr.forEach(item => {
    item._nameKey = prefix + item.id + '.name';
    item._descKey = prefix + item.id + '.desc';
    if (!item.__i18n_applied) {
      const origName = item.name;
      const origDesc = item.desc;
      Object.defineProperty(item, 'name', { get() { return t(this._nameKey, origName); } });
      Object.defineProperty(item, 'desc', { get() { return t(this._descKey, origDesc); } });
      item.__i18n_applied = true;
    }
  });
}
applyI18n(BUILDINGS, 'bld.');
applyI18n(TECHS, 'tech.');
applyI18n(PROJECTS, 'proj.');
applyI18n(ARTIFACTS, 'art.');
applyI18n(OPERATIONS_MODES, 'ops.');
applyI18n(PROTOCOLS, 'proto.');
applyI18n(MISSIONS, 'miss.');
applyI18n(ACHIEVEMENTS, 'ach.');

const ADMIN_USERNAME = 'Dominik';

function getTabs() {
  const tabs = [
    { id: 'overview', get label() { return t('tab.overview'); }, icon: 'scrap', get blurb() { return t('tab.overview.blurb'); } },
    { id: 'buildings', get label() { return t('tab.buildings'); }, icon: 'components', get blurb() { return t('tab.buildings.blurb'); } },
    { id: 'research', get label() { return t('tab.research'); }, icon: 'research', get blurb() { return t('tab.research.blurb'); } },
    { id: 'colonies', get label() { return t('tab.colonies'); }, icon: 'influence', get blurb() { return t('tab.colonies.blurb'); } },
    { id: 'expeditions', get label() { return t('tab.expeditions'); }, icon: 'time', get blurb() { return t('tab.expeditions.blurb'); } },
    { id: 'projects', get label() { return t('tab.projects'); }, icon: 'alloy', get blurb() { return t('tab.projects.blurb'); } },
    { id: 'market', get label() { return '// Börse'; }, icon: 'relics', get blurb() { return 'Ressourcen-Aktien kaufen & verkaufen.'; } },
    { id: 'prestige', get label() { return t('tab.prestige'); }, icon: 'time', get blurb() { return t('tab.prestige.blurb'); } },
    { id: 'account', get label() { return t('tab.account'); }, icon: 'lock', get blurb() { return t('tab.account.blurb'); } },
    { id: 'codex', get label() { return t('tab.codex'); }, icon: 'check', get blurb() { return t('tab.codex.blurb'); } }
  ];
  if (AstraforgeAPI.username === ADMIN_USERNAME) {
    tabs.push({ id: 'admin', label: '// Admin', icon: 'lock', blurb: 'Moderations-Panel.' });
  }
  return tabs;
}

// Admin panel data — set from App.jsx after API fetch
let adminUsers = [];
export function setAdminUsers(rows) { adminUsers = rows || []; }

let adminSelectedUser = null;
export function setAdminSelectedUser(user) { adminSelectedUser = user || null; }
export function getAdminSelectedUser() { return adminSelectedUser; }

export function collectAdminSaveEdits() {
  if (!adminSelectedUser) return null;
  let save = {};
  try { save = JSON.parse(adminSelectedUser.game_save || '{}'); } catch(e) {}

  const RESOURCE_NAMES = ['scrap', 'energy', 'alloy', 'components', 'data', 'research', 'influence', 'relics'];
  save.resources = save.resources || {};
  for (const r of RESOURCE_NAMES) {
    const el = document.getElementById(`admin-ed-res-${r}`);
    if (el) save.resources[r] = Number(el.value) || 0;
  }

  save.buildings = save.buildings || {};
  for (const b of BUILDINGS) {
    const el = document.getElementById(`admin-ed-bld-${b.id}`);
    if (el) save.buildings[b.id] = Math.max(0, Math.floor(Number(el.value) || 0));
  }

  save.stats = save.stats || {};
  for (const f of ['lifetime', 'prestigeCount', 'projectsBuilt', 'expeditionsDone', 'manualClicks', 'fleetXP', 'fleetLevel']) {
    const el = document.getElementById(`admin-ed-stat-${f}`);
    if (el) save.stats[f] = Number(el.value) || 0;
  }

  save.techs = TECHS.filter(t => document.getElementById(`admin-ed-tech-${t.id}`)?.checked).map(t => t.id);
  save.projects = PROJECTS.filter(p => document.getElementById(`admin-ed-proj-${p.id}`)?.checked).map(p => p.id);
  save.artifacts = ARTIFACTS.filter(a => document.getElementById(`admin-ed-art-${a.id}`)?.checked).map(a => a.id);

  const chronicle = document.getElementById('admin-ed-chronicle');
  if (chronicle) save.chronicle = Math.max(0, Math.floor(Number(chronicle.value) || 0));
  const mfSlots = document.getElementById('admin-ed-mainframeSlots');
  if (mfSlots) save.mainframeSlots = Math.max(1, Math.floor(Number(mfSlots.value) || 3));

  // Bump lastSave so cloud-load sees this as newer than the running session
  if (save.stats) save.stats.lastSave = Date.now();

  return JSON.stringify(save);
}

function tt(title, body, options = {}) {
  const chunks = [`<h4>${options.icon || getIcon('help')} ${escapeHtml(title)}</h4>`, `<p>${escapeHtml(body)}</p>`];
  if (options.meta) chunks.push(`<div class="tt-meta">${escapeHtml(options.meta)}</div>`);
  if (options.sectionTitle && options.sectionBody) {
    chunks.push(
      `<div class="tt-section"><div class="tt-section-title">${escapeHtml(options.sectionTitle)}</div>${options.sectionBody}</div>`
    );
  }
  if (options.requirement) {
    chunks.push(`<div class="tt-req">${getIcon('lock')} ${escapeHtml(options.requirement)}</div>`);
  }
  return `data-tt="${encodeURIComponent(chunks.join(''))}"`;
}

function ttCosts(cost) {
  return `
    <div class="tt-costs">
      ${Object.entries(cost).map(([res, amt]) => `
        <div>
          <span class="tt-res">${resIcon(res)} ${escapeHtml(RESOURCE_LABELS[res] || res)}</span>
          <span class="tt-val">${fmt(amt)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function button(label, attrs = '', disabled = false, extraClass = '') {
  return `<button class="${escapeHtml(classNames(extraClass))}" ${attrs}${disabled ? ' disabled' : ''}>${label}</button>`;
}

function statRow(label, value, tooltip) {
  return `<div ${tooltip || ''}><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function costMarkup(cost) {
  return Object.entries(cost).map(([res, amt]) => {
    const hasEnough = Number(state.resources[res] || 0) >= amt;
    return `<span class="${hasEnough ? 'good' : 'bad'}">${resIcon(res)} ${fmt(amt)}</span>`;
  }).join('');
}

function rewardMarkup(rewards) {
  return Object.entries(rewards).map(([res, amt]) => (
    `<span>${resIcon(res)} ${fmt(amt)}</span>`
  )).join('');
}

function formatEventEffectValue(key, value) {
  if (typeof value !== 'number') return String(value);
  if (key.endsWith('Mult') || key.endsWith('CostMult')) return `${value >= 1 ? '+' : ''}${Math.round((value - 1) * 100)}%`;
  if (key === 'relicChance' || key === 'eventResist' || key === 'expeditionRewardMult') return `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  if (key === 'expeditionPower' || key === 'clickPowerMult') return `x${fmt(value)}`;
  return fmt(value);
}

function eventEffectRows(event) {
  const effects = event?.effects || {};
  const labels = {
    allMult: t('fx.allMult'),
    scrapMult: t('fx.scrapMult'),
    energyMult: t('fx.energyMult'),
    dataMult: t('fx.dataMult'),
    researchMult: t('fx.researchMult'),
    influenceMult: t('fx.influenceMult'),
    relicMult: t('fx.relicMult'),
    relicChance: t('fx.relicChance'),
    eventResist: t('fx.eventResist'),
    buildingCostMult: t('fx.buildingCostMult'),
    projectCostMult: t('fx.projectCostMult'),
    expeditionRewardMult: t('fx.expeditionRewardMult'),
    expeditionPower: t('fx.expeditionPower'),
    clickPowerMult: t('fx.clickPowerMult')
  };
  const rows = Object.entries(effects).map(([key, value]) => `
    <div>
      <span class="tt-res">${escapeHtml(labels[key] || key)}</span>
      <span class="tt-val">${escapeHtml(formatEventEffectValue(key, value))}</span>
    </div>
  `).join('');
  return rows ? `<div class="tt-costs">${rows}</div>` : `<p>${t('misc.no_modifiers')}</p>`;
}

function sectorTooltip(event) {
  if (!event) {
    return tt(t('sec.situation'), t('misc.no_event'), {
      icon: getIcon('help'),
      meta: t('misc.quiet_phase'),
      sectionTitle: t('sec.status'),
      sectionBody: `<p>${t('misc.no_modifiers')}</p>`
    });
  }
  return tt(event.name, t('misc.active_event'), {
    icon: getIcon('help'),
    meta: t('misc.sector_event'),
    sectionTitle: t('sec.effects'),
    sectionBody: eventEffectRows(event)
  });
}

function resourceTooltip(res, amount, rate) {
  return tt(
    RESOURCE_LABELS[res] || res,
    `Aktueller Vorrat ${fmt(amount)}. Nettofluss ${rate >= 0 ? '+' : ''}${fmt(rate)}/s.`,
    {
      icon: resIcon(res),
      meta: 'LAGER',
      sectionTitle: 'Bedeutung',
      sectionBody: `<p>${escapeHtml(resourceLore(res))}</p>`
    }
  );
}

function resourceLore(res) {
  return t(`lore.${res}`, 'Resource.');
}

const TAB_SHORT = {
  overview: 'Home', buildings: 'Team', research: 'Tech', colonies: 'Büros',
  expeditions: 'Reisen', projects: 'Releases', market: 'Börse',
  prestige: 'Prestige', account: 'Config', codex: 'Codex', admin: 'Admin'
};

const TAB_KEY = {
  overview: 'O', buildings: 'B', research: 'R', colonies: 'C',
  expeditions: 'E', projects: 'P', market: 'M', prestige: 'S', account: 'A'
};

function renderTabsMarkup() {
  return getTabs().map((tab) => {
    const key = TAB_KEY[tab.id];
    const meta = key ? `${t('ui.nav')} · Taste [${key}]` : t('ui.nav');
    return `
    <button
      class="${classNames('tab', state.selectedTab === tab.id && 'active')}"
      data-action="tab"
      data-tab="${tab.id}"
      ${tt(tab.label, tab.blurb, { icon: getIcon(tab.icon), meta })}
    >
      <span class="tab-label-full">${escapeHtml(tab.label)}</span>
      <span class="tab-label-short">${escapeHtml(TAB_SHORT[tab.id] || tab.label)}</span>
    </button>
  `;
  }).join('');
}

function renderStickyResourcesMarkup() {
  const rates = state.cache.rates || estimateRatesSnapshot();
  return RESOURCES
    .filter((res) => state.stats.max[res] > 0 || res === 'scrap' || res === 'energy')
    .map((res) => {
      const rate = rates[res] || 0;
      const rateStr = rate !== 0 ? ` <span style="font-size:0.75em;opacity:0.65">${rate >= 0 ? '+' : ''}${fmt(rate)}/s</span>` : '';
      return `
        <div class="res-item" ${resourceTooltip(res, state.resources[res] || 0, rate)}>
          ${resIcon(res)} ${fmt(state.resources[res] || 0)}${rateStr}
        </div>
      `;
    })
    .join('');
}

function renderResourceGrid(rates) {
  return RESOURCES
    .filter((res) => state.stats.max[res] > 0 || res === 'scrap' || res === 'energy')
    .map((res) => `
      <article class="resource" ${resourceTooltip(res, state.resources[res] || 0, rates[res] || 0)}>
        <div class="row">
          <span>${resIcon(res)} ${escapeHtml(t(`res.${res}`, RESOURCE_LABELS[res] || res))}</span>
          <strong>${fmt(state.resources[res] || 0)}</strong>
        </div>
        <small>${(rates[res] || 0) >= 0 ? '+' : ''}${fmt(rates[res] || 0)}/s</small>
      </article>
    `)
    .join('');
}

function buildingFlowSummary(building, bonuses, owned = buildingCount(building.id)) {
  // Milestone matches estimateRatesSnapshot: +15% every 10 buildings of this type
  const milestone = 1 + Math.floor(owned / 10) * 0.15;
  const buildingBoost = bonuses.buildingMults?.[building.id] || 1;
  const converterInputMult = bonuses.converterInputMult || 1;
  const n = Math.max(1, owned);
  const outputs = Object.entries(building.outputs || {})
    .map(([res, amt]) => `${RESOURCE_LABELS[res] || res}: ${fmt(amt * building.rate * milestone * buildingBoost * n)}/s`)
    .join(' | ');
  const inputs = Object.entries(building.inputs || {})
    .map(([res, amt]) => `${RESOURCE_LABELS[res] || res}: ${fmt(amt * building.rate * milestone * buildingBoost * converterInputMult * n)}/s`)
    .join(' | ');
  return { outputs, inputs, milestone, buildingBoost };
}

function formatRequirementList(requirements) {
  return requirements.map((id) => projectRequirementLabel(id)).join(', ');
}

function tutorialChecklist() {
  const nextDataTech = TECHS.find((tech) => !hasTech(tech.id) && isTechUnlocked(tech));
  const nextProject = PROJECTS.find((project) => !hasProject(project.id) && project.prereq.every((req) => isProjectRequirementMet(req)));
  const moduleAccess = state.stats.max.components > 0 || buildingCount('npm_install') > 0;
  const influenceAccess = state.stats.max.influence > 0 || buildingCount('tech_blogger') > 0;
  const relicAccess = state.stats.max.relics > 0 || buildingCount('code_archeologist') > 0 || hasArtifact('floppy_disk');
  const isNewPlayer = state.stats.lifetime < 120 && totalBuildings() < 5;
  const steps = [];
  if (isNewPlayer) {
    steps.push({
      done: false,
      title: '👋 Wie funktioniert das Spiel?',
      body: 'Klick auf den großen Button im Dashboard um Code zu generieren. Mit Code stellst du Praktikanten ein (// Team), die automatisch produzieren. Forsche dann neue Technologien (// Sprachen) für Boni.'
    });
  }
  steps.push(
    {
      done: state.resources.scrap >= 250 && state.resources.energy >= 120,
      title: 'Frühspiel stabilisieren',
      body: 'Halte Code und Revenue positiv. Praktikanten erzeugen Code, Google Ads liefern Revenue — beides ist die Basis für alles Weitere.'
    },
    {
      done: hasTech('backend_node'),
      title: 'Node.js freischalten',
      body: 'Node.js öffnet den QA Tester und die erste Bug-Produktion. Bugs werden später zu Modulen umgewandelt.'
    },
    {
      done: moduleAccess,
      title: 'Module aufbauen',
      body: 'QA Tester erzeugen Bugs, NPM Install wandelt sie in Module. Module sind Voraussetzung für fortgeschrittene Tech-Pfade.'
    },
    {
      done: state.stats.max.data > 0,
      title: 'Users erschließen',
      body: 'SEO Experten liefern erste Users und Ideas. Growth Hacker vertieft den Datenpfad später über Module.'
    },
    {
      done: influenceAccess,
      title: 'Hype erzeugen',
      body: 'Tech Blogger wandeln Ideas in Hype — wichtig für Kolonien (// Standorte), Events und spätere Projekte.'
    },
    {
      done: relicAccess,
      title: 'Legacy Code sichern',
      body: 'Stack Overflow API und Code Archaeologists geben Zugang zu Relics — seltene Ressource für Prestige-Boni.'
    },
    {
      done: !!nextProject,
      title: 'Auf Releases hinarbeiten',
      body: nextProject ? `Nächstes verfügbares Release: ${nextProject.name}. Releases geben permanente Produktionsboni.` : 'Aktuell keine sichtbaren Releases offen — forsche weiter.'
    },
    {
      done: !nextDataTech,
      title: 'Nächste Forschung',
      body: nextDataTech ? `${nextDataTech.name} ist dein nächster Tech-Schritt (// Sprachen Tab).` : 'Der Tech-Baum ist für diesen Lauf vollständig offen oder abgeschlossen.'
    }
  );
  return steps;
}

function renderOverview() {
  const bonuses = state.cache.bonuses || computeBonuses();
  const rates = state.cache.rates || estimateRatesSnapshot();
  const gain = prestigeGain();
  const tutorialSteps = tutorialChecklist();
  const produced = rates.__produced || {};
  const consumed = rates.__consumed || {};
  const flowResources = RESOURCES.filter((res) =>
    state.stats.max[res] > 0
    || res === 'scrap'
    || res === 'energy'
    || (produced[res] || 0) > 0
    || (consumed[res] || 0) > 0
  );
  const totalConsumption = flowResources.reduce((sum, res) => sum + Math.max(0, Number(consumed[res] || 0)), 0);
  const totalProduction = flowResources.reduce((sum, res) => sum + Math.max(0, Number(produced[res] || 0)), 0);
  const activeProtocol = PROTOCOLS.find((entry) =>
    entry.id === state.activeProtocol && Number(state.activeProtocolEndsAt || 0) > Date.now()
  ) || null;
  const currentMode = OPERATIONS_MODES.find((entry) => entry.id === state.operationsMode) || OPERATIONS_MODES[0];
  const activeEventText = state.event
    ? `${state.event.name} für ${fmtSec(Math.max(0, (state.eventEnds - Date.now()) / 1000))}`
    : 'Stille Bahn';

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('overview.eyebrow')}</p>
        <h2>${t('overview.title')}</h2>
        <p class="hero-text">${t('overview.subtitle')}</p>
        ${state.stats.lifetime < 60 ? `<p class="muted" style="margin-top:8px;font-size:0.85rem;">💡 <strong>Neu?</strong> Klick auf <strong>IDE</strong> (unten) um Code zu hacken, dann unter <strong>// Team</strong> Praktikanten einstellen.</p>` : ''}
      </div>
      <div class="hero-grid">
        ${statRow(t('ui.buildings'), fmt(totalBuildings()), tt('Team-Größe', 'Gesamtanzahl aller aktiven Mitarbeiter und Systeme in diesem Run.', { icon: getIcon('alloy') }))}
        ${statRow(t('ui.research'), fmt(techCount()), tt('Tech Stack', 'Anzahl der bisher erforschten Frameworks und Technologien.', { icon: getIcon('research') }))}
        ${statRow(t('ui.colonies'), fmt(colonyCount()), tt('Standorte', 'Aktive Büros – erhöhen Produktionslimits und geben Boni.', { icon: getIcon('influence') }))}
        ${statRow(t('ui.prestige_now'), fmt(gain), tt('XP bei Refactor', gain > 0 ? 'Starte einen Hard Refactor (// git rebase) um diese XP zu sammeln.' : 'Noch zu wenig Fortschritt für einen Refactor — baue weiter aus.', { icon: getIcon('time') }))}
        ${statRow('Produktion/s', `${fmt(totalProduction)}/s`, tt('Gesamtproduktion', 'Summe aller Ressourcen-Outputs pro Sekunde.', { icon: getIcon('scrap') }))}
        ${statRow('Verbrauch/s', `${fmt(totalConsumption)}/s`, tt('Gesamtverbrauch', 'Summe aller Ressourcen-Inputs (Konverter) pro Sekunde.', { icon: getIcon('energy') }))}
      </div>
    </section>

    <section class="resource-grid">
      ${renderResourceGrid(rates)}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">PROGRESSION GUIDE</p>
          <h3>${getIcon('check')} Nächste sinnvolle Schritte</h3>
          <p class="muted">Zeigt dir wo neue Ressourcen herkommen und was als nächstes zu tun ist. Hover/Tap für Details.</p>
        </div>
        <span class="muted">${tutorialSteps.filter(s => s.done).length}/${tutorialSteps.length} erledigt</span>
      </div>
      <div class="card-grid">
        ${tutorialSteps.map((step) => `
          <article class="item ${step.done ? 'done' : ''}" ${tt(step.title, step.body, {
            icon: getIcon(step.done ? 'check' : 'help'),
            meta: step.done ? '✓ ERLEDIGT' : '→ NÄCHSTER SCHRITT'
          })}>
            <div class="item-head">
              <strong>${escapeHtml(step.title)}</strong>
              <span class="badge">${step.done ? '✓ OK' : 'Offen'}</span>
            </div>
            <p class="muted">${escapeHtml(step.body)}</p>
          </article>
        `).join('')}
      </div>
    </section>

    <section class="card resource-flow-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.resource_balance')}</p>
          <h3>${getIcon('energy')} ${t('sec.running_costs')}</h3>
          <p class="muted">${t('sec.live_values')}</p>
        </div>
      </div>
      <div class="flow-grid">
        <div class="flow-row flow-head">
          <span>${t('sec.resource')}</span>
          <strong>${t('sec.prod_s')}</strong>
          <strong>${t('sec.cons_s')}</strong>
          <strong>${t('sec.net_s')}</strong>
        </div>
        ${flowResources.map((res) => {
          const prod = Number(produced[res] || 0);
          const cons = Number(consumed[res] || 0);
          const net = Number(rates[res] || 0);
          return `
            <div class="flow-row" ${resourceTooltip(res, state.resources[res] || 0, rates[res] || 0)}>
              <span>${resIcon(res)} ${escapeHtml(RESOURCE_LABELS[res] || res)}</span>
              <strong class="good">${fmt(prod)}</strong>
              <strong class="${cons > 0 ? 'warn' : 'muted'}">${fmt(cons)}</strong>
              <strong class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${fmt(net)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <section class="overview-main-grid">
      <article class="card panel-emphasis clicker-section cookie-core">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('sec.core_access')}</p>
            <h3>${getIcon('scrap')} ${t('sec.core_drive')}</h3>
            <p class="muted">${t('sec.core_desc')}</p>
          </div>
        </div>
        <div class="code-line mb-4">
          <span class="muted">const</span> <span class="accent">code</span> = <span class="glow-text">${fmt(state.resources.scrap)}</span><span class="blink-cursor"></span>
        </div>
        <div class="core-clicker-wrap">
          <button
            class="core-clicker-btn core-clicker-btn-lg active"
            data-action="manual-click"
            ${tt(t('sec.core_drive'), t('sec.core_desc'), {
              icon: getIcon('scrap'),
              meta: t('misc.action'),
              sectionTitle: t('sec.status'),
              sectionBody: `<p>${t('sec.click_power')} x${fmt(bonuses.clickPowerMult || 1)}. Klicks: ${fmt(state.stats.manualClicks || 0)}.</p>`
            })}
          >
            ${getIcon('scrap')}
          </button>
          <div class="core-clicker-caption">
            <strong>${t('sec.harvest_core')}</strong>
            <span>${t('sec.tap_hold')}</span>
          </div>
        </div>
        <div class="stat-list compact">
          ${statRow(t('sec.click_power'), `x${fmt(bonuses.clickPowerMult || 1)}`)}
          ${statRow(t('sec.fleet_window'), `${bonuses.availableExpeditionSlots}/${bonuses.expeditionSlots}`)}
          ${statRow(t('sec.anomaly'), state.asteroidActive ? t('sec.in_field') : t('sec.waiting'))}
          ${statRow(t('sec.event'), escapeHtml(activeEventText))}
        </div>
      </article>

      <article class="card panel-tone">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('sec.sector_console')}</p>
            <h3>${getIcon('help')} ${t('sec.situation')}</h3>
          </div>
        </div>
        <div class="dense-list">
          <div class="dense-row" ${sectorTooltip(state.event)}>
            <span>Sektor</span>
            <strong>${escapeHtml(activeEventText)}</strong>
          </div>
            <div class="dense-row" ${tt('Cloud-Verbindung', AstraforgeAPI.isLoggedIn() ? `Eingeloggt als ${AstraforgeAPI.username}. Fortschritt wird automatisch synchronisiert.` : 'Nicht eingeloggt. Unter ~/config anmelden für Cloud-Save.', { icon: getIcon('data') })}>
              <span>${t('sec.archive_net')}</span>
            <strong>${AstraforgeAPI.isLoggedIn() ? escapeHtml(AstraforgeAPI.username || 'Verbunden') : 'Lokal'}</strong>
          </div>
            <div class="dense-row" ${tt(t('sec.offline_limit'), 'Maximale Offline-Produktionszeit.', { icon: getIcon('time') })}>
              <span>${t('sec.offline_limit')}</span>
            <strong>${fmt(bonuses.offlineCapHours)}h</strong>
          </div>
            <div class="dense-row" ${tt(t('sec.offline_eff'), 'Wie stark Offline-Zeit umgerechnet wird.', { icon: getIcon('time') })}>
              <span>${t('sec.offline_eff')}</span>
            <strong>${Math.round((bonuses.offlineEfficiency || 0) * 100)}%</strong>
          </div>
            <div class="dense-row" ${tt(t('sec.ops_mode'), 'Globaler Lastmodus.', { icon: getIcon('help') })}>
              <span>${t('sec.ops_mode')}</span>
            <strong>${escapeHtml(currentMode?.name || 'Balanciert')}</strong>
          </div>
            <div class="dense-row" ${tt(t('sec.protocol'), 'Temporäre Effekte mit Cooldown.', { icon: getIcon('research') })}>
              <span>${t('sec.protocol')}</span>
              <strong>${activeProtocol ? escapeHtml(activeProtocol.name) : t('sec.none_active')}</strong>
          </div>
        </div>
        ${!AstraforgeAPI.isLoggedIn()
          ? `<div class="panel-note">${button(t('sec.archive_net'), `data-action="focus-auth" ${tt(t('sec.archive_net'), 'Zum Netzwerk wechseln.', { icon: getIcon('data'), meta: 'WECHSEL' })}`)}</div>`
          : ''}
      </article>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.automation')}</p>
          <h3>${getIcon('time')} ${t('sec.control_matrix')}</h3>
          <p class="muted">${t('sec.auto_desc')}</p>
        </div>
      </div>
      <div class="toggle-row">
        ${button(
          `${t('sec.auto_build')} ${state.auto.build ? t('ui.on') : t('ui.off')}`,
          `data-action="toggle" data-id="build" ${tt(t('sec.auto_build'), 'Stellt Mitarbeiter automatisch ein.', {
            icon: getIcon('components'),
            requirement: hasTech('auto_build_tech') ? '' : 'Benötigt Auto-Hire Skript.'
          })}`,
          !hasTech('auto_build_tech'),
          state.auto.build ? 'active' : ''
        )}
        ${button(
          `${t('sec.auto_research')} ${state.auto.research ? t('ui.on') : t('ui.off')}`,
          `data-action="toggle" data-id="research" ${tt(t('sec.auto_research'), 'Lernt Tech-Stacks automatisch.', {
            icon: getIcon('research'),
            requirement: hasTech('auto_research_tech') ? '' : 'Benötigt Auto-Tutorials.'
          })}`,
          !hasTech('auto_research_tech'),
          state.auto.research ? 'active' : ''
        )}
        ${button(
          `${t('sec.auto_exp')} ${state.auto.expeditions ? t('ui.on') : t('ui.off')}`,
          `data-action="toggle" data-id="expeditions" ${tt(t('sec.auto_exp'), 'Nimmt Freelance-Aufträge automatisch an.', {
            icon: getIcon('time'),
            requirement: hasTech('auto_expeditions_tech') ? '' : 'Benötigt Auto-Freelance.'
          })}`,
          !hasTech('auto_expeditions_tech'),
          state.auto.expeditions ? 'active' : ''
        )}
        ${button(
          `${t('sec.auto_proj')} ${state.auto.projects ? t('ui.on') : t('ui.off')}`,
          `data-action="toggle" data-id="projects" ${tt(t('sec.auto_proj'), 'Launched Produkte bei genug Vorräten.', {
            icon: getIcon('alloy'),
            requirement: hasTech('auto_projects_tech') ? '' : 'Benötigt Auto-Deploy.'
          })}`,
          !hasTech('auto_projects_tech'),
          state.auto.projects ? 'active' : ''
        )}
      </div>
      <div class="throttle-panel">
        <span class="muted">${t('sec.conv_throttle')}</span>
        <div class="toggle-row">
          ${['0.25', '0.5', '0.75', '1'].map((value) => {
            const numeric = Number(value);
            return button(
              `${Math.round(numeric * 100)}%`,
              `data-action="set-converter-throttle" data-value="${value}" ${tt('Konverter-Drossel', `Begrenzt Wandler auf ${Math.round(numeric * 100)}% ihrer Nennlast.`, {
                icon: getIcon('energy'),
                meta: 'STABILISIERUNG'
              })}`,
              false,
              state.converterThrottle === numeric ? 'active' : ''
            );
          }).join('')}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.tactics')}</p>
          <h3>${getIcon('help')} ${t('sec.ops')}</h3>
          <p class="muted">Aktuell: ${escapeHtml(currentMode?.name || 'Balanciert')}.</p>
        </div>
      </div>
      <div class="toggle-row">
        ${OPERATIONS_MODES.map((mode) => button(
          mode.name,
          `data-action="set-operations-mode" data-id="${mode.id}" ${tt(mode.name, mode.desc, {
            icon: getIcon('help'),
            meta: mode.id.toUpperCase()
          })}`,
          false,
          state.operationsMode === mode.id ? 'active' : ''
        )).join('')}
      </div>
      <div class="protocol-grid">
        ${PROTOCOLS.map((protocol, index) => {
          const missing = (protocol.prereq || []).filter((id) => !hasTech(id));
          const locked = missing.length > 0;
          const cooldownUntil = Number(state.protocolCooldowns?.[protocol.id] || 0);
          const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
          const running = activeProtocol?.id === protocol.id;
          const anotherRunning = !!activeProtocol && !running;
          const affordable = canAfford(protocol.cost || {});
          const disabled = locked || running || anotherRunning || cooldownLeft > 0 || !affordable;
          const title = locked ? '???' : protocol.name;
          const description = locked ? 'Versiegeltes Protokoll. Voraussetzungen fehlen.' : protocol.desc;
          const status = running
            ? `Aktiv für ${fmtSec(Math.max(0, (state.activeProtocolEndsAt - Date.now()) / 1000))}`
            : cooldownLeft > 0
              ? `Cooldown ${fmtSec(cooldownLeft)}`
              : locked
                ? 'Versiegelt'
                : affordable
                  ? 'Bereit'
                  : 'Ressourcen fehlen';
          return `
            <article class="item ${locked ? 'locked' : ''}" ${tt(title, description, {
              icon: getIcon('research'),
              meta: `PROTOKOLL #${index + 1}`,
              sectionTitle: locked ? 'Status' : 'Kosten',
              sectionBody: locked ? `<p>Freischaltung benötigt: ${(protocol.prereq || []).map((id) => getTech(id)?.name || id).join(', ')}</p>` : ttCosts(protocol.cost || {}),
              requirement: locked ? `Benötigt Forschung: ${(protocol.prereq || []).map((id) => getTech(id)?.name || id).join(', ')}` : ''
            })}>
              <div class="item-head">
                <strong>${escapeHtml(title)}</strong>
                <span class="badge">${escapeHtml(status)}</span>
              </div>
              <p class="muted">${escapeHtml(description)}</p>
              ${locked ? '' : `<div class="cost-row">${costMarkup(protocol.cost || {})}</div>`}
              ${button(
                running ? 'Läuft' : (cooldownLeft > 0 ? 'Abklingzeit' : 'Aktivieren'),
                `data-action="activate-protocol" data-id="${protocol.id}"`,
                disabled,
                !disabled ? 'active' : ''
              )}
            </article>
          `;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.chronicle')}</p>
          <h3>${getIcon('data')} ${t('sec.last_signals')}</h3>
        </div>
        <span class="muted">${fmt(state.log.length)} ${t('sec.entries')}</span>
      </div>
      <div class="log-list">
        ${state.log.map((entry, index) => `
          <div class="log-item" ${tt('Chronikeintrag', entry.text, {
            icon: getIcon('data'),
            meta: index === 0 ? 'NEU' : 'ARCHIV'
          })}>
            <span>${new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <p>${entry.text}</p>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderBuildings() {
  const bonuses = state.cache.bonuses || computeBonuses();
  const groups = BUILDINGS.reduce((acc, building) => {
    const key = building.category || 'Sonstige';
    if (!acc[key]) acc[key] = [];
    acc[key].push(building);
    return acc;
  }, {});
  const orderedCategories = ['Dev Team', 'Sales & Ads', 'QA & DevOps', 'Marketing & R&D', 'Social Media', 'Management', 'C-Level'];
  const categories = [
    ...orderedCategories.filter((category) => Array.isArray(groups[category]) && groups[category].length > 0),
    ...Object.keys(groups).filter((category) => !orderedCategories.includes(category))
  ];

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('buildings.eyebrow')}</p>
        <h2>${t('buildings.title')}</h2>
        <p class="hero-text">${t('buildings.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow('Devs (LOC)', fmt(buildingCount('intern') + buildingCount('junior_dev') + buildingCount('mid_dev')))}
        ${statRow('Revenue (Ads)', fmt(buildingCount('google_ads') + buildingCount('freemium_model') + buildingCount('subscription_trap')))}
        ${statRow('Gesamtteam', fmt(totalBuildings()))}
        ${statRow('Gehaltsfaktor', `x${fmt(bonuses.buildingCostMult)}`)}
      </div>
    </section>
    ${categories.map((category) => {
      const catBuildings = groups[category];
      const ownedCount = catBuildings.filter(b => buildingCount(b.id) > 0).length;
      const anyAffordable = catBuildings.some(b => isBuildingUnlocked(b) && canAfford(calcNextBuildingCost(b)));
      const isFirst = category === categories[0];
      const open = ownedCount > 0 || anyAffordable || isFirst;
      const catIcon = getIcon(category === 'Energie' ? 'energy' : category === 'Wissen' ? 'research' : category === 'Netzwerk' ? 'influence' : 'alloy');
      return `
      <section class="card category-section">
        <details data-cat="${escapeHtml(category)}" ${open ? 'open' : ''}>
          <summary class="category-summary">
            <div>
              <p class="eyebrow">${t('ui.category')}</p>
              <h3>${catIcon} ${escapeHtml(category)}</h3>
              <p class="muted">${ownedCount > 0 ? `${ownedCount} / ${catBuildings.length} eingestellt` : `${catBuildings.length} verfügbar`}</p>
            </div>
            <span class="category-chevron">▼</span>
          </summary>
          <div class="card-grid">
          ${catBuildings.map((building) => {
            const owned = buildingCount(building.id);
            const unlocked = isBuildingUnlocked(building);
            const cost = calcNextBuildingCost(building);
            const affordable = unlocked && canAfford(cost);
            const flow = buildingFlowSummary(building, bonuses, owned);
            const tooltip = tt(building.name, building.desc, {
              icon: getIcon(building.category === 'Energie' ? 'energy' : building.category === 'Wissen' ? 'research' : building.category === 'Netzwerk' ? 'influence' : 'alloy'),
              meta: `${building.category.toUpperCase()} | ${building.type.toUpperCase()}`,
              sectionTitle: 'Nächste Kosten',
              sectionBody: `${ttCosts(cost)}<div class="tt-section"><div class="tt-section-title">Pro Sekunde (bei aktuellem Bestand)</div><p>Output: ${escapeHtml(building.type === 'modifier' ? 'Passiver Bonus' : (flow.outputs || t('ui.none')))}<br/>Input: ${escapeHtml(flow.inputs || t('ui.none'))}<br/>Meilenstein: x${fmt(flow.milestone)} | Gebäudebonus: x${fmt(flow.buildingBoost)}</p></div>`,
              requirement: unlocked ? '' : unlockReason(building)
            });
            return `
              <article class="item ${unlocked ? '' : 'locked'}" ${tooltip}>
                <div class="item-head">
                  <strong>${escapeHtml(building.name)}</strong>
                  <span class="badge">${escapeHtml(building.category)}</span>
                </div>
                <p class="muted">${escapeHtml(building.desc)}</p>
                <div class="stat-list compact">
                  ${statRow(t('ui.owned'), fmt(owned))}
                  ${owned > 0 && flow.outputs ? statRow('Output/s', flow.outputs) : (building.type === 'modifier' && owned > 0 ? statRow('Effekt', 'Passiver Bonus') : '')}
                  ${owned > 0 && flow.inputs ? statRow('Input/s', flow.inputs) : ''}
                  ${owned === 0 ? statRow('Output/s (×1)', building.type === 'modifier' ? 'Passiver Bonus' : (flow.outputs || t('ui.none'))) : ''}
                </div>
                <div class="cost-row">${costMarkup(cost)}</div>
                <div class="item-footer">
                  <div class="toggle-row">
                    ${button('+1', `data-action="buy-building" data-id="${building.id}" data-qty="1" ${tt('Einstellen', `${building.name} einmal einstellen.`, { icon: getIcon('alloy'), sectionTitle: 'Kosten', sectionBody: ttCosts(cost) })}`, !affordable)}
                    ${button('+10', `data-action="buy-building" data-id="${building.id}" data-qty="10" ${tt('Team +10', `${building.name} im 10er-Pack einstellen. Kauft so viele wie möglich.`, { icon: getIcon('alloy') })}`, !unlocked)}
                    ${button('+50', `data-action="buy-building" data-id="${building.id}" data-qty="50" ${tt('Team +50', `${building.name} im 50er-Pack einstellen. Kauft so viele wie möglich.`, { icon: getIcon('alloy') })}`, !unlocked, affordable ? 'active' : '')}
                  </div>
                  ${!unlocked ? `<small class="bad">${escapeHtml(unlockReason(building))}</small>` : `<small class="muted">${t('sec.step_bonus')}</small>`}
                </div>
              </article>
            `;
          }).join('')}
          </div>
        </details>
      </section>
    `;
    }).join('')}
  `;
}

function getTechUnlocks(techId) {
  const unlocks = [];
  TECHS.forEach(t => { if (t.prereq?.includes(techId)) unlocks.push('• Forschung: ' + t.name); });
  BUILDINGS.forEach(b => { if (b.unlock === 'tech:' + techId) unlocks.push('• Gebäude: ' + b.name); });
  PROJECTS.forEach(p => { if (p.prereq?.includes(techId)) unlocks.push('• Projekt: ' + p.name); });
  PROTOCOLS.forEach(p => { if (p.prereq?.includes(techId)) unlocks.push('• Protokoll: ' + p.name); });
  return unlocks;
}

function renderResearch() {
  const bonuses = state.cache.bonuses || computeBonuses();
  const visibleTechs = TECHS.filter((tech) => !hasTech(tech.id) && isTechUnlocked(tech));
  const hiddenTechs = TECHS.filter((tech) => 
    !hasTech(tech.id) && 
    !isTechUnlocked(tech) && 
    !(tech.excludes && tech.excludes.some(id => hasTech(id)))
  );
  const hiddenCount = hiddenTechs.length;
  const completed = TECHS.filter((tech) => hasTech(tech.id));

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('research.eyebrow')}</p>
        <h2>${t('research.title')}</h2>
        <p class="hero-text">${t('research.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('ui.available'), fmt(visibleTechs.length))}
        ${statRow(t('ui.hidden'), fmt(hiddenCount), tt('Verborgene Forschungen', 'Erscheinen wenn Voraussetzungen erfüllt sind.', { icon: getIcon('lock') }))}
        ${statRow(t('ui.completed'), fmt(completed.length))}
        ${statRow(t('ui.cost_factor'), `x${fmt(bonuses.researchCostMult)}`)}
      </div>
    </section>
    <section class="card-grid">
      ${visibleTechs.map((tech) => {
        const cost = nextResearchCost(tech, bonuses);
        const affordable = state.resources.research >= cost;
        const unlocks = getTechUnlocks(tech.id);
        const unlocksSection = unlocks.length > 0 
          ? `<div class="tt-section"><div class="tt-section-title">Schaltet frei</div><p>${escapeHtml(unlocks.join('\\n')).replace(/\\n/g, '<br>')}</p></div>` 
          : '';
        return `
          <article class="item" ${tt(tech.name, tech.desc, {
            icon: getIcon('research'),
            meta: 'FRAMEWORK',
            sectionTitle: t('ui.cost'),
            sectionBody: `<p>${fmt(cost)} ${t('res.research')}</p>${unlocksSection}`
          })}>
            <div class="item-head">
              <strong>${escapeHtml(tech.name)}</strong>
              <span class="badge">${fmt(cost)}</span>
            </div>
            <p class="muted">${escapeHtml(tech.desc)}</p>
            <div class="dense-list">
              <div class="dense-row">
                <span>Status</span>
                <strong>${affordable ? t('ui.ready') : t('sec.not_enough')}</strong>
              </div>
              <div class="dense-row">
                <span>${t('sec.prereq')}</span>
                <strong>${tech.prereq.length ? escapeHtml(tech.prereq.map((id) => projectRequirementLabel(id)).join(', ')) : 'Keine'}</strong>
              </div>
            </div>
            <div class="item-footer">
              ${button(
                t('sec.research_btn'),
                `data-action="buy-tech" data-id="${tech.id}" ${tt('Siegel brechen', `${tech.name} sofort erforschen.`, { icon: getIcon('research') })}`,
                !affordable,
                affordable ? 'active' : ''
              )}
            </div>
          </article>
        `;
      }).join('')}
      ${hiddenTechs.map((tech, idx) => `
        <article class="item locked" ${tt('???', 'Dieses Framework ist noch nicht freigeschaltet.', {
          icon: getIcon('lock'),
          meta: `GESPERRT #${idx + 1}`,
          requirement: tech.prereq.length ? `Benötigt: ${formatRequirementList(tech.prereq)}` : 'Noch nicht sichtbar.'
        })}>
          <div class="item-head">
            <strong>???</strong>
            <span class="badge">GESPERRT</span>
          </div>
          <p class="muted">${t('sec.unknown_research')}</p>
          <div class="dense-list">
            <div class="dense-row">
              <span>${t('sec.status')}</span>
              <strong>${t('ui.sealed')}</strong>
            </div>
            <div class="dense-row">
              <span>Zugang</span>
              <strong>???</strong>
            </div>
          </div>
          <div class="item-footer">
            ${button('???', `${tt('???', 'Kein Zugriff. Voraussetzungen fehlen.', { icon: getIcon('lock') })}`, true)}
          </div>
        </article>
      `).join('')}
      ${!visibleTechs.length && !hiddenTechs.length ? `
        <div class="card empty-state">
          <h3>${getIcon('check')} ${t('sec.all_researched')}</h3>
          <p class="muted">${t('sec.no_open_seals')}</p>
        </div>
      ` : ''}
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">GELERNT</p>
          <h3>${getIcon('check')} Freigeschaltete Frameworks</h3>
        </div>
        <span class="muted">${fmt(completed.length)} ${t('ui.active')}</span>
      </div>
      <div class="tag-list">
        ${completed.length
          ? completed.map((tech) => `<span class="chip" ${tt(tech.name, tech.desc, { icon: getIcon('check'), meta: t('ui.active') })}>${escapeHtml(tech.name)}</span>`).join('')
          : `<p class="muted">${t('sec.no_open_seals')}</p>`}
      </div>
    </section>
  `;
}

function renderColonies() {
  const bonuses = state.cache.bonuses || computeBonuses();
  const cost = colonyFoundCost();
  const unlocked = bonuses.colonyCap > 0;

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('colonies.eyebrow')}</p>
        <h2>${t('colonies.title')}</h2>
        <p class="hero-text">${t('colonies.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('sec.colony_limit'), fmt(bonuses.colonyCap))}
        ${statRow(t('ui.active'), fmt(state.colonies.length))}
        ${statRow(t('sec.doctrine'), escapeHtml(state.doctrine))}
        ${statRow(t('sec.colony_mult'), `x${fmt(bonuses.colonyOutputMult)}`)}
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.founding')}</p>
          <h3>${getIcon('influence')} ${t('sec.new_outpost')}</h3>
          <p class="muted">${unlocked ? 'Jede Gründung bindet eine weitere Welt.' : 'Benötigt Kolonial-Charta.'}</p>
        </div>
        <div style="display:flex; gap:12px;">
          ${button(
            t('sec.found_colony'),
            `data-action="found-colony" ${tt(t('sec.found_colony'), 'Gründet einen neuen Vorposten.', {
              icon: getIcon('influence'),
              sectionTitle: 'Kosten',
              sectionBody: ttCosts(cost),
              requirement: unlocked ? '' : 'Benötigt Standort-Lizenz (Forschung: Remote Work Policy).'
            })}`,
            !canFoundColony(),
            canFoundColony() ? 'active' : ''
          )}
          ${state.colonies.length > 0 ? button(
            'Upgrade All',
            `data-action="upgrade-all-colonies" ${tt('Upgrade All', 'Wertet alle Standorte soweit wie möglich auf.', { icon: getIcon('alloy') })}`,
            false,
            'active'
          ) : ''}
        </div>
      </div>
      <div class="cost-row">${costMarkup(cost)}</div>
    </section>

    <section class="card-grid">
      ${state.colonies.length
        ? state.colonies.map((colony) => {
            const world = WORLDS.find((entry) => entry.id === colony.world) || WORLDS[0];
            const focus = FOCI.find((entry) => entry.id === colony.focus) || FOCI[0];
            const upgradeCost = colonyUpgradeCost(colony);
            const canUpgrade = canAfford(upgradeCost);
            return `
              <article class="item" ${tt(colony.name, `${world.name}. Fokus ${focus.name}.`, {
                icon: getIcon('influence'),
                meta: 'KOLONIE',
                sectionTitle: 'Weltbonus',
                sectionBody: `<p>${escapeHtml(world.name)} | ${escapeHtml(focus.desc)}</p>`
              })}>
                <div class="item-head">
                  <strong>${escapeHtml(colony.name)}</strong>
                  <span class="badge">Lvl ${fmt(colony.level)}</span>
                </div>
                <p class="muted">${escapeHtml(world.name)} | Fokus ${escapeHtml(focus.name)}</p>
                <div class="stat-list compact">
                  ${statRow(t('sec.stability'), `${fmt(colony.stability)}%`)}
                  ${statRow(t('sec.focus'), escapeHtml(focus.name))}
                  ${statRow(t('sec.world'), escapeHtml(world.name))}
                  ${statRow(t('sec.bonus'), escapeHtml(focus.desc))}
                </div>
                <div class="cost-row">${costMarkup(upgradeCost)}</div>
                <div class="item-footer">
                  <div class="toggle-row">
                    ${button(t('sec.rotate_focus'), `data-action="cycle-focus" data-id="${colony.id}" ${tt(t('sec.rotate_focus'), 'Dreht den Fokus weiter. Kostet etwas Stabilität.', { icon: getIcon('help') })}`)}
                    ${button(t('sec.upgrade'), `data-action="upgrade-colony" data-id="${colony.id}" ${tt(t('sec.upgrade'), 'Hebt Stufe und Stabilität.', {
                      icon: getIcon('alloy'),
                      sectionTitle: t('sec.upgrade_cost'),
                      sectionBody: ttCosts(upgradeCost)
                    })}`, !canUpgrade, canUpgrade ? 'active' : '')}
                  </div>
                </div>
              </article>
            `;
          }).join('')
        : `<div class="card empty-state">
            <h3>${getIcon('lock')} ${t('sec.no_outposts')}</h3>
            <p class="muted">Benötigt Kolonial-Charta.</p>
          </div>`}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.doctrine_title')}</p>
          <h3>${getIcon('help')} ${t('sec.doctrines')}</h3>
        </div>
        <span class="muted">${bonuses.doctrineUnlock ? (state.doctrine ? 'AKTIV' : t('sec.unlocked')) : t('ui.sealed')}</span>
      </div>
      ${state.doctrine ? (() => {
        const active = DOCTRINES.find(d => d.id === state.doctrine);
        const EFFECTS = { efficiency: ['+6% Gesamt-Output', '−3% Gebäudekosten'], expansion: ['+2% Output', '+8% Expedition-Power', '+1 Kolonie-Slot'], insight: ['+12% Forschung', '+10% Relikte', '+2% Relikte-Chance'], dominion: ['+12% Einfluss', '−5% Projektkosten', '+3% Event-Resistenz'] };
        const tags = (EFFECTS[active?.id] || []).map(e => `<span class="badge good">${escapeHtml(e)}</span>`).join(' ');
        return `<div class="dense-row" style="align-items:flex-start;gap:12px;padding:10px 0 4px;">
          <div>
            <strong>${escapeHtml(active?.name || state.doctrine)}</strong>
            <p class="muted" style="margin:3px 0 6px;">${escapeHtml(active?.desc || '')}</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${tags}</div>
          </div>
          <span class="badge active" style="white-space:nowrap;flex-shrink:0;">Aktiv</span>
        </div>
        <p class="muted" style="font-size:0.8em;margin:6px 0 0;">Die Doktrin ist für diesen Run gesetzt und kann nicht geändert werden.</p>`;
      })() : `
      <div class="card-grid">
        ${DOCTRINES.map((doctrine) => {
          const EFFECTS = { efficiency: ['+6% Gesamt-Output', '−3% Gebäudekosten'], expansion: ['+2% Output', '+8% Expedition-Power', '+1 Kolonie-Slot'], insight: ['+12% Forschung', '+10% Relikte', '+2% Relikte-Chance'], dominion: ['+12% Einfluss', '−5% Projektkosten', '+3% Event-Resistenz'] };
          const effectTags = (EFFECTS[doctrine.id] || []).map(e => `<span class="badge good" style="font-size:0.75em;">${escapeHtml(e)}</span>`).join(' ');
          return `
          <article class="item" ${tt(doctrine.name, doctrine.desc, {
            icon: getIcon('help'),
            meta: 'DOKTRIN',
            requirement: bonuses.doctrineUnlock ? '' : 'Kultur-Konzept benötigt.'
          })}>
            <div class="item-head">
              <strong>${escapeHtml(doctrine.name)}</strong>
            </div>
            <p class="muted" style="margin:4px 0 6px;font-size:0.85em;">${escapeHtml(doctrine.desc)}</p>
            <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;">${effectTags}</div>
            ${button('Wählen', `data-action="doctrine" data-id="${doctrine.id}"`, !bonuses.doctrineUnlock, 'active')}
          </article>
        `}).join('')}
      </div>`}
    </section>
  `;
}

function renderExpeditions() {
  const bonuses = state.cache.bonuses || computeBonuses();

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('expeditions.eyebrow')}</p>
        <h2>${t('expeditions.title')}</h2>
        <p class="hero-text">${t('expeditions.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('ui.free_slots'), `${bonuses.availableExpeditionSlots}/${bonuses.expeditionSlots}`)}
        ${statRow('Team-Seniorität', `${fmt(bonuses.availableExpeditionPower)}/${fmt(bonuses.totalExpeditionPower)}`)}
        ${statRow('Management-Level', fmt(state.stats.fleetLevel || 0))}
        ${statRow('Aufträge erledigt', fmt(state.stats.expeditionsDone || 0))}
      </div>
    </section>
    <section class="card-grid">
      ${MISSIONS.map((mission) => {
        const powerReq = mission.power * 0.65;
        const canLaunch = bonuses.availableExpeditionSlots > 0 && bonuses.availableExpeditionPower >= powerReq;
        const successPct = Math.round(Math.min(96, Math.max(35, 50 + (bonuses.expeditionPower / (mission.power || 1)) * 12 + bonuses.eventResist * 100)));
        const successClass = successPct >= 80 ? 'good' : successPct >= 60 ? 'warn' : 'bad';
        const rates = state.cache.rates || estimateRatesSnapshot();
        const dynRewards = getDynamicMissionRewards(mission, bonuses, rates);
        return `
          <article class="item" ${tt(mission.name, `Dauer ${fmtSec(mission.duration)}. Skill-Req: ${fmt(powerReq)}. Erfolgswahrscheinlichkeit: ${successPct}%.`, {
            icon: getIcon('relics'),
            meta: 'AUFTRAG',
            sectionTitle: 'Belohnungen',
            sectionBody: ttCosts(dynRewards)
          })}>
            <div class="item-head">
              <strong>${escapeHtml(mission.name)}</strong>
              <span class="badge">${fmtSec(mission.duration)}</span>
            </div>
            <div class="stat-list compact">
              <div><span>Erfolg</span><strong class="${successClass}">${successPct}%</strong></div>
              <div><span>Artifact-Chance</span><strong>${Math.round((mission.relicChance || 0) * 100)}%</strong></div>
            </div>
            <div class="cost-row">${rewardMarkup(dynRewards)}</div>
            <div class="item-footer">
              ${button(t('sec.send_mission'), `data-action="send-mission" data-id="${mission.id}"`, !canLaunch, canLaunch ? 'active' : '')}
            </div>
          </article>
        `;
      }).join('')}
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.in_flight')}</p>
          <h3>${getIcon('time')} ${t('sec.active_exp')}</h3>
        </div>
        <span class="muted">${fmt(state.expeditions.length)} aktiv</span>
      </div>
      <div class="card-grid">
        ${state.expeditions.length
          ? state.expeditions.map((mission) => {
              const now = Date.now();
              const total = Math.max(1, mission.end - mission.start);
              const elapsed = Math.max(0, now - mission.start);
              const progress = Math.min(100, Math.round((elapsed / total) * 100));
              const remaining = Math.max(0, (mission.end - now) / 1000);
              return `
                <article class="item done" ${tt(mission.name || mission.missionId, 'Diese Expedition ist bereits unterwegs.', { icon: getIcon('time'), meta: 'AKTIV' })}>
                  <div class="item-head">
                    <strong>${escapeHtml(mission.name || mission.missionId)}</strong>
                    <span class="badge">${fmtSec(remaining)}</span>
                  </div>
                  <div class="exp-progress-wrap">
                    <div class="exp-progress-bar" style="width:${progress}%"></div>
                  </div>
                  <p class="muted">${progress}% abgeschlossen &bull; Devs gebunden: ${fmt(mission.powerUsed || 0)}</p>
                </article>
              `;
            }).join('')
          : `<p class="muted">${t('sec.no_expeditions')}</p>`}
      </div>
    </section>
  `;
}

function renderProjects() {
  const bonuses = state.cache.bonuses || computeBonuses();
  const visibleProjects = PROJECTS.filter((project) => !hasProject(project.id) && project.prereq.every((req) => isProjectRequirementMet(req)));
  const dormantCount = PROJECTS.filter((project) => !hasProject(project.id) && !project.prereq.every((req) => isProjectRequirementMet(req))).length;

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('projects.eyebrow')}</p>
        <h2>${t('projects.title')}</h2>
        <p class="hero-text">${t('projects.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('ui.available'), fmt(visibleProjects.length))}
        ${statRow(t('ui.hidden'), fmt(dormantCount))}
        ${statRow('Patente & IP', `${fmt(artifactCount())}/${fmt(ARTIFACTS.length)}`)}
        ${statRow('Wirtschafts-Index', `x${fmt(bonuses.projectCostMult)}`)}
      </div>
    </section>
    <section class="card-grid">
      ${visibleProjects.length
        ? visibleProjects.map((project) => {
            const cost = nextProjectCost(project, bonuses);
            const affordable = canAfford(cost);
            return `
              <article class="item" ${tt(project.name, project.desc, {
                icon: getIcon('components'),
                meta: 'RELEASE',
                sectionTitle: 'Investition',
                sectionBody: `${ttCosts(cost)}<div class="tt-section"><div class="tt-section-title">Voraussetzungen</div><p>${escapeHtml(formatRequirementList(project.prereq) || 'Keine')}</p></div>`
              })}>
                <div class="item-head">
                  <strong>${escapeHtml(project.name)}</strong>
                  <span class="badge">${project.prereq.length ? escapeHtml(formatRequirementList(project.prereq)) : 'Start'}</span>
                </div>
                <p class="muted">${escapeHtml(project.desc)}</p>
                <div class="cost-row">${costMarkup(cost)}</div>
                ${button(t('sec.start_project'), `data-action="buy-project" data-id="${project.id}"`, !affordable, affordable ? 'active' : '')}
              </article>
            `;
          }).join('')
        : `<div class="card empty-state">
            <h3>${getIcon('lock')} ${t('sec.no_blueprints')}</h3>
            <p class="muted">Weitere Frameworks schalten Releases frei.</p>
          </div>`}
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">RELEASES</p>
          <h3>${getIcon('check')} Releaste Produkte</h3>
        </div>
        <span class="muted">${fmt(PROJECTS.filter(p => hasProject(p.id)).length)} ${t('ui.active')}</span>
      </div>
      <div class="tag-list">
        ${PROJECTS.filter(p => hasProject(p.id)).length
          ? PROJECTS.filter(p => hasProject(p.id)).map((project) => `<span class="chip" ${tt(project.name, project.desc, { icon: getIcon('check'), meta: t('ui.active') })}>${escapeHtml(project.name)}</span>`).join('')
          : `<p class="muted">Noch keine Produkte releast.</p>`}
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.finds')}</p>
          <h3>${getIcon('relics')} ${t('sec.artifact_vault')}</h3>
        </div>
      </div>
      <div class="card-grid">
        ${ARTIFACTS.map((artifact) => `
          <article class="item ${hasArtifact(artifact.id) ? 'done' : 'locked'}" ${tt(artifact.name, artifact.desc, {
            icon: getIcon('relics'),
            meta: hasArtifact(artifact.id) ? 'RELEAST' : 'UNBEKANNT'
          })}>
            <div class="item-head">
              <strong>${escapeHtml(artifact.name)}</strong>
              <span class="badge">${hasArtifact(artifact.id) ? t('sec.secured') : t('sec.empty')}</span>
            </div>
            <p class="muted">${escapeHtml(artifact.desc)}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderPrestige() {
  const gain = prestigeGain();

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('prestige.eyebrow')}</p>
        <h2>${t('prestige.title')}</h2>
        <p class="hero-text">${t('prestige.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow('XP Guthaben', fmt(state.chronicle))}
        ${statRow('XP bei Refactor', gain > 0 ? `+${fmt(gain)}` : '–')}
        ${statRow('Refactors', fmt(state.stats.prestigeCount))}
        ${statRow('Arbeitszeit', fmtSec(state.stats.lifetime))}
      </div>
      ${button(
        t('sec.ascend'),
        `data-action="prestige" ${tt(t('sec.ascend'), t('prestige.subtitle'), {
          icon: getIcon('time'),
          meta: 'RESET',
          requirement: gain > 0 ? '' : 'Noch nicht genug Fortschritt für XP.'
        })}`,
        gain <= 0,
        gain > 0 ? 'active' : 'danger'
      )}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">ÜBERSICHT</p>
          <h3>${getIcon('time')} Was passiert beim Hard Refactor?</h3>
        </div>
      </div>
      <div class="prestige-summary">
        <div class="prestige-summary-col prestige-keep">
          <p style="color:var(--good)">BLEIBT ERHALTEN</p>
          <ul>
            <li>${state.artifacts.length} Artifact${state.artifacts.length !== 1 ? 's' : ''} / Patente</li>
            <li>${state.achievements.length} Errungenschaften</li>
            <li>${state.ownedChips.length} Mainframe-Chip${state.ownedChips.length !== 1 ? 's' : ''}</li>
            <li>Chronicle-Upgrades (alle Level)</li>
            <li>Doctrine-Wahl für nächsten Lauf</li>
            <li>Lebenszeit-Statistiken</li>
          </ul>
        </div>
        <div class="prestige-summary-col prestige-reset">
          <p style="color:var(--bad)">WIRD ZURÜCKGESETZT</p>
          <ul>
            <li>Alle Gebäude &amp; Mitarbeiter</li>
            <li>Tech-Stack / Forschung</li>
            <li>Projekte &amp; Releases</li>
            <li>Kolonien &amp; Expeditionen</li>
            <li>Alle Ressourcen (außer Start-Kapital)</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="card-grid">
      ${CHRONICLE_UPGRADES.map((upgrade) => {
        const cost = chronicleCost(upgrade.id);
        const canBuy = state.chronicle >= cost;
        const level = Number(state.chronicleUpgrades[upgrade.id] || 0);
        const missing = canBuy ? 0 : Math.ceil(cost - state.chronicle);
        return `
          <article class="item" ${tt(upgrade.name, upgrade.desc, {
            icon: getIcon('time'),
            meta: `LEVEL ${level}`,
            sectionTitle: 'Kosten',
            sectionBody: `<p>${fmt(cost)} XP${!canBuy ? ` (fehlen ${fmt(missing)})` : ''}</p>`
          })}>
            <div class="item-head">
              <strong>${escapeHtml(upgrade.name)}</strong>
              <span class="badge">Lvl ${fmt(level)}</span>
            </div>
            <p class="muted">${escapeHtml(upgrade.desc)}</p>
            <div class="dense-row">
              <span>Kosten</span>
              <strong class="${canBuy ? 'good' : 'bad'}">${fmt(cost)} XP${!canBuy ? ` <span style="font-size:0.8em;opacity:0.7">(−${fmt(missing)} fehlen)</span>` : ''}</strong>
            </div>
            ${button('Investieren', `data-action="buy-chronicle" data-id="${upgrade.id}"`, !canBuy, canBuy ? 'active' : '')}
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function renderLeaderboard() {
  const leaderboard = state.cache.leaderboard;
  if (!Array.isArray(leaderboard)) {
    return '<p class="muted">Rangdaten werden geladen.</p>';
  }
  if (!leaderboard.length) {
    return '<p class="muted">Noch keine Einträge.</p>';
  }

  return leaderboard.map((entry, index) => `
    <div class="log-item" ${tt(entry.username || 'Unbekannt', `Seniorität ${fmt(entry.prestige || entry.prestige_score || 0)}. ${t('res.scrap')} ${t('ui.total')} ${fmt(entry.totalScrap || entry.total_scrap || 0)}.`, {
      icon: getIcon('data'),
      meta: `${t('ui.rank').toUpperCase()} ${index + 1}`
    })}>
      <span>#${index + 1}</span>
      <p><strong>${escapeHtml(entry.username || 'Unbekannt')}</strong> | ${fmt(entry.prestige || entry.prestige_score || 0)} Seniorität</p>
      <div class="toggle-row">
        <span class="muted">${t('res.scrap')} ${fmt(entry.totalScrap || entry.total_scrap || 0)}</span>
        ${button(t('ui.profile'), `data-action="view-profile" data-id="${escapeHtml(entry.username || '')}"`)}
      </div>
    </div>
  `).join('');
}

function renderAccount() {
  const loggedIn = AstraforgeAPI.isLoggedIn();
  const username = AstraforgeAPI.username || '';
  const isFlagged = Boolean(AstraforgeAPI.flagged);
  const flagReason = AstraforgeAPI.flagReason || 'Kein Grund angegeben.';

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('account.eyebrow')}</p>
        <h2>${t('account.title')}</h2>
        <p class="hero-text">${t('account.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('sec.status'), loggedIn ? t('ui.connected') : t('ui.local'))}
        ${statRow('Name', escapeHtml(username || '–'))}
        ${statRow('Cloud-Sync', loggedIn ? t('ui.ready') : t('ui.locked'))}
        ${statRow('Leaderboard', Array.isArray(state.cache.leaderboard) ? fmt(state.cache.leaderboard.length) : '...')}
      </div>
    </section>
    <section class="card">
      ${loggedIn ? `
        <div class="section-head">
          <div>
            <p class="eyebrow">SESSION</p>
            <h3>${getIcon('data')} ${t('ui.connected')} – ${escapeHtml(username)}</h3>
            <p class="muted">Cloud-Save aktiv.</p>
          </div>
          <div class="toggle-row">
            ${button(t('sec.force_sync'), `data-action="force-sync" ${tt('Cloud-Sync', 'Aktuellen Stand in die Cloud speichern.', { icon: getIcon('data'), meta: 'PUSH' })}`, false, 'active')}
            ${button('Cloud laden', `data-action="load-cloud" ${tt('Cloud laden', 'Cloud-Save auf dieses Gerät laden (überschreibt lokalen Stand).', { icon: getIcon('data'), meta: 'PULL' })}`, false, '')}
            ${button(t('sec.logout'), `data-action="auth-logout" ${tt(t('sec.logout'), 'Vom Netzwerk trennen.', { icon: getIcon('lock'), meta: 'TRENNUNG' })}`, false, 'danger')}
          </div>
        </div>
        ${isFlagged ? `
          <div class="notice danger account-flag-notice">
            <div>
              <strong>Account geflaggt</strong>
              <p class="muted">Grund: ${escapeHtml(flagReason)}</p>
            </div>
            <span class="muted">Leaderboard ausgeblendet</span>
          </div>
        ` : ''}
      ` : `
        <div class="section-head">
          <div>
            <p class="eyebrow">ZUGANG</p>
            <h3>${getIcon('data')} ${t('sec.net_binding')}</h3>
            <p class="muted">Name und Passwort eingeben.</p>
          </div>
        </div>
        <div class="form-grid">
          <input id="auth-user" type="text" placeholder="Dev-Handle" autocomplete="username" inputmode="text" />
          <input id="auth-pass" type="password" placeholder="Passwort" autocomplete="current-password" inputmode="text" />
        </div>
        <div class="toggle-row form-actions">
          ${button(t('sec.register'), `data-action="auth-register" ${tt(t('sec.register'), 'Neuen Account anlegen.', { icon: getIcon('check') })}`)}
          ${button(t('sec.login'), `data-action="auth-login" ${tt(t('sec.login'), 'Mit bestehendem Account anmelden.', { icon: getIcon('data') })}`, false, 'active')}
        </div>
      `}
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.leaderboard')}</p>
          <h3>${getIcon('help')} ${t('sec.open_archives')}</h3>
        </div>
        ${button(t('sec.refresh'), `data-action="refresh-lb" ${tt(t('sec.leaderboard'), 'Aktualisieren.', { icon: getIcon('help') })}`)}
      </div>
      <div class="log-list">
        ${renderLeaderboard()}
      </div>
    </section>
  `;
}

function renderCodex() {
  const unlockedAchievements = ACHIEVEMENTS.filter((achievement) => state.achievements.includes(achievement.id));
  const resourceGuide = [
    ['Code', 'Basisproduktion aus Praktikanten, Juniors und später Mid/Senior Devs. Wird für alles benötigt.'],
    ['Revenue', 'Kommt über Google Ads und später Freemium, Abo-Fallen und B2B. Hält den Betrieb am Laufen.'],
    ['Bugs', 'QA Tester wandeln Code und Revenue in Bugs. Bugs sind kein Fehler – sie sind ein Baumaterial.'],
    ['Module', 'NPM Install wandelt Bugs in Module. Damit ist der mittlere Fortschritt nicht mehr blockiert.'],
    ['Users', 'SEO Experten liefern früh erste Users, Growth Hacker skalieren den Datenpfad über Module.'],
    ['Ideas', 'SEO Experten und Brainstorming erzeugen Ideen für neue Techs und Releases (// Sprachen Tab).'],
    ['Hype', 'Tech Blogger und spätere Social-Rollen liefern Influence für Expansion, Kolonien und Projekte.'],
    ['Legacy Code', 'Archeologists, Missionen und spätere Tools liefern Relics für seltene Projekte und Upgrades.']
  ];

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t('codex.eyebrow')}</p>
        <h2>${t('codex.title')}</h2>
        <p class="hero-text">${t('codex.subtitle')}</p>
      </div>
      <div class="hero-grid">
        ${statRow(t('sec.achievements'), `${fmt(unlockedAchievements.length)}/${fmt(ACHIEVEMENTS.length)}`)}
        ${statRow(t('res.relics'), fmt(artifactCount()))}
        ${statRow(t('tab.projects'), fmt(projectCount()))}
        ${statRow(t('tab.colonies'), fmt(colonyCount()))}
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">GUIDE</p>
          <h3>${getIcon('help')} Ressourcenpfad</h3>
          <p class="muted">Kurze Referenz dafür, wie jede Materialart ins Spiel kommt und wofür sie gedacht ist.</p>
        </div>
      </div>
      <div class="card-grid">
        ${resourceGuide.map(([name, text]) => `
          <article class="item" ${tt(name, text, { icon: getIcon('help'), meta: 'GUIDE' })}>
            <div class="item-head">
              <strong>${escapeHtml(name)}</strong>
              <span class="badge">Guide</span>
            </div>
            <p class="muted">${escapeHtml(text)}</p>
          </article>
        `).join('')}
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t('sec.achievements')}</p>
          <h3>${getIcon('check')} ${t('sec.achievements_title')}</h3>
        </div>
      </div>
      <div class="card-grid">
        ${ACHIEVEMENTS.map((achievement) => `
          <article class="item ${state.achievements.includes(achievement.id) ? 'done' : 'locked'}" ${tt(achievement.name, state.achievements.includes(achievement.id) ? 'Freigeschaltet!' : 'Noch gesperrt.', {
            icon: getIcon('check'),
            meta: state.achievements.includes(achievement.id) ? 'GESICHERT' : 'OFFEN',
            sectionTitle: 'Bedingung',
            sectionBody: `<p>${escapeHtml(achievement.desc)}</p>`
          })}>
            <div class="item-head">
              <strong>${escapeHtml(achievement.name)}</strong>
              <span class="badge">${state.achievements.includes(achievement.id) ? 'Frei' : 'Offen'}</span>
            </div>
            <p class="muted">${escapeHtml(achievement.desc)}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

export function renderTabs() {
  return renderTabsMarkup();
}

export function renderStickyResources() {
  return renderStickyResourcesMarkup();
}

export function renderCyberEventOverlay() {
  const ce = state.cyberEvent;
  if (!ce) return '';

  const remaining = Math.max(0, (ce.endsAt - Date.now()) / 1000);
  const progress = ce.type === 'interactive'
    ? Math.min(100, ((ce.clicksDone || 0) / ce.clicksRequired) * 100)
    : Math.min(100, (1 - remaining / ((ce.endsAt - ce.startedAt) / 1000)) * 100);

  const colorClass = ce.color === 'danger' ? 'cyber-event--danger'
    : ce.color === 'gold' ? 'cyber-event--gold'
    : ce.color === 'warn' ? 'cyber-event--warn'
    : 'cyber-event--info';

  return `
    <div class="cyber-event-panel ${colorClass}">
      <div class="cyber-event-header">
        <span class="cyber-event-icon">${ce.icon || '⚡'}</span>
        <strong>${escapeHtml(ce.name)}</strong>
        <span class="cyber-event-timer">${fmtSec(remaining)}</span>
      </div>
      <p class="cyber-event-desc">${escapeHtml(ce.desc)}</p>
      <div class="cyber-event-bar-wrap">
        <div class="cyber-event-bar" style="width:${progress}%"></div>
      </div>
      ${ce.type === 'interactive' ? `
        <div class="cyber-event-action">
          <button class="cyber-event-btn" data-action="cyber-event-click">
            ${ce.icon || '⚡'} PATCH DEPLOYEN (${ce.clicksDone || 0}/${ce.clicksRequired})
          </button>
        </div>
      ` : `
        <div class="cyber-event-action">
          <span class="cyber-event-passive">Automatisch aktiv...</span>
        </div>
      `}
    </div>
  `;
}

function renderStockCard(stock) {
  const price = getStockPrice(stock.id);
  const history = state.stockMarket?.history?.[stock.id] || [price];
  const prevPrice = history.length > 1 ? history[history.length - 2] : price;
  const trend = price > prevPrice * 1.005 ? 'up' : price < prevPrice * 0.995 ? 'down' : 'flat';
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—';
  const trendClass = trend === 'up' ? 'good' : trend === 'down' ? 'bad' : 'muted';
  const resourceLabel = RESOURCE_LABELS[stock.resource] || stock.resource;
  const owned = getOwnedShares(stock.id);
  const cash = state.resources.energy || 0;

  let sparkPoints;
  if (history.length < 2) {
    sparkPoints = `0,10 100,10`;
  } else {
    const sparkMin = Math.min(...history), sparkMax = Math.max(...history);
    const sparkRange = sparkMax - sparkMin || 1;
    sparkPoints = history.map((v, i) => {
      const x = (i / (history.length - 1)) * 100;
      const y = 18 - ((v - sparkMin) / sparkRange) * 16;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
  const sparkColor = trend === 'up' ? 'var(--good)' : trend === 'down' ? 'var(--bad)' : 'var(--text-muted)';

  const maxBuy = price > 0 ? Math.floor(cash / price) : 0;
  const shareSteps = [1, 10, 50, 100];
  const buyBtns = shareSteps.map((shares) => {
    const cost = shares * price;
    const ok = cash >= cost;
    const tip = ok ? `Kaufe ${fmt(shares)} Aktien für ${fmt(cost)} Revenue` : 'Nicht genug Revenue';
    return `<button class="mkt-btn${ok ? ' active' : ''}" ${ok ? '' : 'disabled'}
      data-action="buy-stock" data-id="${stock.id}" data-shares="${shares}"
      title="${escapeHtml(tip)}">+${shares}<span class="mkt-qty">${fmt(cost)}</span></button>`;
  }).join('');
  const maxBuyCost = maxBuy * price;
  const maxBuyBtn = `<button class="mkt-btn mkt-btn--max${maxBuy > 0 ? ' active' : ''}" ${maxBuy > 0 ? '' : 'disabled'}
    data-action="buy-stock" data-id="${stock.id}" data-shares="${maxBuy}"
    title="${maxBuy > 0 ? `Kaufe ${fmt(maxBuy)} Aktien für ${fmt(maxBuyCost)} Revenue` : 'Nicht genug Revenue'}">Max<span class="mkt-qty">${maxBuy > 0 ? fmt(maxBuy) : '0'}</span></button>`;

  const sellSteps = [1, 10, 50, 'all'];
  const sellBtns = sellSteps.map((step) => {
    const shares = step === 'all' ? owned : step;
    const revenue = shares * price * (1 - BROKER_FEE);
    const ok = shares > 0 && owned >= shares;
    const label = step === 'all' ? 'Alle' : `-${step}`;
    const tip = ok ? `Verkaufe ${fmt(shares)} Aktien für ${fmt(revenue)} Revenue` : 'Nicht genug Aktien';
    return `<button class="mkt-btn mkt-btn--sell${ok ? ' active' : ''}" ${ok ? '' : 'disabled'}
      data-action="sell-stock" data-id="${stock.id}" data-shares="${shares}"
      title="${escapeHtml(tip)}">${label}<span class="mkt-qty">${fmt(revenue)}</span></button>`;
  }).join('');

  const pctChange = prevPrice ? ((price / prevPrice - 1) * 100).toFixed(1) : '0.0';
  const pctLabel  = (Number(pctChange) >= 0 ? '+' : '') + pctChange + '%';

  return `
    <article class="item market-card">
      <div class="mkt-header">
        <strong class="mkt-title">${escapeHtml(stock.name)}</strong>
        <span class="mkt-ticker ${trendClass}">${escapeHtml(stock.ticker)} ${trendIcon} ${pctLabel}</span>
      </div>
      <div class="mkt-sparkline">
        <svg viewBox="0 0 100 20" preserveAspectRatio="none">
          <polyline points="${sparkPoints}" fill="none" stroke="${sparkColor}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="mkt-price-row">
        <span class="mkt-price">Kurs <strong>${fmt(price)}</strong> <em>Revenue</em></span>
        <span class="muted" style="font-size:0.72em">Dividende: ${fmt(stock.dividendRate)}/s ${escapeHtml(resourceLabel)}</span>
      </div>
      <div class="mkt-stock-row">
        <span class="muted">Besitz: ${fmt(owned)} Aktien · Ausschüttung in ${escapeHtml(resourceLabel)}</span>
      </div>
      <div class="mkt-trade-section">
        <span class="mkt-label good">KAUFEN</span>
        <div class="mkt-btn-row">${buyBtns}${maxBuyBtn}</div>
      </div>
      <div class="mkt-trade-section">
        <span class="mkt-label bad">VERKAUFEN</span>
        <div class="mkt-btn-row">${sellBtns}</div>
      </div>
    </article>
  `;
}

function renderMarket() {
  const unlocked = state.techs?.includes('freelance_platform');
  const nextUpdate = timeUntilNextPriceUpdate();
  const updateLabel = nextUpdate === null ? 'Verbinde...' : fmtSec(nextUpdate / 1000);
  const dividends = totalDividendRate();

  if (!unlocked) {
    return `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">BÖRSE</p>
          <h2>./resource_exchange</h2>
          <p class="hero-text">Schalte "Upwork Account" in der Forschung frei, um Ressourcen-Aktien zu handeln.</p>
        </div>
      </section>
      <section class="card empty-state">
        <h3>${getIcon('lock')} Zugang verweigert</h3>
        <p class="muted">Benötigt Forschung: Upwork Account</p>
      </section>
    `;
  }

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">BÖRSE</p>
        <h2>./resource_exchange</h2>
        <p class="hero-text">Kaufe Aktien mit Revenue. Jede Aktie zahlt Dividenden in ihrer Ressource. <span class="badge-live">● LIVE</span> Kurse sind serverbasiert — alle Spieler sehen denselben Markt. Nächstes Update in <strong>${updateLabel}</strong>.</p>
      </div>
      <div class="hero-grid">
        ${statRow('Aktien', STOCKS.length)}
        ${statRow('Depotwert', `${fmt(portfolioValue())} Revenue`)}
        ${statRow('Verkaufsgebühr', Math.round(BROKER_FEE * 100) + '%')}
        ${statRow('Kurs-Update', updateLabel)}
      </div>
    </section>
    <section class="card-grid market-grid">
      ${STOCKS.map(renderStockCard).join('')}
    </section>
    <section class="card" style="margin-top:14px;">
      <h3>Dividenden / Sekunde</h3>
      <div class="stat-grid">
        ${Object.keys(dividends).length
          ? Object.entries(dividends).map(([res, amount]) => statRow(RESOURCE_LABELS[res] || res, `${resIcon(res)} ${fmt(amount)}/s`)).join('')
          : '<p class="muted">Noch keine Aktien im Depot.</p>'}
      </div>
    </section>
  `;
}

function renderMainframe() {
  const slots = state.mainframeSlots || 3;
  const equipped = state.equippedChips || [];
  const owned = state.ownedChips || [];
  const unequipped = owned.filter(id => !equipped.includes(id));

  const slotCards = [];
  for (let i = 0; i < slots; i++) {
    const chipId = equipped[i];
    if (chipId) {
      const chip = CHIPS.find(c => c.id === chipId);
      if (chip) {
        const rarityClass = chip.rarity === 'epic' ? 'chip--epic' : chip.rarity === 'rare' ? 'chip--rare' : 'chip--common';
        slotCards.push(`
          <article class="item chip-slot chip-slot--filled ${rarityClass}" ${tt(chip.name, chip.desc, {
            icon: '🔧',
            meta: chip.rarity.toUpperCase()
          })}>
            <div class="item-head">
              <strong>🔧 ${escapeHtml(chip.name)}</strong>
              <span class="badge">${escapeHtml(chip.rarity)}</span>
            </div>
            <p class="muted">${escapeHtml(chip.desc)}</p>
            ${button('Entfernen', 'data-action="unequip-chip" data-id="' + chip.id + '"', false, 'danger')}
          </article>
        `);
      }
    } else {
      slotCards.push(`
        <article class="item chip-slot chip-slot--empty">
          <div class="item-head">
            <strong>Leerer Slot</strong>
            <span class="badge">#${i + 1}</span>
          </div>
          <p class="muted">Kein Chip installiert.</p>
        </article>
      `);
    }
  }

  const inventoryCards = unequipped.map(chipId => {
    const chip = CHIPS.find(c => c.id === chipId);
    if (!chip) return '';
    const rarityClass = chip.rarity === 'epic' ? 'chip--epic' : chip.rarity === 'rare' ? 'chip--rare' : 'chip--common';
    const canEquip = equipped.length < slots;
    return `
      <article class="item ${rarityClass}" ${tt(chip.name, chip.desc, {
        icon: '🔧',
        meta: chip.rarity.toUpperCase()
      })}>
        <div class="item-head">
          <strong>🔧 ${escapeHtml(chip.name)}</strong>
          <span class="badge">${escapeHtml(chip.rarity)}</span>
        </div>
        <p class="muted">${escapeHtml(chip.desc)}</p>
        ${button('Installieren', 'data-action="equip-chip" data-id="' + chip.id + '"', !canEquip, canEquip ? 'active' : '')}
      </article>
    `;
  }).join('');

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">MAINFRAME</p>
          <h3>🤖 AI-Kerne</h3>
          <p class="muted">Installiere Chips für mächtige Boosts. Jeder Slot kann einen Chip halten.</p>
        </div>
        <span class="muted">${equipped.length}/${slots} Slots belegt</span>
      </div>
      <div class="card-grid mainframe-grid">
        ${slotCards.join('')}
      </div>
    </section>
    ${unequipped.length || (owned.length === 0) ? `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">INVENTAR</p>
          <h3>🔧 Verfügbare Chips</h3>
          <p class="muted">${owned.length === 0 ? 'Noch keine Chips gefunden. Schicke Freelancer auf Aufträge!' : 'Chips die nicht installiert sind.'}</p>
        </div>
      </div>
      <div class="card-grid">
        ${inventoryCards || '<p class="muted">Alle Chips sind installiert.</p>'}
      </div>
    </section>
    ` : ''}
  `;
}

function renderAdminUserEditor(user) {
  let save = {};
  try { save = JSON.parse(user.game_save || '{}'); } catch(e) {}
  const resources = save.resources || {};
  const buildings = save.buildings || {};
  const stats = save.stats || {};
  const techs = save.techs || [];
  const projects = save.projects || [];
  const artifacts = save.artifacts || [];

  const RESOURCE_NAMES = ['scrap', 'energy', 'alloy', 'components', 'data', 'research', 'influence', 'relics'];

  const resourceInputs = RESOURCE_NAMES.map(r => `
    <label class="admin-editor-label">${escapeHtml(RESOURCE_LABELS[r] || r)}
      <input id="admin-ed-res-${r}" class="text-input" type="number" value="${resources[r] ?? 0}" min="0" />
    </label>`).join('');

  // group buildings by category
  const bldByCategory = {};
  for (const b of BUILDINGS) {
    (bldByCategory[b.category] = bldByCategory[b.category] || []).push(b);
  }
  const buildingInputs = Object.entries(bldByCategory).map(([cat, bs]) => `
    <div class="admin-editor-subsection">
      <p class="eyebrow" style="margin:0.4rem 0 0.2rem">${escapeHtml(cat)}</p>
      <div class="admin-editor-grid admin-editor-grid-wide">
        ${bs.map(b => `
          <label class="admin-editor-label">${escapeHtml(b.name)}
            <input id="admin-ed-bld-${b.id}" class="text-input" type="number" value="${buildings[b.id] ?? 0}" min="0" step="1" />
          </label>`).join('')}
      </div>
    </div>`).join('');

  const techChecks = TECHS.map(t => `
    <label class="admin-editor-check-item">
      <input type="checkbox" id="admin-ed-tech-${t.id}" ${techs.includes(t.id) ? 'checked' : ''} />
      <span>${escapeHtml(t.name)}</span>
    </label>`).join('');

  const projChecks = PROJECTS.map(p => `
    <label class="admin-editor-check-item">
      <input type="checkbox" id="admin-ed-proj-${p.id}" ${projects.includes(p.id) ? 'checked' : ''} />
      <span>${escapeHtml(p.name)}</span>
    </label>`).join('');

  const artChecks = ARTIFACTS.map(a => `
    <label class="admin-editor-check-item">
      <input type="checkbox" id="admin-ed-art-${a.id}" ${artifacts.includes(a.id) ? 'checked' : ''} />
      <span>${escapeHtml(a.name)}</span>
    </label>`).join('');

  return `
    <div class="admin-user-editor">
      <p class="muted" style="margin:0.5rem 0 1rem">Bearbeite: <strong>${escapeHtml(user.username)}</strong> &mdash; Registriert: ${escapeHtml(String(user.created_at || '—'))}</p>

      <div class="admin-editor-section">
        <p class="eyebrow">ACCOUNT</p>
        <div class="admin-editor-grid">
          <label class="admin-editor-label">Prestige-Score
            <input id="admin-editor-prestige" class="text-input" type="number" value="${user.prestige_score}" min="0" step="1" />
          </label>
          <label class="admin-editor-label">Total Scrap
            <input id="admin-editor-scrap" class="text-input" type="number" value="${user.total_scrap}" min="0" />
          </label>
          <label class="admin-editor-label">Flag-Grund
            <input id="admin-editor-flag-reason" class="text-input" type="text" value="${escapeHtml(user.flag_reason || '')}" placeholder="Kein Grund" />
          </label>
          <label class="admin-editor-label admin-editor-check-item" style="justify-content:flex-start;gap:0.5rem;align-items:center">
            <input id="admin-editor-flagged" type="checkbox" ${user.flagged ? 'checked' : ''} />
            <span>Geflaggt</span>
          </label>
        </div>
        <label class="admin-editor-label" style="margin-top:0.5rem">Neues Passwort <span class="muted">(leer = unverändert)</span>
          <input id="admin-editor-new-password" class="text-input" type="password" placeholder="Neues Passwort..." autocomplete="new-password" style="margin-top:0.3rem" />
        </label>
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">RESSOURCEN</p>
        <div class="admin-editor-grid">${resourceInputs}</div>
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">STATISTIKEN</p>
        <div class="admin-editor-grid">
          <label class="admin-editor-label">Spielzeit (ms)<input id="admin-ed-stat-lifetime" class="text-input" type="number" value="${stats.lifetime ?? 0}" min="0" /></label>
          <label class="admin-editor-label">Prestige-Anzahl<input id="admin-ed-stat-prestigeCount" class="text-input" type="number" value="${stats.prestigeCount ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Projekte gebaut<input id="admin-ed-stat-projectsBuilt" class="text-input" type="number" value="${stats.projectsBuilt ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Expeditionen<input id="admin-ed-stat-expeditionsDone" class="text-input" type="number" value="${stats.expeditionsDone ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Manuelle Klicks<input id="admin-ed-stat-manualClicks" class="text-input" type="number" value="${stats.manualClicks ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Fleet XP<input id="admin-ed-stat-fleetXP" class="text-input" type="number" value="${stats.fleetXP ?? 0}" min="0" /></label>
          <label class="admin-editor-label">Fleet Level<input id="admin-ed-stat-fleetLevel" class="text-input" type="number" value="${stats.fleetLevel ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Chronik-Stufe<input id="admin-ed-chronicle" class="text-input" type="number" value="${save.chronicle ?? 0}" min="0" step="1" /></label>
          <label class="admin-editor-label">Mainframe-Slots<input id="admin-ed-mainframeSlots" class="text-input" type="number" value="${save.mainframeSlots ?? 3}" min="1" step="1" /></label>
        </div>
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">GEBÄUDE</p>
        ${buildingInputs}
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">TECHNOLOGIEN</p>
        <div class="admin-editor-checks">${techChecks}</div>
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">PROJEKTE</p>
        <div class="admin-editor-checks">${projChecks}</div>
      </div>

      <div class="admin-editor-section">
        <p class="eyebrow">ARTEFAKTE</p>
        <div class="admin-editor-checks">${artChecks}</div>
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:1rem;position:sticky;bottom:0;background:var(--bg-card,#1a1a2e);padding:0.75rem 0">
        <button class="admin-btn active" data-action="admin-save-user-data" data-username="${escapeHtml(user.username)}">Änderungen speichern</button>
        <button class="admin-btn" data-action="admin-clear-editor">Schließen</button>
      </div>
    </div>`;
}

function renderAdmin() {
  const rows = adminUsers;
  const flaggedSection = rows.length === 0
    ? '<p class="muted">Keine geflaggten User. Alles sauber.</p>'
    : rows.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <strong>${escapeHtml(u.username)}</strong>
          <span class="muted">Prestige: ${u.prestige_score} · Scrap: ${fmt(u.total_scrap)}</span>
          <span class="admin-flag-reason">${escapeHtml(u.flag_reason || '—')}</span>
        </div>
        <div class="admin-user-actions">
          <button class="admin-btn" data-action="admin-unflag" data-username="${escapeHtml(u.username)}">Entflaggen</button>
          <button class="admin-btn danger" data-action="admin-ban" data-username="${escapeHtml(u.username)}">Neu flaggen</button>
          <button class="admin-btn" data-action="admin-rename-user" data-username="${escapeHtml(u.username)}">Umbenennen</button>
          <button class="admin-btn danger" data-action="admin-delete-user" data-username="${escapeHtml(u.username)}">Löschen</button>
        </div>
      </div>
    `).join('');

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">MODERATION</p>
          <h3>🛡 Admin-Panel</h3>
          <p class="muted">Geflaggte User werden automatisch aus dem Leaderboard ausgeschlossen.</p>
        </div>
        <button class="admin-btn" data-action="admin-refresh">Aktualisieren</button>
      </div>
      <div class="admin-user-list">${flaggedSection}</div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">MANUELL FLAGGEN</p>
          <h3>🚩 User flaggen</h3>
        </div>
      </div>
      <div class="admin-flag-form">
        <input id="admin-flag-username" class="text-input" type="text" placeholder="Username" autocomplete="off" />
        <input id="admin-flag-reason" class="text-input" type="text" placeholder="Grund" autocomplete="off" />
        <button class="admin-btn danger" data-action="admin-flag-submit">Flaggen</button>
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">ACCOUNT UMBENENNEN</p>
          <h3>Username ändern</h3>
        </div>
      </div>
      <div class="admin-flag-form">
        <input id="admin-rename-old-username" class="text-input" type="text" placeholder="Alter Username" autocomplete="off" />
        <input id="admin-rename-new-username" class="text-input" type="text" placeholder="Neuer Username" autocomplete="off" />
        <button class="admin-btn" data-action="admin-rename-user">Umbenennen</button>
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">ACCOUNT LÖSCHEN</p>
          <h3>Account entfernen</h3>
        </div>
      </div>
      <div class="admin-flag-form">
        <input id="admin-delete-username" class="text-input" type="text" placeholder="Username" autocomplete="off" />
        <button class="admin-btn danger" data-action="admin-delete-user">Löschen</button>
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">USER-DATEN BEARBEITEN</p>
          <h3>Alle Daten bearbeiten</h3>
          <p class="muted">Lade einen User und bearbeite alle Felder direkt.</p>
        </div>
      </div>
      <div class="admin-flag-form">
        <input id="admin-editor-username" class="text-input" type="text" placeholder="Username" autocomplete="off" />
        <button class="admin-btn" data-action="admin-load-user">Laden</button>
      </div>
      ${adminSelectedUser ? renderAdminUserEditor(adminSelectedUser) : ''}
    </section>
  `;
}

export function renderTabContent() {
  switch (state.selectedTab) {
    case 'buildings':
      return renderBuildings();
    case 'research':
      return renderResearch();
    case 'colonies':
      return renderColonies();
    case 'expeditions':
      return renderExpeditions();
    case 'projects':
      return renderProjects();
    case 'market':
      return renderMarket();
    case 'prestige':
      return renderPrestige() + renderMainframe();
    case 'account':
      return renderAccount();
    case 'admin':
      return renderAdmin();
    case 'codex':
      return renderCodex();
    case 'overview':
    default:
      return renderOverview();
  }
}
