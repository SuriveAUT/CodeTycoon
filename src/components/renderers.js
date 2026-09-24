// renderers.js – HTML-Renderer für Navigation, Ressourcenleiste und alle Tabs.
import {
  state, canAfford, buildingCount, calcNextBuildingCost, calcBuildingCost, maxAffordable, isBuildingUnlocked, unlockReason,
  isTechUnlocked, hasTech, hasProject, hasArtifact, totalBuildings, techCount, projectCount, artifactCount, colonyCount,
  isProjectRequirementMet, projectRequirementLabel, getTech, getBuilding
} from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot, buildingOutputPerSecond, buildingInputPerSecond, clickValue, MAX_COLONIES, MODIFIER_CAP } from '../store/bonuses.js';
import {
  nextResearchCost, nextProjectCost, chronicleCost, colonyFoundCost, canFoundColony, colonyUpgradeCost, COLONY_MAX_LEVEL,
  prestigeGain, prestigeGainRaw, scrapForNextXp, runScrap, missionPowerReq
} from '../engine/actions.js';
import { currentQuest, questProgress } from '../engine/quests.js';
import { missionSuccessChance, getDynamicMissionRewards } from '../engine/events.js';
import { currentDecisionDef } from '../engine/decisions.js';
import { getSetting } from '../lib/settings.js';
import { BUILDINGS, CATEGORIES, milestoneMult, nextMilestone } from '../data/buildings.js';
import { TECHS, TECH_TIERS } from '../data/techs.js';
import { PROJECTS } from '../data/projects.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { QUESTS } from '../data/quests.js';
import {
  RESOURCES, RESOURCE_LABELS, RESOURCE_LORE, MISSIONS, WORLDS, FOCI, DOCTRINES, OPERATIONS_MODES, PROTOCOLS,
  ACHIEVEMENTS, CHRONICLE_UPGRADES, PRESTIGE_MILESTONES
} from '../data/misc.js';
import { CHIPS } from '../data/chips.js';
import { STOCKS, BROKER_FEE, getStockPrice, getOwnedShares, portfolioValue, totalDividendRate, timeUntilNextPriceUpdate } from '../engine/stocks.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { fmt, fmtSec } from '../lib/format.js';
import { getIcon, resIcon, CATEGORY_ICONS } from '../lib/icons.js';
import { escapeHtml } from '../lib/sanitize.js';

export const ADMIN_USERNAME = 'Dominik';

export const TABS = [
  { id: 'overview', label: 'Büro', icon: 'home', key: 'O', blurb: 'Klicken, Aufgaben, Überblick.' },
  { id: 'buildings', label: 'Team', icon: 'team', key: 'B', blurb: 'Mitarbeiter einstellen.' },
  { id: 'research', label: 'Tech', icon: 'tech', key: 'R', blurb: 'Technologien lernen.' },
  { id: 'projects', label: 'Releases', icon: 'rocket', key: 'P', blurb: 'Produkte launchen, Funde.' },
  { id: 'expansion', label: 'Expansion', icon: 'globe', key: 'E', blurb: 'Freelance-Aufträge und Standorte.' },
  { id: 'market', label: 'Börse', icon: 'market', key: 'M', blurb: 'Aktien handeln.' },
  { id: 'prestige', label: 'Prestige', icon: 'prestige', key: 'S', blurb: 'Hard Refactor, XP, Chips.' },
  { id: 'codex', label: 'Codex', icon: 'codex', key: 'C', blurb: 'Errungenschaften und Hilfe.' },
  { id: 'account', label: 'Account', icon: 'account', key: 'A', blurb: 'Cloud-Save, Leaderboard.' }
];
export const VALID_TABS = new Set([...TABS.map(t => t.id), 'admin']);

// ── Admin-Daten (werden von App.jsx gesetzt) ──
let adminUsers = [];
export function setAdminUsers(rows) { adminUsers = rows || []; }
let adminSelectedUser = null;
export function setAdminSelectedUser(user) { adminSelectedUser = user || null; }

// ── "Neu"-Markierungen (pro Sitzung): was seit dem letzten Tab-Besuch freigeschaltet wurde ──
const seenBuildings = new Set();
const seenTechs = new Set();
let seenInitialized = false;
function initSeen() {
  if (seenInitialized) return;
  seenInitialized = true;
  BUILDINGS.filter(isBuildingUnlocked).forEach(b => seenBuildings.add(b.id));
  TECHS.filter(t => isTechUnlocked(t) || hasTech(t.id)).forEach(t => seenTechs.add(t.id));
}
function newBuildings() { initSeen(); return BUILDINGS.filter(b => isBuildingUnlocked(b) && !seenBuildings.has(b.id)); }
function newTechs() { initSeen(); return TECHS.filter(t => !hasTech(t.id) && isTechUnlocked(t) && !seenTechs.has(t.id)); }

// ── Helfer ──
function bonuses() { return state.cache.bonuses || computeBonuses(); }
function rates() { return state.cache.rates && state.cache.rates.__produced ? state.cache.rates : estimateRatesSnapshot(); }

function tt(title, body, options = {}) {
  const chunks = [`<h4>${options.icon || ''}${escapeHtml(title)}</h4>`];
  if (options.meta) chunks.push(`<div class="tt-meta">${escapeHtml(options.meta)}</div>`);
  if (body) chunks.push(`<p>${escapeHtml(body)}</p>`);
  if (options.sectionTitle && options.sectionBody) {
    chunks.push(`<div class="tt-section"><div class="tt-section-title">${escapeHtml(options.sectionTitle)}</div>${options.sectionBody}</div>`);
  }
  if (options.requirement) chunks.push(`<div class="tt-req">${getIcon('lock')} ${escapeHtml(options.requirement)}</div>`);
  return `data-tt="${encodeURIComponent(chunks.join(''))}"`;
}

function ttCosts(cost) {
  return `<div class="tt-costs">${Object.entries(cost).map(([res, amt]) => `<div><span>${resIcon(res)} ${escapeHtml(RESOURCE_LABELS[res] || res)}</span><span>${fmt(amt)}</span></div>`).join('')}</div>`;
}

function fmtRate(v, unit = '/s') {
  const n = Number(v) || 0;
  if (Math.abs(n) < 1e-9) return `0${unit}`;
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}${unit}`;
}

function costChips(cost) {
  return `<div class="cost-row">${Object.entries(cost).map(([res, amt]) => {
    const ok = (state.resources[res] || 0) >= amt;
    return `<span class="cost ${ok ? 'ok' : 'no'}" ${tt(RESOURCE_LABELS[res] || res, `Vorrat: ${fmt(state.resources[res] || 0)}`)}>${resIcon(res)}${fmt(amt)}</span>`;
  }).join('')}</div>`;
}

function rewardChips(rewards) {
  return `<div class="cost-row">${Object.entries(rewards).filter(([, v]) => v > 0).map(([res, amt]) => `<span class="cost ok">${resIcon(res)}+${fmt(amt)}</span>`).join('')}</div>`;
}

// Sekunden bis Kosten leistbar sind (Infinity wenn eine Rate ≤ 0)
function etaSeconds(cost) {
  const r = rates();
  let eta = 0;
  for (const [res, amt] of Object.entries(cost)) {
    const missing = amt - (state.resources[res] || 0);
    if (missing <= 0) continue;
    const rate = Number(r[res] || 0);
    if (rate <= 0) return Infinity;
    eta = Math.max(eta, missing / rate);
  }
  return eta;
}

function etaLabel(cost) {
  const eta = etaSeconds(cost);
  if (eta <= 0) return '';
  if (!Number.isFinite(eta)) {
    const onlyScrap = Object.keys(cost).every(res => res === 'scrap' || (state.resources[res] || 0) >= cost[res]);
    return onlyScrap ? '<span class="b-eta">→ Code schreiben</span>' : '<span class="b-eta bad">kein Zufluss</span>';
  }
  if (eta > 86400 * 3) return '<span class="b-eta">&gt; 3 Tage</span>';
  return `<span class="b-eta">in ${fmtSec(Math.ceil(eta))}</span>`;
}

function kpi(label, value, sub = '', extra = '') {
  return `<div class="kpi" ${extra}><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

function statRow(label, value, attrs = '') {
  return `<div ${attrs}><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function progress(cur, max, cls = '') {
  const pct = Math.max(0, Math.min(100, max > 0 ? (cur / max) * 100 : 0));
  return `<div class="progress ${cls}"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

function emptyState(icon, title, text) {
  return `<div class="empty">${getIcon(icon)}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function visibleResources() {
  return RESOURCES.filter(res => res === 'scrap' || res === 'energy' || (state.stats.max[res] || 0) > 0 || (state.resources[res] || 0) > 0);
}

// ── "Beste Investition": Output-Wert pro Kosten (nur Producer/Konverter) ──
const RES_VALUE = { scrap: 1, energy: 3, alloy: 6, components: 20, data: 6, research: 8, influence: 25, relics: 2000 };
function bestInvestmentId(b) {
  let best = null, bestScore = 0;
  for (const def of BUILDINGS) {
    if (def.type === 'modifier' || !isBuildingUnlocked(def)) continue;
    const cost = calcNextBuildingCost(def);
    const costValue = Object.entries(cost).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0);
    if (costValue <= 0) continue;
    const owned = buildingCount(def.id);
    const out = buildingOutputPerSecond(def, state, b);
    const inp = buildingInputPerSecond(def, state, b);
    let value = Object.entries(out).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0)
      - Object.entries(inp).reduce((a, [r, v]) => a + v * (RES_VALUE[r] || 1), 0) * 0.5;
    const stepUp = milestoneMult(owned + 1) / milestoneMult(Math.max(owned, 1));
    value *= stepUp;
    if (value <= 0) continue;
    const score = value / costValue;
    if (score > bestScore) { bestScore = score; best = def.id; }
  }
  return best;
}

// ── Navigation ──
function navBadges() {
  const b = bonuses();
  const badges = {};
  const affordableTechs = TECHS.filter(t => !hasTech(t.id) && isTechUnlocked(t) && state.resources.research >= nextResearchCost(t, b)).length;
  if (affordableTechs) badges.research = affordableTechs;
  const affordableProjects = PROJECTS.filter(p => !hasProject(p.id) && p.prereq.every(isProjectRequirementMet) && canAfford(nextProjectCost(p, b))).length;
  if (affordableProjects) badges.projects = affordableProjects;
  const affordableChronicle = CHRONICLE_UPGRADES.filter(u => state.chronicle >= chronicleCost(u.id) && !(u.max && (state.chronicleUpgrades[u.id] || 0) >= u.max)).length;
  if (affordableChronicle) badges.prestige = affordableChronicle;
  const freeSlot = hasTech('freelance_platform') && b.availableExpeditionSlots > 0 && MISSIONS.some(m => b.availableExpeditionPower >= missionPowerReq(m));
  if (freeSlot || canFoundColony()) badges.expansion = 'dot';
  const fresh = newBuildings().length;
  if (fresh && state.selectedTab !== 'buildings') badges.buildings = fresh;
  return badges;
}

export function renderNav(mobile = false) {
  const badges = navBadges();
  const tabs = [...TABS];
  if (AstraforgeAPI.username === ADMIN_USERNAME) tabs.push({ id: 'admin', label: 'Admin', icon: 'shield', blurb: 'Moderation.' });
  return tabs.map(tab => {
    const badge = badges[tab.id];
    const badgeHtml = badge === 'dot' ? '<span class="nav-badge dot"></span>' : badge ? `<span class="nav-badge">${badge > 9 ? '9+' : badge}</span>` : (tab.key && !mobile ? `<span class="nav-key">${tab.key}</span>` : '');
    return `<button class="nav-item ${state.selectedTab === tab.id ? 'active' : ''}" data-action="tab" data-tab="${tab.id}" ${tt(tab.label, tab.blurb, { meta: tab.key ? `Taste ${tab.key}` : '' })}>${getIcon(tab.icon)}<span>${escapeHtml(tab.label)}</span>${badgeHtml}</button>`;
  }).join('');
}

export function renderSidebarFoot() {
  const b = bonuses();
  const loggedIn = AstraforgeAPI.isLoggedIn();
  const flag = AstraforgeAPI.flagged ? `<div class="status-line bad">${getIcon('warning')} Account geflaggt</div>` : '';
  return `
    <div class="status-line"><span class="status-dot ${loggedIn ? '' : 'off'}"></span>${loggedIn ? `Cloud: ${escapeHtml(AstraforgeAPI.username || '')}` : 'Lokaler Spielstand'}</div>
    <div class="status-line">${getIcon('time')} Autosave ${new Date(state.stats.lastSave).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    <div class="status-line">Offline-Limit ${fmt(b.offlineCapHours)}h · ${Math.round((b.offlineEfficiency || 0) * 100)}%</div>
    ${flag}
  `;
}

// ── Ressourcenleiste ──
export function renderTopbar() {
  const r = rates();
  const b = bonuses();
  const pills = visibleResources().map(res => {
    const rate = Number(r[res] || 0);
    const cons = Number(r.__consumed?.[res] || 0);
    const prod = Number(r.__produced?.[res] || 0);
    const rateCls = rate > 0.0001 ? 'good' : rate < -0.0001 ? 'bad' : '';
    return `<div class="res-pill" ${tt(RESOURCE_LABELS[res], RESOURCE_LORE[res], {
      icon: resIcon(res) + ' ',
      sectionTitle: 'Fluss pro Sekunde',
      sectionBody: `<div class="tt-costs"><div><span>Produktion</span><span>+${fmt(prod)}</span></div><div><span>Verbrauch</span><span>−${fmt(cons)}</span></div><div><span>Netto</span><span>${fmtRate(rate)}</span></div></div>`
    })}>
      ${resIcon(res)}<span class="res-val" data-res-val="${res}">${fmt(state.resources[res] || 0)}</span><span class="res-rate ${rateCls}" data-res-rate="${res}">${fmtRate(rate)}</span>
    </div>`;
  }).join('');
  const click = clickValue(b, r);
  return `${pills}<div class="topbar-spacer"></div><button class="topbar-click" data-action="manual-click" ${tt('Code schreiben', `+${fmt(click)} Code pro Klick. Leertaste funktioniert überall.`, { icon: getIcon('keyboard') + ' ' })}>${getIcon('keyboard')} +${fmt(click)}</button>`;
}

// ═══════════════════════════ BÜRO ═══════════════════════════
function renderQuestCard() {
  const quest = currentQuest();
  if (!quest) {
    return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Aufgaben</div><h3>${getIcon('trophy')} Alle Aufgaben erledigt</h3></div></div><p class="muted">Du hast alle ${QUESTS.length} Aufgaben abgeschlossen. Jetzt zählt nur noch das Leaderboard.</p></section>`;
  }
  const [cur, target] = questProgress(quest);
  const idx = state.questIndex;
  const rewards = quest.reward ? rewardChips(quest.reward) : '<span class="muted small">Keine Belohnung – nur Ruhm.</span>';
  const goto = quest.tab && quest.tab !== state.selectedTab ? `<button class="btn sm" data-action="tab" data-tab="${quest.tab}">Zum Tab ${escapeHtml(TABS.find(t => t.id === quest.tab)?.label || '')} →</button>` : '';
  return `
    <section class="panel quest">
      <div class="panel-head" style="margin-bottom:0">
        <div><div class="eyebrow">Aufgabe ${idx + 1} von ${QUESTS.length}</div>
          <div class="quest-title"><span class="quest-num">${idx + 1}</span>${escapeHtml(quest.title)}</div>
        </div>
        <span class="badge accent">${escapeHtml(TABS.find(t => t.id === quest.tab)?.label || 'Büro')}</span>
      </div>
      <p class="muted">${escapeHtml(quest.desc)}</p>
      <div class="quest-progress">${progress(cur, target, cur >= target ? 'good' : '')}<span class="num">${fmt(Math.min(cur, target))} / ${fmt(target)}</span></div>
      <div class="quest-foot"><div class="row"><span class="muted small">Belohnung:</span>${rewards}</div>${goto}</div>
    </section>`;
}

function renderActiveEffects() {
  const b = bonuses();
  const now = Date.now();
  const fx = [];
  if (state.event) {
    const left = Math.max(0, (state.eventEnds - now) / 1000);
    const bad = Object.values(state.event.effects || {}).some(v => v < 1 && v > 0 && v !== 0);
    fx.push(`<span class="fx ${bad ? 'bad' : 'good'}" ${tt(state.event.name, state.event.desc || 'Zufallsereignis', { meta: 'Ereignis' })}>${getIcon('zap')} ${escapeHtml(state.event.name)} <span class="fx-t">${fmtSec(left)}</span></span>`);
  }
  const proto = PROTOCOLS.find(p => p.id === state.activeProtocol && state.activeProtocolEndsAt > now);
  if (proto) fx.push(`<span class="fx good">${getIcon('star')} ${escapeHtml(proto.name)} <span class="fx-t">${fmtSec((state.activeProtocolEndsAt - now) / 1000)}</span></span>`);
  const mode = OPERATIONS_MODES.find(m => m.id === state.operationsMode);
  if (mode && mode.id !== 'balanced') fx.push(`<span class="fx">${getIcon('settings')} ${escapeHtml(mode.name)}</span>`);
  if (state.doctrine) fx.push(`<span class="fx">${getIcon('flag')} ${escapeHtml(DOCTRINES.find(d => d.id === state.doctrine)?.name || '')}</span>`);
  (state.equippedChips || []).forEach(id => { const c = CHIPS.find(x => x.id === id); if (c) fx.push(`<span class="fx">${getIcon('chip')} ${escapeHtml(c.name)}</span>`); });
  const synergy = b.teamSynergy || 1;
  fx.push(`<span class="fx" ${tt('Team-Synergie', 'Jeder Mitarbeiter gibt +0,2% auf die Gesamtproduktion (max +200%).')}>${getIcon('team')} Synergie <span class="fx-t">×${fmt(synergy)}</span></span>`);
  fx.push(`<span class="fx" ${tt('Gesamtmultiplikator', 'Alle Boni zusammen (Techs, Releases, Standorte, Chronicle, Ereignisse).')}>${getIcon('star')} Gesamt <span class="fx-t">×${fmt(b.allMult)}</span></span>`);
  return `<div class="fx-list">${fx.join('')}</div>`;
}

function renderProtocols() {
  const now = Date.now();
  const active = PROTOCOLS.find(p => p.id === state.activeProtocol && state.activeProtocolEndsAt > now);
  return PROTOCOLS.map(protocol => {
    const missing = (protocol.prereq || []).filter(id => !hasTech(id));
    const locked = missing.length > 0;
    const cooldownUntil = Number(state.protocolCooldowns?.[protocol.id] || 0);
    const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
    const running = active?.id === protocol.id;
    const affordable = canAfford(protocol.cost || {});
    const disabled = locked || running || !!active || cooldownLeft > 0 || !affordable;
    const status = running ? `<span class="badge accent">${fmtSec((state.activeProtocolEndsAt - now) / 1000)}</span>`
      : cooldownLeft > 0 ? `<span class="badge">Cooldown ${fmtSec(cooldownLeft)}</span>`
      : locked ? `<span class="badge">${getIcon('lock')} ${escapeHtml(missing.map(id => getTech(id)?.name || id).join(', '))}</span>`
      : `<span class="badge mono">${protocol.duration}s · CD ${fmtSec(protocol.cooldown)}</span>`;
    return `<div class="proto ${running ? 'running' : ''}" ${tt(protocol.name, protocol.desc, { meta: `Dauer ${protocol.duration}s · Cooldown ${fmtSec(protocol.cooldown)}`, sectionTitle: 'Kosten', sectionBody: ttCosts(protocol.cost || {}) })}>
      <div class="proto-head"><strong>${escapeHtml(protocol.name)}</strong>${status}</div>
      <div class="muted small">${escapeHtml(protocol.desc)}</div>
      <div class="row-between">${locked ? '' : costChips(protocol.cost || {})}<button class="btn sm ${!disabled ? 'primary' : ''}" data-action="activate-protocol" data-id="${protocol.id}" ${disabled ? 'disabled' : ''}>${running ? 'Läuft' : 'Aktivieren'}</button></div>
    </div>`;
  }).join('');
}

function renderFlowTable() {
  const r = rates();
  const produced = r.__produced || {};
  const consumed = r.__consumed || {};
  const starved = r.__starved || [];
  const rows = visibleResources().map(res => {
    const prod = Number(produced[res] || 0), cons = Number(consumed[res] || 0), net = Number(r[res] || 0);
    return `<div class="flow-row">
      <div class="r-name">${resIcon(res)} ${escapeHtml(RESOURCE_LABELS[res])}</div>
      <strong class="good">+${fmt(prod)}</strong>
      <strong class="${cons > 0 ? 'warn' : 'muted'}">−${fmt(cons)}</strong>
      <strong class="${net >= 0 ? 'good' : 'bad'}">${fmtRate(net, '')}</strong>
    </div>`;
  }).join('');
  const starvedNote = starved.length
    ? `<div class="notice warn" style="margin-top:10px">${getIcon('warning')}<div><strong>Konverter laufen gedrosselt:</strong> ${starved.map(id => escapeHtml(getBuilding(id)?.name || id)).join(', ')}. Ihnen fehlt Input – bau mehr Basisproduktion oder senk die Drossel.</div></div>`
    : '';
  return `<div class="flow"><div class="flow-row head"><div>Ressource</div><strong>Produktion</strong><strong>Verbrauch</strong><strong>Netto /s</strong></div>${rows}</div>${starvedNote}`;
}

function renderOverview() {
  const b = bonuses();
  const r = rates();
  const click = clickValue(b, r);
  const gain = prestigeGain();
  const isNew = state.stats.lifetime < 90 && totalBuildings() < 3;
  const anyAuto = b.autoBuild || b.autoResearch || b.autoExpeditions || b.autoProjects;

  return `
    <div class="overview-top">
      <section class="panel accent clicker">
        <div class="eyebrow" style="justify-self:start">Dein Schreibtisch</div>
        <button class="click-btn ${isNew ? 'pulse' : ''}" data-action="manual-click" ${tt('Code schreiben', 'Klick oder Leertaste. Jeder Klick gibt Code – später auch einen Anteil deiner Produktion.', { icon: getIcon('keyboard') + ' ' })}>
          ${getIcon('keyboard', 'click-icon')}
          <span>Code schreiben</span>
          <span class="click-sub">+<span data-live="click">${fmt(click)}</span> Code · Leertaste</span>
        </button>
        <div class="click-stats">
          <span>Klicks <strong>${fmt(state.stats.manualClicks || 0)}</strong></span>
          <span>Klick-Kraft <strong>×${fmt(b.clickPowerMult)}</strong></span>
          <span>Produktions-Anteil <strong>${Math.round((b.clickRateFraction || 0) * 100)}%</strong></span>
        </div>
        ${isNew ? `<div class="notice" style="text-align:left">${getIcon('help')}<div>Klick auf den Button, bis du 15 Code hast. Dann stell im Tab <strong>Team</strong> deinen ersten Praktikanten ein.</div></div>` : ''}
      </section>
      <div class="stack">
        ${renderQuestCard()}
        <div class="kpis">
          ${kpi('Code / s', `<span class="res-scrap">${fmt(r.__produced?.scrap || 0)}</span>`, `netto ${fmtRate(r.scrap)}`)}
          ${kpi('Revenue / s', `<span class="res-energy">${fmt(r.__produced?.energy || 0)}</span>`, `netto ${fmtRate(r.energy)}`)}
          ${kpi('Team', fmt(totalBuildings()), `${techCount()} Techs · ${projectCount()} Releases`)}
          ${kpi('XP bei Refactor', gain > 0 ? `+${fmt(gain)}` : '–', gain > 0 ? `Run: ${fmt(runScrap())} Code` : `ab ${fmt(scrapForNextXp())} Code`, tt('Hard Refactor', 'Setzt den Run zurück und gibt XP für permanente Upgrades (Tab Prestige).'))}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="stack" style="gap:14px">
        <section class="panel">
          <div class="panel-head"><div><div class="eyebrow">Status</div><h3>${getIcon('zap')} Aktive Effekte</h3></div></div>
          ${renderActiveEffects()}
          <div style="margin-top:14px">
            <div class="eyebrow">Sprint-Modus</div>
            <div class="toggle-row">${OPERATIONS_MODES.map(mode => `<button class="btn sm ${state.operationsMode === mode.id ? 'primary' : ''}" data-action="set-operations-mode" data-id="${mode.id}" ${tt(mode.name, mode.desc)}>${escapeHtml(mode.name)}</button>`).join('')}</div>
            <p class="muted small" style="margin-top:6px">${escapeHtml(OPERATIONS_MODES.find(m => m.id === state.operationsMode)?.desc || '')}</p>
          </div>
        </section>
        ${anyAuto || state.converterThrottle !== 1 || BUILDINGS.some(bd => bd.type === 'converter' && buildingCount(bd.id) > 0) ? `
        <section class="panel">
          <div class="panel-head"><div><div class="eyebrow">DevOps</div><h3>${getIcon('settings')} Automatisierung & Drossel</h3></div></div>
          <div class="stack">
            <div class="toggle-row">
              ${[['build', 'Auto-Hire', b.autoBuild, 'Kauft Mitarbeiter automatisch (Tech: Auto-Hire Skript).'], ['research', 'Auto-Learn', b.autoResearch, 'Lernt die günstigste Tech automatisch (Tech: Auto-Tutorials).'], ['expeditions', 'Auto-Freelance', b.autoExpeditions, 'Startet Aufträge automatisch (Tech: Auto-Freelance).'], ['projects', 'Auto-Deploy', b.autoProjects, 'Kauft Releases automatisch (Tech: Auto-Deploy).']].map(([key, label, unlocked, desc]) =>
                `<button class="btn sm ${state.auto[key] && unlocked ? 'good' : ''}" data-action="toggle" data-id="${key}" ${unlocked ? '' : 'disabled'} ${tt(label, desc, { requirement: unlocked ? '' : 'Noch nicht freigeschaltet.' })}>${unlocked ? (state.auto[key] ? getIcon('check') : '') : getIcon('lock')} ${label}</button>`).join('')}
            </div>
            <div class="row-between">
              <span class="muted small" ${tt('Konverter-Drossel', 'Begrenzt alle Konverter auf einen Anteil ihrer Kapazität – hilfreich, wenn sie zu viel Basisressourcen fressen.')}>Konverter-Drossel</span>
              <div class="seg">${[0.25, 0.5, 0.75, 1].map(v => `<button class="btn ${state.converterThrottle === v ? 'active' : ''}" data-action="set-converter-throttle" data-value="${v}">${Math.round(v * 100)}%</button>`).join('')}</div>
            </div>
          </div>
        </section>` : ''}
        <section class="panel">
          <div class="panel-head"><div><div class="eyebrow">Wirtschaft</div><h3>${getIcon('market')} Ressourcenfluss</h3></div></div>
          ${renderFlowTable()}
        </section>
      </div>
      <div class="stack" style="gap:14px">
        <section class="panel">
          <div class="panel-head"><div><div class="eyebrow">Boosts</div><h3>${getIcon('star')} Protokolle</h3><div class="sub">Temporäre Boosts mit Cooldown. Nur eines gleichzeitig.</div></div></div>
          <div class="stack">${renderProtocols()}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><div class="eyebrow">Git Log</div><h3>${getIcon('codex')} Letzte Ereignisse</h3></div></div>
          <div class="log">${state.log.map(entry => `<div class="log-item"><span class="t">${new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${escapeHtml(entry.text)}</span></div>`).join('')}</div>
        </section>
      </div>
    </div>
  `;
}

// ═══════════════════════════ TEAM ═══════════════════════════
function buildingRow(def, b, bestId) {
  const owned = buildingCount(def.id);
  const unlocked = isBuildingUnlocked(def);
  const qty = state.buyAmount;
  const amount = qty === 'max' ? Math.max(1, maxAffordable(def)) : qty;
  const cost = calcBuildingCost(def, owned, amount);
  const affordable = unlocked && canAfford(cost);
  const single = calcNextBuildingCost(def);
  const icon = CATEGORY_ICONS[def.category] || 'components';
  const utilization = state.cache.rates?.__utilization?.[def.id];
  const starved = def.type === 'converter' && owned > 0 && utilization !== undefined && utilization < 0.999;

  if (!unlocked) {
    return `<div class="b-row locked" ${tt(def.name, def.desc, { meta: def.category, requirement: unlockReason(def) })}>
      <div class="b-icon">${getIcon('lock')}</div>
      <div><div class="b-name">${escapeHtml(def.name)}</div><div class="b-desc">${escapeHtml(def.desc)}</div></div>
      <div class="b-lock">${getIcon('lock')} ${escapeHtml(unlockReason(def))}</div>
      <div></div><div></div>
    </div>`;
  }

  const out = buildingOutputPerSecond(def, state, b);
  const inp = buildingInputPerSecond(def, state, b);
  const ms = milestoneMult(owned);
  const next = nextMilestone(owned);
  let flow = '';
  if (def.type === 'modifier') {
    flow = `<span class="lbl">Passiver Bonus${owned >= MODIFIER_CAP ? ' (Max-Effekt erreicht)' : ''}</span>`;
  } else {
    flow = Object.entries(out).map(([res, v]) => `<span class="out">+${fmt(v * Math.max(1, owned))} ${escapeHtml(RESOURCE_LABELS[res])}/s</span>`).join('')
      + Object.entries(inp).map(([res, v]) => `<span class="in">−${fmt(v * Math.max(1, owned))} ${escapeHtml(RESOURCE_LABELS[res])}/s</span>`).join('')
      + `<span class="lbl">${owned ? 'gesamt' : 'pro Stück'}${owned ? ` · ${Object.entries(out).map(([res, v]) => `+${fmt(v)}`).join(' ')} je` : ''}${starved ? ` · <span class="warn">läuft bei ${Math.round(utilization * 100)}%</span>` : ''}</span>`;
  }
  const milestone = def.type === 'modifier'
    ? `<div class="lbl"><span>Wirkt bis ${MODIFIER_CAP} Stück</span><span>${owned}/${MODIFIER_CAP}</span></div>${progress(owned, MODIFIER_CAP)}`
    : next
      ? `<div class="lbl"><span>×${ms * 2} bei ${next}</span><span>${owned}/${next}</span></div>${progress(owned, next)}`
      : `<div class="lbl"><span>Max-Meilenstein</span><span>×${ms}</span></div>${progress(1, 1, 'good')}`;
  const buyLabel = qty === 'max' ? `Max (${maxAffordable(def)})` : `+${qty}`;
  const sell = owned > 0 ? `<button class="btn xs ghost" data-action="sell-building" data-id="${def.id}" ${tt('Entlassen', `1× ${def.name} entlassen. 50% der letzten Kosten zurück.`)}>${getIcon('minus')}</button>` : '';
  const isNew = !seenBuildings.has(def.id);
  return `<div class="b-row ${affordable ? 'affordable' : ''} ${starved ? 'starved' : ''} ${isNew ? 'new' : ''}" ${tt(def.name, def.desc, {
    icon: getIcon(icon) + ' ',
    meta: `${def.category} · ${def.type === 'producer' ? 'Producer' : def.type === 'converter' ? 'Konverter' : 'Modifier'}`,
    sectionTitle: `Nächstes Stück`,
    sectionBody: ttCosts(single) + (def.type !== 'modifier' ? `<div class="tt-section"><div class="tt-section-title">Pro Stück</div><div class="tt-costs">${Object.entries(out).map(([res, v]) => `<div><span>${escapeHtml(RESOURCE_LABELS[res])}</span><span>+${fmt(v)}/s</span></div>`).join('')}${Object.entries(inp).map(([res, v]) => `<div><span>${escapeHtml(RESOURCE_LABELS[res])}</span><span>−${fmt(v)}/s</span></div>`).join('')}</div></div>` : '')
  })}>
    <div class="b-icon">${getIcon(icon, `res-${def.outputs && Object.keys(def.outputs)[0] || 'components'}`)}</div>
    <div>
      <div class="b-name">${escapeHtml(def.name)}<span class="b-count">×${fmt(owned)}</span>${isNew ? '<span class="badge accent">Neu</span>' : ''}${bestId === def.id ? `<span class="badge good" ${tt('Beste Investition', 'Bestes Verhältnis von Output zu Kosten unter allen freigeschalteten Gebäuden (nächster Meilenstein eingerechnet).')}>💡 Tipp</span>` : ''}${ms > 1 ? `<span class="badge accent">×${ms}</span>` : ''}${def.type === 'converter' ? '<span class="badge">Konverter</span>' : ''}</div>
      <div class="b-desc">${escapeHtml(def.desc)}</div>
    </div>
    <div class="b-flow">${flow}</div>
    <div class="b-milestone">${milestone}</div>
    <div class="b-actions">
      ${costChips(cost)}
      ${!affordable ? etaLabel(cost) : ''}
      <button class="btn sm ${affordable ? 'affordable' : ''}" data-action="buy-building" data-id="${def.id}" data-qty="${qty}" ${affordable ? '' : 'disabled'}>${buyLabel}</button>
      ${sell}
    </div>
  </div>`;
}

function renderBuildings() {
  const b = bonuses();
  const qty = state.buyAmount;
  initSeen();
  const fresh = newBuildings();
  // Nach ~4s Anzeige als gesehen markieren
  if (fresh.length) setTimeout(() => fresh.forEach(d => seenBuildings.add(d.id)), 4000);
  const bestId = bestInvestmentId(b);
  const seg = [1, 10, 100, 'max'].map(v => `<button class="btn ${qty === v ? 'active' : ''}" data-action="set-buy-amount" data-value="${v}">${v === 'max' ? 'Max' : `×${v}`}</button>`).join('');
  const sections = CATEGORIES.map(cat => {
    const defs = BUILDINGS.filter(d => d.category === cat.id);
    const unlocked = defs.filter(isBuildingUnlocked);
    // Gesperrte Gebäude nur zeigen, wenn ihre Tech gerade erforschbar ist (nächster Schritt)
    const upcoming = defs.filter(d => !isBuildingUnlocked(d)).filter(d => {
      const techId = d.unlock.startsWith('tech:') ? d.unlock.split(':')[1] : null;
      const tech = techId ? getTech(techId) : null;
      return tech ? isTechUnlocked(tech) : false;
    });
    const hiddenCount = defs.length - unlocked.length - upcoming.length;
    if (!unlocked.length && !upcoming.length) return '';
    const owned = defs.reduce((a, d) => a + buildingCount(d.id), 0);
    return `<section class="panel"><details class="cat" data-cat="${escapeHtml(cat.id)}" open>
      <summary><div class="cat-head"><div><h3>${getIcon(cat.icon)} ${escapeHtml(cat.id)}</h3><div class="sub">${escapeHtml(cat.desc)} ${owned ? `· ${fmt(owned)} eingestellt` : ''}</div></div><span class="row"><span class="muted small">${unlocked.length}/${defs.length} freigeschaltet</span>${getIcon('chevron', 'chev')}</span></div></summary>
      <div class="rows" style="margin-top:8px">${[...unlocked, ...upcoming].map(d => buildingRow(d, b, bestId)).join('')}${hiddenCount > 0 ? `<div class="muted small" style="padding:4px 12px">+${hiddenCount} weitere durch Forschung.</div>` : ''}</div>
    </details></section>`;
  }).join('');

  return `
    <section class="panel tight">
      <div class="row-between">
        <div class="row" style="gap:14px">
          <div class="kpi" style="padding:6px 10px"><div class="kpi-label">Team</div><div class="kpi-value" style="font-size:0.95rem">${fmt(totalBuildings())}</div></div>
          <div class="kpi" style="padding:6px 10px" ${tt('Team-Synergie', '+0,2% Gesamtproduktion pro Mitarbeiter, max +200%.')}><div class="kpi-label">Synergie</div><div class="kpi-value" style="font-size:0.95rem">×${fmt(b.teamSynergy)}</div></div>
          <div class="kpi" style="padding:6px 10px" ${tt('Kostenfaktor', 'Alle Gebäudekosten werden damit multipliziert (Techs, Releases, Chronicle).')}><div class="kpi-label">Kosten</div><div class="kpi-value" style="font-size:0.95rem">×${fmt(b.buildingCostMult)}</div></div>
        </div>
        <div class="row"><span class="muted small">Kaufmenge</span><div class="seg">${seg}</div></div>
      </div>
    </section>
    ${sections}
  `;
}

// ═══════════════════════════ TECH ═══════════════════════════
function techUnlockChips(techId) {
  const chips = [];
  BUILDINGS.forEach(bd => { if (bd.unlock === 'tech:' + techId) chips.push(`<span class="badge">${getIcon(CATEGORY_ICONS[bd.category] || 'components')} ${escapeHtml(bd.name)}</span>`); });
  PROJECTS.forEach(p => { if (p.prereq.includes(techId)) chips.push(`<span class="badge">${getIcon('rocket')} ${escapeHtml(p.name)}</span>`); });
  PROTOCOLS.forEach(p => { if ((p.prereq || []).includes(techId)) chips.push(`<span class="badge">${getIcon('star')} ${escapeHtml(p.name)}</span>`); });
  TECHS.forEach(t => { if (t.prereq.includes(techId)) chips.push(`<span class="badge">${getIcon('tech')} ${escapeHtml(t.name)}</span>`); });
  return chips.join('');
}

function renderResearch() {
  const b = bonuses();
  const r = rates();
  initSeen();
  const freshTechs = newTechs();
  if (freshTechs.length) setTimeout(() => freshTechs.forEach(t => seenTechs.add(t.id)), 4000);
  const learned = TECHS.filter(t => hasTech(t.id));
  const maxLearnedTier = learned.reduce((m, t) => Math.max(m, t.tier), 0);
  const visibleTierMax = Math.min(5, Math.max(1, maxLearnedTier + 1));

  const tierSections = TECH_TIERS.filter(tier => tier.tier <= visibleTierMax).map(tier => {
    const techs = TECHS.filter(t => t.tier === tier.tier && !hasTech(t.id) && !(t.excludes || []).some(id => hasTech(id)));
    if (!techs.length) return '';
    const rows = techs.sort((a, z) => (isTechUnlocked(z) ? 1 : 0) - (isTechUnlocked(a) ? 1 : 0) || a.cost - z.cost).map(tech => {
      const available = isTechUnlocked(tech);
      const cost = nextResearchCost(tech, b);
      const affordable = available && state.resources.research >= cost;
      const missing = tech.prereq.filter(id => !hasTech(id)).map(id => getTech(id)?.name || id);
      const eta = available && !affordable ? etaLabel({ research: cost }) : '';
      const isNew = available && !seenTechs.has(tech.id);
      return `<div class="t-row ${available ? '' : 'locked'} ${affordable ? 'affordable' : ''} ${isNew ? 'new' : ''}" ${tt(tech.name, tech.desc, { meta: `Stufe ${tier.tier} · ${tier.name}`, requirement: available ? '' : `Benötigt: ${missing.join(', ')}` })}>
        <div><div class="t-name">${available ? getIcon('tech', 'res-research') : getIcon('lock')} ${escapeHtml(tech.name)}${isNew ? '<span class="badge accent">Neu</span>' : ''}${tech.excludes ? '<span class="badge warn">Entweder/Oder</span>' : ''}</div>
          ${!available ? `<div class="t-desc bad">Benötigt: ${escapeHtml(missing.join(', '))}</div>` : ''}
        </div>
        <div><div class="t-desc">${escapeHtml(tech.desc)}</div><div class="t-unlocks">${techUnlockChips(tech.id)}</div></div>
        <div class="t-actions">
          <span class="cost ${affordable ? 'ok' : 'no'}">${resIcon('research')}${fmt(cost)}</span>
          ${eta}
          <button class="btn sm ${affordable ? 'affordable' : ''}" data-action="buy-tech" data-id="${tech.id}" ${affordable ? '' : 'disabled'}>Lernen</button>
        </div>
      </div>`;
    }).join('');
    return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Stufe ${tier.tier}</div><h3>${escapeHtml(tier.name)}</h3><div class="sub">${escapeHtml(tier.desc)}</div></div><span class="meta">${TECHS.filter(t => t.tier === tier.tier && hasTech(t.id)).length}/${TECHS.filter(t => t.tier === tier.tier).length} gelernt</span></div><div class="rows">${rows}</div></section>`;
  }).join('');

  return `
    <section class="panel tight">
      <div class="kpis">
        ${kpi('Ideas', `<span class="res-research">${fmt(state.resources.research)}</span>`, `${fmtRate(r.research)}`)}
        ${kpi('Gelernt', `${learned.length} / ${TECHS.length}`, 'Technologien')}
        ${kpi('Kostenfaktor', `×${fmt(b.researchCostMult)}`, 'auf alle Forschungskosten')}
        ${kpi('Ideas-Quellen', fmt(buildingCount('seo_expert') + buildingCount('brainstorming_lab') + buildingCount('agile_workshop')), 'SEO, Brainstorming, Workshops')}
      </div>
    </section>
    ${tierSections || `<section class="panel">${emptyState('check', 'Alles gelernt', 'Du hast das Internet durchgespielt.')}</section>`}
    ${learned.length ? `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Gelernt</div><h3>${getIcon('check')} Dein Tech-Stack</h3></div></div><div class="tag-list">${learned.map(t => `<span class="chip done" ${tt(t.name, t.desc)}>${getIcon('check')} ${escapeHtml(t.name)}</span>`).join('')}</div></section>` : ''}
  `;
}

// ═══════════════════════════ RELEASES ═══════════════════════════
function renderProjects() {
  const b = bonuses();
  const available = PROJECTS.filter(p => !hasProject(p.id) && p.prereq.every(isProjectRequirementMet));
  const upcoming = PROJECTS.filter(p => !hasProject(p.id) && !p.prereq.every(isProjectRequirementMet));
  const released = PROJECTS.filter(p => hasProject(p.id));

  const card = (project, locked) => {
    const cost = nextProjectCost(project, b);
    const affordable = !locked && canAfford(cost);
    const missing = project.prereq.filter(id => !isProjectRequirementMet(id)).map(projectRequirementLabel);
    return `<article class="item ${locked ? 'locked' : ''} ${affordable ? 'affordable' : ''}" ${tt(project.name, project.desc, { meta: 'Release', sectionTitle: 'Kosten', sectionBody: ttCosts(cost), requirement: locked ? `Benötigt: ${missing.join(', ')}` : '' })}>
      <div class="item-head"><strong>${getIcon('rocket')} ${escapeHtml(project.name)}</strong>${locked ? `<span class="badge">${getIcon('lock')} ${escapeHtml(missing.join(', '))}</span>` : ''}</div>
      <p>${escapeHtml(project.desc)}</p>
      <div class="tag-list">${(project.effects || []).map(e => `<span class="badge good">${escapeHtml(e)}</span>`).join('')}</div>
      ${costChips(cost)}
      <div class="item-foot">${!locked && !affordable ? etaLabel(cost) : '<span></span>'}<button class="btn sm ${affordable ? 'affordable' : ''}" data-action="buy-project" data-id="${project.id}" ${affordable ? '' : 'disabled'}>Release</button></div>
    </article>`;
  };

  return `
    <section class="panel tight"><div class="kpis">
      ${kpi('Verfügbar', fmt(available.length), 'Releases bereit')}
      ${kpi('Released', `${released.length} / ${PROJECTS.length}`, 'in diesem Run')}
      ${kpi('Kostenfaktor', `×${fmt(b.projectCostMult)}`, 'auf alle Release-Kosten')}
      ${kpi('Funde', `${artifactCount()} / ${ARTIFACTS.length}`, 'permanent, über Aufträge')}
    </div></section>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Releases</div><h3>${getIcon('rocket')} Verfügbare Produkte</h3><div class="sub">Einmalige Megaprojekte mit permanentem Effekt für diesen Run.</div></div></div>
      ${available.length ? `<div class="grid-auto">${available.map(p => card(p, false)).join('')}</div>` : emptyState('lock', 'Noch nichts releasebar', 'Forsche weiter – Docker schaltet die ToDo App frei.')}
    </section>
    ${upcoming.length ? `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Roadmap</div><h3>${getIcon('time')} Bald verfügbar</h3></div></div><div class="grid-auto">${upcoming.slice(0, 6).map(p => card(p, true)).join('')}</div></section>` : ''}
    ${released.length ? `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Live</div><h3>${getIcon('check')} Released</h3></div></div><div class="tag-list">${released.map(p => `<span class="chip done" ${tt(p.name, (p.effects || []).join(' · '))}>${getIcon('check')} ${escapeHtml(p.name)}</span>`).join('')}</div></section>` : ''}
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Permanent</div><h3>${getIcon('trophy')} Funde</h3><div class="sub">Seltene Drops aus Freelance-Aufträgen. Bleiben über jeden Refactor erhalten.</div></div><span class="meta">${artifactCount()} / ${ARTIFACTS.length}</span></div>
      <div class="grid-auto-sm">${ARTIFACTS.map(a => `<article class="item ${hasArtifact(a.id) ? 'done' : 'locked'}"><div class="item-head"><strong>${getIcon(hasArtifact(a.id) ? 'trophy' : 'lock')} ${escapeHtml(a.name)}</strong></div><p>${escapeHtml(a.desc)}</p></article>`).join('')}</div>
    </section>
  `;
}

// ═══════════════════════════ EXPANSION ═══════════════════════════
function renderMissions(b) {
  const r = rates();
  const active = state.expeditions;
  const now = Date.now();
  const activeHtml = active.length ? active.map(m => {
    const total = Math.max(1, m.end - m.start);
    const elapsed = Math.max(0, now - m.start);
    const remaining = Math.max(0, (m.end - now) / 1000);
    return `<div class="m-active"><div class="row-between"><strong>${getIcon('time')} ${escapeHtml(m.name)}</strong><span class="badge mono">${fmtSec(remaining)}</span></div>${progress(elapsed, total)}</div>`;
  }).join('') : `<p class="muted small">Keine Aufträge aktiv. ${b.availableExpeditionSlots} Slot(s) frei.</p>`;

  const rows = MISSIONS.map(mission => {
    const powerReq = missionPowerReq(mission);
    const canLaunch = b.availableExpeditionSlots > 0 && b.availableExpeditionPower >= powerReq;
    const success = Math.round(missionSuccessChance(mission, b) * 100);
    const rewards = getDynamicMissionRewards(mission, b, r);
    const duration = Math.max(30, mission.duration / b.expeditionSpeed);
    return `<div class="m-row" ${tt(mission.name, mission.desc, { meta: `Dauer ${fmtSec(duration)} · Power ${fmt(powerReq)} · Erfolg ${success}%`, sectionTitle: 'Belohnung (aktuell)', sectionBody: ttCosts(rewards) })}>
      <div><div class="m-name">${escapeHtml(mission.name)}<span class="badge mono">${fmtSec(duration)}</span></div><div class="m-desc">${escapeHtml(mission.desc)}</div></div>
      <div><div class="m-rewards">${rewardChips(rewards)}</div><div class="muted small" style="margin-top:4px">Erfolg <strong class="${success >= 80 ? 'good' : success >= 60 ? 'warn' : 'bad'}">${success}%</strong> · Fund-Chance ${Math.round((mission.relicChance + b.relicChance) * 100)}% · Power ${fmt(powerReq)}</div></div>
      <button class="btn sm ${canLaunch ? 'primary' : ''}" data-action="send-mission" data-id="${mission.id}" ${canLaunch ? '' : 'disabled'}>Annehmen</button>
    </div>`;
  }).join('');

  return `
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Freelance</div><h3>${getIcon('briefcase')} Aufträge</h3><div class="sub">Laufen im Hintergrund. Belohnung skaliert mit deiner Produktion.</div></div>
        <div class="row">${b.availableExpeditionSlots > 0 && MISSIONS.some(m => b.availableExpeditionPower >= missionPowerReq(m)) ? `<button class="btn sm primary" data-action="fill-missions" ${tt('Beste Aufträge starten', 'Füllt alle freien Slots mit den stärksten Aufträgen, die deine Power erlaubt.')}>Beste Aufträge starten</button>` : ''}<span class="badge" ${tt('Slots', 'Gleichzeitig laufende Aufträge. Mehr durch Freelance Portal, Funde, Releases.')}>Slots ${b.availableExpeditionSlots}/${b.expeditionSlots}</span><span class="badge" ${tt('Power', 'Team-Seniorität. Jeder Auftrag bindet Power, bis er fertig ist.')}>Power ${fmt(b.availableExpeditionPower)}/${fmt(b.totalExpeditionPower)}</span><span class="badge" ${tt('Agentur-Level', 'Steigt mit abgeschlossenen Aufträgen. Aufträge werden schneller und lohnender.')}>Lvl ${state.stats.fleetLevel || 0}</span></div>
      </div>
      <div class="stack" style="margin-bottom:12px">${activeHtml}</div>
      <div class="rows">${rows}</div>
    </section>`;
}

function renderColonies(b) {
  const cost = colonyFoundCost();
  const canFound = canFoundColony();
  const atCap = colonyCount() >= b.colonyCap;
  const cards = state.colonies.map(colony => {
    const world = WORLDS.find(w => w.id === colony.world) || WORLDS[0];
    const upgradeCost = colonyUpgradeCost(colony);
    const maxed = colony.level >= COLONY_MAX_LEVEL;
    const canUpgrade = !maxed && canAfford(upgradeCost);
    return `<article class="item colony">
      <div class="colony-head"><div class="row"><span class="colony-icon">${world.icon}</span><div><strong>${escapeHtml(colony.name)}</strong><div class="muted small">${escapeHtml(world.desc)}</div></div></div><span class="badge accent">Lvl ${colony.level}${maxed ? ' (Max)' : ''}</span></div>
      <div class="stat-list">${statRow('Zufriedenheit', `${fmt(colony.stability)}%`)}${statRow('Standort-Bonus', `+${fmt(2 * Math.min(colony.level, 15) * Math.min(1.3, Math.max(0.5, colony.stability / 100)))}% Gesamt`)}</div>
      <div><div class="muted small" style="margin-bottom:4px">Fokus</div><div class="focus-grid">${FOCI.map(f => `<button class="btn ${colony.focus === f.id ? 'primary' : ''}" data-action="set-focus" data-id="${colony.id}" data-focus="${f.id}" ${tt(f.name, f.desc + ' Wechsel kostet 2% Zufriedenheit.')}>${escapeHtml(f.name)}</button>`).join('')}</div></div>
      ${maxed ? '' : costChips(upgradeCost)}
      <div class="item-foot">${maxed ? '<span class="muted small">Ausgebaut.</span>' : `<button class="btn sm ${canUpgrade ? 'affordable' : ''}" data-action="upgrade-colony" data-id="${colony.id}" ${canUpgrade ? '' : 'disabled'}>Renovieren → Lvl ${colony.level + 1}</button>`}</div>
    </article>`;
  }).join('');

  return `
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Standorte</div><h3>${getIcon('building')} Büros weltweit</h3><div class="sub">Jeder Standort gibt +2% Gesamtproduktion pro Stufe plus Stadt-Boni.</div></div>
        <div class="row"><span class="badge">${colonyCount()}/${b.colonyCap} Standorte</span>${state.colonies.length ? `<button class="btn sm" data-action="upgrade-all-colonies">Alle renovieren</button>` : ''}</div>
      </div>
      ${b.colonyCap === 0 ? `<div class="notice">${getIcon('lock')}<div>Standorte werden mit der Tech <strong>Remote Work</strong> freigeschaltet. Weitere Slots: ToDo App, Metaverse, HR Department, Chronicle „Remote-First“.</div></div>` : `
      <div class="row-between" style="margin-bottom:12px">
        <div><div class="muted small">Nächster Standort: <strong>${escapeHtml((WORLDS[colonyCount() % WORLDS.length] || WORLDS[0]).name)}</strong>${atCap ? ' · Limit erreicht' : ''}</div>${costChips(cost)}</div>
        <button class="btn ${canFound ? 'primary' : ''}" data-action="found-colony" ${canFound ? '' : 'disabled'}>Standort eröffnen</button>
      </div>`}
      ${cards ? `<div class="grid-auto">${cards}</div>` : ''}
    </section>`;
}

function renderDoctrine(b) {
  if (!b.doctrineUnlock) return '';
  const active = DOCTRINES.find(d => d.id === state.doctrine);
  return `<section class="panel">
    <div class="panel-head"><div><div class="eyebrow">Kultur</div><h3>${getIcon('flag')} Core Values</h3><div class="sub">Eine Doktrin pro Run. Gilt bis zum nächsten Hard Refactor.</div></div>${active ? '<span class="badge good">Aktiv</span>' : ''}</div>
    <div class="grid-auto-sm">${DOCTRINES.map(d => `<article class="item ${active?.id === d.id ? 'done' : (active ? 'locked' : '')}">
      <div class="item-head"><strong>${escapeHtml(d.name)}</strong></div><p>${escapeHtml(d.desc)}</p>
      <div class="tag-list">${d.effects.map(e => `<span class="badge good">${escapeHtml(e)}</span>`).join('')}</div>
      ${active ? '' : `<button class="btn sm primary" data-action="doctrine" data-id="${d.id}">Wählen</button>`}
    </article>`).join('')}</div>
  </section>`;
}

function renderExpansion() {
  const b = bonuses();
  const freelance = hasTech('freelance_platform');
  if (!freelance && b.colonyCap === 0) {
    return `<section class="panel">${emptyState('globe', 'Expansion noch gesperrt', 'Die Tech „Upwork Account“ schaltet Freelance-Aufträge frei, „Remote Work“ die Standorte.')}</section>`;
  }
  return `
    ${freelance ? renderMissions(b) : `<section class="panel"><div class="notice">${getIcon('lock')}<div>Freelance-Aufträge werden mit der Tech <strong>Upwork Account</strong> freigeschaltet.</div></div></section>`}
    ${renderColonies(b)}
    ${renderDoctrine(b)}
  `;
}

// ═══════════════════════════ BÖRSE ═══════════════════════════
function renderStockCard(stock) {
  const price = getStockPrice(stock.id);
  const history = state.stockMarket?.history?.[stock.id] || [price];
  const prevPrice = history.length > 1 ? history[history.length - 2] : price;
  const trend = price > prevPrice * 1.005 ? 'up' : price < prevPrice * 0.995 ? 'down' : 'flat';
  const trendClass = trend === 'up' ? 'good' : trend === 'down' ? 'bad' : 'muted';
  const owned = getOwnedShares(stock.id);
  const cash = state.resources.energy || 0;
  let points = '0,17 100,17';
  if (history.length >= 2) {
    const min = Math.min(...history), max = Math.max(...history), range = max - min || 1;
    points = history.map((v, i) => `${((i / (history.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / range) * 26).toFixed(1)}`).join(' ');
  }
  const color = trend === 'up' ? 'var(--good)' : trend === 'down' ? 'var(--bad)' : 'var(--muted)';
  const maxBuy = price > 0 ? Math.floor(cash / price) : 0;
  const buy = [1, 10, 100].map(n => `<button class="mkt-btn buy" data-action="buy-stock" data-id="${stock.id}" data-shares="${n}" ${cash >= n * price ? '' : 'disabled'}>+${n}<small>${fmt(n * price)}</small></button>`).join('')
    + `<button class="mkt-btn buy" data-action="buy-stock" data-id="${stock.id}" data-shares="${maxBuy}" ${maxBuy > 0 ? '' : 'disabled'}>Max<small>${fmt(maxBuy)}</small></button>`;
  const sell = [1, 10, 100].map(n => `<button class="mkt-btn sell" data-action="sell-stock" data-id="${stock.id}" data-shares="${n}" ${owned >= n ? '' : 'disabled'}>−${n}<small>${fmt(n * price * (1 - BROKER_FEE))}</small></button>`).join('')
    + `<button class="mkt-btn sell" data-action="sell-stock" data-id="${stock.id}" data-shares="${owned}" ${owned > 0 ? '' : 'disabled'}>Alle<small>${fmt(owned * price * (1 - BROKER_FEE))}</small></button>`;
  const pct = prevPrice ? ((price / prevPrice - 1) * 100).toFixed(1) : '0.0';
  return `<article class="item mkt">
    <div class="mkt-head"><div><strong>${escapeHtml(stock.name)}</strong><div class="muted small mono">${escapeHtml(stock.ticker)} · Dividende ${fmt(stock.dividendRate)} ${escapeHtml(RESOURCE_LABELS[stock.resource])}/s je Aktie</div></div><span class="badge mono ${trendClass}">${trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'} ${Number(pct) >= 0 ? '+' : ''}${pct}%</span></div>
    <div class="mkt-spark"><svg viewBox="0 0 100 34" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
    <div class="row-between"><span class="mono">Kurs <strong>${fmt(price)}</strong> <span class="muted">Revenue</span></span><span class="muted small">Depot: <strong class="mono">${fmt(owned)}</strong> Aktien</span></div>
    <div class="mkt-btns">${buy}</div>
    <div class="mkt-btns">${sell}</div>
  </article>`;
}

function renderMarket() {
  if (!hasTech('freelance_platform')) {
    return `<section class="panel">${emptyState('lock', 'Börse gesperrt', 'Schalte „Upwork Account“ in der Forschung frei, um Aktien zu handeln.')}</section>`;
  }
  const nextUpdate = timeUntilNextPriceUpdate();
  const dividends = totalDividendRate();
  return `
    <section class="panel tight"><div class="kpis">
      ${kpi('Depotwert', `${fmt(portfolioValue())}`, 'Revenue')}
      ${kpi('Gebühr', `${Math.round(BROKER_FEE * 100)}%`, 'beim Verkauf')}
      ${kpi('Kurs-Update', nextUpdate === null ? 'Verbinde…' : fmtSec(nextUpdate / 1000), '<span class="live">LIVE</span> serverbasiert, alle Spieler')}
      ${kpi('Dividenden', Object.keys(dividends).length ? Object.entries(dividends).map(([res, v]) => `<span class="res-${res}">${fmt(v)}</span>`).join(' · ') : '–', 'pro Sekunde')}
    </div></section>
    <section class="panel"><div class="panel-head"><div><div class="eyebrow">Ressourcen-Börse</div><h3>${getIcon('market')} Aktien</h3><div class="sub">Kaufe mit Revenue. Jede Aktie zahlt Dividenden in ihrer Ressource – auch offline.</div></div></div>
      <div class="grid-auto">${STOCKS.map(renderStockCard).join('')}</div>
    </section>`;
}

// ═══════════════════════════ PRESTIGE ═══════════════════════════
function renderMainframe() {
  const slots = state.mainframeSlots || 3;
  const equipped = state.equippedChips || [];
  const owned = state.ownedChips || [];
  const unequipped = owned.filter(id => !equipped.includes(id));
  const slotCards = [];
  for (let i = 0; i < slots; i++) {
    const chip = CHIPS.find(c => c.id === equipped[i]);
    slotCards.push(chip
      ? `<article class="item chip-card ${chip.rarity}"><div class="item-head"><strong>${getIcon('chip')} ${escapeHtml(chip.name)}</strong><span class="badge rarity-${chip.rarity}">${chip.rarity}</span></div><p>${escapeHtml(chip.desc)}</p><button class="btn xs danger" data-action="unequip-chip" data-id="${chip.id}">Entfernen</button></article>`
      : `<article class="item chip-card empty"><div class="item-head"><strong>Slot ${i + 1}</strong></div><p>Leer. Chips findest du auf Freelance-Aufträgen.</p></article>`);
  }
  return `<section class="panel">
    <div class="panel-head"><div><div class="eyebrow">Mainframe</div><h3>${getIcon('chip')} Chips</h3><div class="sub">Ausrüstbare Boni mit Tradeoffs. Bleiben über jeden Refactor.</div></div><span class="meta">${equipped.length}/${slots} Slots · ${owned.length}/${CHIPS.length} gefunden</span></div>
    <div class="grid-auto-sm">${slotCards.join('')}</div>
    ${unequipped.length ? `<div class="eyebrow" style="margin-top:14px">Inventar</div><div class="grid-auto-sm">${unequipped.map(id => { const c = CHIPS.find(x => x.id === id); if (!c) return ''; return `<article class="item chip-card ${c.rarity}"><div class="item-head"><strong>${getIcon('chip')} ${escapeHtml(c.name)}</strong><span class="badge rarity-${c.rarity}">${c.rarity}</span></div><p>${escapeHtml(c.desc)}</p><button class="btn xs ${equipped.length < slots ? 'primary' : ''}" data-action="equip-chip" data-id="${c.id}" ${equipped.length < slots ? '' : 'disabled'}>Installieren</button></article>`; }).join('')}</div>` : ''}
  </section>`;
}

function renderPrestige() {
  const gain = prestigeGain();
  const raw = prestigeGainRaw();
  const frac = raw - Math.floor(raw);
  const nextIn = scrapForNextXp();
  const canReset = gain > 0;
  const keep = [`${state.artifacts.length} Funde`, `${state.achievements.length} Errungenschaften`, `${state.ownedChips.length} Chips`, 'Chronicle-Upgrades & Meilensteine', 'Aufgaben-Fortschritt, Aktien-Depot', 'Lebenszeit-Statistiken'];
  const reset = ['Alle Mitarbeiter (außer Start-Team)', 'Tech-Stack', 'Releases', 'Standorte & laufende Aufträge', 'Ressourcen', 'Core Values (neu wählen)'];
  return `
    <div class="prestige-hero">
      <section class="panel accent">
        <div class="eyebrow">Hard Refactor</div>
        <div class="row-between" style="align-items:flex-end">
          <div><div class="xp-big">+${fmt(gain)} <small>XP bei Refactor</small></div><div class="muted small" style="margin-top:6px">Run: ${fmt(runScrap())} Code · XP = 6 · ∛(Code / 10 Mio.) · Struktur-Bonus ×${fmt(1 + techCount() * 0.02 + projectCount() * 0.05 + colonyCount() * 0.03)} · ${fmt(bonuses().prestigeGainMult)}× Multiplikator</div></div>
          <div class="kpi"><div class="kpi-label">XP-Guthaben</div><div class="kpi-value">${fmt(state.chronicle)}</div><div class="kpi-sub">${state.stats.prestigeCount} Refactors</div></div>
        </div>
        <div style="margin:12px 0 6px">${progress(frac, 1)}<div class="muted small" style="margin-top:4px">Nächster XP-Punkt in ${fmt(nextIn)} Code</div></div>
        <button class="btn ${canReset ? 'primary' : ''} block" data-action="prestige" ${canReset ? '' : 'disabled'} ${tt('Hard Refactor', canReset ? 'Setzt den Run zurück und gibt XP.' : 'Noch nicht genug Code in diesem Run. Ab ~10 Mio. Code gibt es den ersten XP-Punkt.')}>${getIcon('prestige')} Hard Refactor${canReset ? ` (+${fmt(gain)} XP)` : ''}</button>
        <p class="muted small" style="margin-top:8px">Tipp: Der erste Refactor lohnt sich ab etwa 10–20 XP. Jeder Run danach geht deutlich schneller.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Was passiert?</div><h3>${getIcon('help')} Behalten vs. Zurücksetzen</h3></div></div>
        <div class="keep-reset">
          <div class="keep"><p class="good">Bleibt</p><ul>${keep.map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul></div>
          <div class="reset"><p class="bad">Weg</p><ul>${reset.map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul></div>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Chronicle</div><h3>${getIcon('star')} Permanente Upgrades</h3><div class="sub">Mit XP kaufen. Gelten für immer, in jedem Run.</div></div><span class="meta">${fmt(state.chronicle)} XP verfügbar</span></div>
      <div class="grid-auto-sm">${CHRONICLE_UPGRADES.map(u => {
        const level = state.chronicleUpgrades[u.id] || 0;
        const maxed = u.max && level >= u.max;
        const cost = chronicleCost(u.id);
        const can = !maxed && state.chronicle >= cost;
        return `<article class="item ${can ? 'affordable' : ''} ${maxed ? 'done' : ''}">
          <div class="item-head"><strong>${escapeHtml(u.name)}</strong><span class="badge accent">Lvl ${level}${u.max ? `/${u.max}` : ''}</span></div>
          <p>${escapeHtml(u.desc)}</p>
          <div class="item-foot"><span class="cost ${can ? 'ok' : 'no'}">${getIcon('star')}${maxed ? 'Max' : `${fmt(cost)} XP`}</span><button class="btn sm ${can ? 'affordable' : ''}" data-action="buy-chronicle" data-id="${u.id}" ${can ? '' : 'disabled'}>Kaufen</button></div>
        </article>`;
      }).join('')}</div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Dauerhaft</div><h3>${getIcon('trophy')} Meilensteine</h3><div class="sub">Einmal erreicht, für immer aktiv.</div></div><span class="meta">${(state.prestigeMilestones || []).length}/${PRESTIGE_MILESTONES.length}</span></div>
      <div class="grid-auto-sm">${PRESTIGE_MILESTONES.map(m => { const earned = (state.prestigeMilestones || []).includes(m.id); return `<article class="item ${earned ? 'done' : 'locked'}"><div class="item-head"><strong>${getIcon(earned ? 'check' : 'lock')} ${escapeHtml(m.name)}</strong><span class="badge ${earned ? 'good' : ''}">${escapeHtml(m.label)}</span></div><p>${escapeHtml(m.desc)}</p></article>`; }).join('')}</div>
    </section>
    ${renderMainframe()}
  `;
}

// ═══════════════════════════ CODEX ═══════════════════════════
function renderCodex() {
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id));
  const guide = [
    ['Loop', 'Klicken → Praktikanten kaufen → Google Ads für Revenue → SEO-Experten für Ideas → Techs lernen → bessere Mitarbeiter. Alle 10/25/50/100… Stück verdoppelt sich der Output eines Gebäudes.'],
    ['Konverter', 'Verbrauchen echten Vorrat. Wenn der Input fehlt, laufen sie gedrosselt (gelber Rand im Team-Tab). Die Drossel im Büro-Tab begrenzt sie global.'],
    ['Revenue', 'Zweite Währung für bessere Mitarbeiter, Konverter, Standorte und die Börse. Google Ads und Nachfolger produzieren sie.'],
    ['Ideas & Users', 'SEO-Experten machen aus Revenue Ideas und Users. Brainstorming macht aus Users noch mehr Ideas. Ideas kaufen Techs.'],
    ['Bugs & Module', 'QA Tester verwandeln Code in Bugs, NPM Install Bugs in Module. Beides braucht man für Releases, Growth Hacker und Standorte.'],
    ['Hype & Legacy', 'Tech Blogger machen aus Ideas Hype (für Standorte, große Releases). Code-Archäologen und Aufträge liefern Legacy Code.'],
    ['Prestige', 'Ein Hard Refactor gibt XP = 6·∛(Run-Code/10 Mio.). XP kauft permanente Chronicle-Upgrades. Ab ~10 XP lohnt es sich.'],
    ['Offline', 'Bis zum Offline-Limit (Standard 8h) wird mit 50% Effizienz weitergerechnet. Chronicle-Upgrades erhöhen beides.']
  ];
  const keys = [['Leertaste', 'Code schreiben'], ['O / B / R / P / E / M / S / C / A', 'Tabs wechseln'], ['1 / 2 / 3 / 4', 'Kaufmenge ×1 / ×10 / ×100 / Max'], ['Esc', 'Modal schließen']];
  return `
    <section class="panel tight"><div class="kpis">
      ${kpi('Errungenschaften', `${unlocked.length} / ${ACHIEVEMENTS.length}`, `+${unlocked.length}% Gesamtproduktion`)}
      ${kpi('Aufgaben', `${state.stats.questsDone || 0} / ${QUESTS.length}`, 'erledigt')}
      ${kpi('Spielzeit', fmtSec(state.stats.lifetime), 'gesamt')}
      ${kpi('Klicks', fmt(state.stats.manualClicks || 0), 'gesamt')}
    </div></section>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Guide</div><h3>${getIcon('help')} So funktioniert's</h3></div></div>
      <div class="grid-auto">${guide.map(([t, d]) => `<article class="item"><div class="item-head"><strong>${escapeHtml(t)}</strong></div><p>${escapeHtml(d)}</p></article>`).join('')}</div>
    </section>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Tastatur</div><h3>${getIcon('keyboard')} Shortcuts</h3></div></div>
        <div class="stat-list">${keys.map(([k, d]) => statRow(d, `<span class="badge mono">${escapeHtml(k)}</span>`)).join('')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Support</div><h3>${getIcon('flag')} Bug melden / Feedback</h3></div></div>
        <p class="muted small" style="margin-bottom:10px">Etwas stimmt nicht oder du hast eine Idee? Bitte Prestige-Anzahl, ungefähre Ressourcen und den Tab angeben.</p>
        <div class="toggle-row"><a class="btn primary sm" href="https://github.com/SuriveAUT/CodeTycoon/issues/new/choose" target="_blank" rel="noopener noreferrer">Issue öffnen</a><a class="btn sm" href="https://github.com/SuriveAUT/CodeTycoon/issues" target="_blank" rel="noopener noreferrer">Alle Issues</a></div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Zahlen</div><h3>${getIcon('market')} Statistiken</h3><div class="sub">Lebenszeit, über alle Refactors.</div></div></div>
      <div class="grid-2">
        <div class="stat-list">${RESOURCES.map(res => statRow(`${RESOURCE_LABELS[res]} gesamt`, `<span class="res-${res}">${fmt(state.stats.total[res] || 0)}</span>`)).join('')}</div>
        <div class="stat-list">
          ${statRow('Refactors', fmt(state.stats.prestigeCount || 0))}
          ${statRow('XP gesamt verdient', fmt((state.chronicle || 0) + CHRONICLE_UPGRADES.reduce((a, u) => { let sum = 0; for (let l = 0; l < (state.chronicleUpgrades[u.id] || 0); l++) sum += Math.floor(u.base * Math.pow(1.32, l)); return a + sum; }, 0)))}
          ${statRow('Releases gebaut', fmt(state.stats.projectsBuilt || 0))}
          ${statRow('Aufträge erledigt', fmt(state.stats.expeditionsDone || 0))}
          ${statRow('Entscheidungen getroffen', fmt(state.stats.decisionsMade || 0))}
          ${statRow('Protokolle aktiviert', fmt(state.stats.protocolsUsed || 0))}
          ${statRow('Agentur-Level', fmt(state.stats.fleetLevel || 0))}
          ${statRow('Erster Start', new Date(state.stats.firstSeen).toLocaleDateString('de-DE'))}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Badges</div><h3>${getIcon('trophy')} Errungenschaften</h3><div class="sub">Jede Errungenschaft gibt +1% Gesamtproduktion – permanent.</div></div><span class="meta">${unlocked.length}/${ACHIEVEMENTS.length}</span></div>
      <div class="grid-auto-sm">${ACHIEVEMENTS.map(a => { const done = state.achievements.includes(a.id); return `<article class="item ${done ? 'done' : 'locked'}"><div class="item-head"><strong>${getIcon(done ? 'check' : 'lock')} ${escapeHtml(a.name)}</strong></div><p>${escapeHtml(a.desc)}</p></article>`; }).join('')}</div>
    </section>
  `;
}

// ═══════════════════════════ ACCOUNT ═══════════════════════════
function renderLeaderboard() {
  const lb = state.cache.leaderboard;
  if (!Array.isArray(lb)) return '<p class="muted small">Lade Rangliste…</p>';
  if (!lb.length) return '<p class="muted small">Noch keine Einträge.</p>';
  return `<div class="stack" style="gap:4px">${lb.slice(0, 50).map((e, i) => `<div class="lb-row"><span class="rank">#${i + 1}</span><strong class="truncate">${escapeHtml(e.username || '?')}</strong><span class="muted mono small">${fmt(e.prestige ?? e.prestige_score ?? 0)} Refactors · ${fmt(e.totalScrap ?? e.total_scrap ?? 0)} Code</span><button class="btn xs" data-action="view-profile" data-id="${escapeHtml(e.username || '')}">Profil</button></div>`).join('')}</div>`;
}

function renderAccount() {
  const loggedIn = AstraforgeAPI.isLoggedIn();
  const username = AstraforgeAPI.username || '';
  const flagged = Boolean(AstraforgeAPI.flagged);
  return `
    <div class="grid-2">
      <section class="panel">
        ${loggedIn ? `
          <div class="panel-head"><div><div class="eyebrow">Cloud</div><h3>${getIcon('account')} ${escapeHtml(username)}</h3><div class="sub">Eingeloggt. Der Spielstand wird alle 30s synchronisiert.</div></div><span class="badge good">Online</span></div>
          ${flagged ? `<div class="notice bad" style="margin-bottom:10px">${getIcon('warning')}<div><strong>Account geflaggt.</strong> ${escapeHtml(AstraforgeAPI.flagReason || 'Kein Grund angegeben.')} – Leaderboard ausgeblendet.</div></div>` : ''}
          <div class="toggle-row">
            <button class="btn primary sm" data-action="force-sync">${getIcon('check')} Jetzt speichern</button>
            <button class="btn sm" data-action="load-cloud" ${tt('Cloud laden', 'Überschreibt den lokalen Stand mit dem Cloud-Save.')}>Cloud laden</button>
            <button class="btn danger sm" data-action="auth-logout">Logout</button>
          </div>
        ` : `
          <div class="panel-head"><div><div class="eyebrow">Cloud-Save</div><h3>${getIcon('account')} Anmelden</h3><div class="sub">Für Cloud-Save auf allen Geräten, Leaderboard und Chat.</div></div><span class="badge">Lokal</span></div>
          <div class="form-grid">
            <input id="auth-user" class="input" type="text" placeholder="Benutzername" autocomplete="username" />
            <input id="auth-pass" class="input" type="password" placeholder="Passwort" autocomplete="current-password" />
            <div class="toggle-row"><button class="btn primary" data-action="auth-login">Einloggen</button><button class="btn" data-action="auth-register">Registrieren</button></div>
          </div>
        `}
      </section>
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Spielstand</div><h3>${getIcon('settings')} Lokal</h3></div></div>
        <div class="stat-list">
          ${statRow('Erster Start', new Date(state.stats.firstSeen).toLocaleDateString('de-DE'))}
          ${statRow('Spielzeit', fmtSec(state.stats.lifetime))}
          ${statRow('Refactors', fmt(state.stats.prestigeCount))}
          ${statRow('Code gesamt', fmt(state.stats.total.scrap))}
        </div>
        <div class="eyebrow" style="margin-top:12px">Einstellungen</div>
        <div class="toggle-row">
          <button class="btn sm ${getSetting('particles') ? 'good' : ''}" data-action="toggle-setting" data-id="particles">${getSetting('particles') ? getIcon('check') : ''} Klick-Partikel</button>
          <button class="btn sm ${getSetting('toasts') ? 'good' : ''}" data-action="toggle-setting" data-id="toasts">${getSetting('toasts') ? getIcon('check') : ''} Benachrichtigungen</button>
          <button class="btn sm ${getSetting('sciNotation') ? 'good' : ''}" data-action="toggle-setting" data-id="sciNotation" ${tt('Zahlenformat', 'Wissenschaftliche Schreibweise (1.5e9) statt Kürzel (1.50 B).')}>${getSetting('sciNotation') ? getIcon('check') : ''} 1e9-Notation</button>
        </div>
        <div class="toggle-row" style="margin-top:10px">
          <button class="btn sm" data-action="export-save" ${tt('Export', 'Kopiert den Spielstand als Text in die Zwischenablage.')}>Export</button>
          <button class="btn sm" data-action="import-save" ${tt('Import', 'Spielstand aus der Zwischenablage / Eingabe laden.')}>Import</button>
          <button class="btn danger sm" data-action="hard-reset" ${tt('Alles löschen', 'Kompletter Neustart. Kann nicht rückgängig gemacht werden.')}>Alles löschen</button>
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Hall of Fame</div><h3>${getIcon('trophy')} Leaderboard</h3><div class="sub">Sortiert nach Refactors, dann Code.</div></div><button class="btn sm" data-action="refresh-lb">Aktualisieren</button></div>
      ${renderLeaderboard()}
    </section>
  `;
}

// ═══════════════════════════ ADMIN ═══════════════════════════
export function collectAdminSaveEdits() {
  if (!adminSelectedUser) return null;
  let save = {};
  try { save = JSON.parse(adminSelectedUser.game_save || '{}'); } catch (e) { /* ignore */ }
  save.resources = save.resources || {};
  for (const r of RESOURCES) { const el = document.getElementById(`admin-ed-res-${r}`); if (el) save.resources[r] = Number(el.value) || 0; }
  save.buildings = save.buildings || {};
  for (const bd of BUILDINGS) { const el = document.getElementById(`admin-ed-bld-${bd.id}`); if (el) save.buildings[bd.id] = Math.max(0, Math.floor(Number(el.value) || 0)); }
  save.stats = save.stats || {};
  for (const f of ['lifetime', 'prestigeCount', 'projectsBuilt', 'expeditionsDone', 'manualClicks', 'fleetXP', 'fleetLevel']) { const el = document.getElementById(`admin-ed-stat-${f}`); if (el) save.stats[f] = Number(el.value) || 0; }
  save.techs = TECHS.filter(t => document.getElementById(`admin-ed-tech-${t.id}`)?.checked).map(t => t.id);
  save.projects = PROJECTS.filter(p => document.getElementById(`admin-ed-proj-${p.id}`)?.checked).map(p => p.id);
  save.artifacts = ARTIFACTS.filter(a => document.getElementById(`admin-ed-art-${a.id}`)?.checked).map(a => a.id);
  const chronicle = document.getElementById('admin-ed-chronicle'); if (chronicle) save.chronicle = Math.max(0, Math.floor(Number(chronicle.value) || 0));
  const mfSlots = document.getElementById('admin-ed-mainframeSlots'); if (mfSlots) save.mainframeSlots = Math.max(1, Math.floor(Number(mfSlots.value) || 3));
  if (save.stats) save.stats.lastSave = Date.now();
  return JSON.stringify(save);
}

function renderAdminUserEditor(user) {
  let save = {};
  try { save = JSON.parse(user.game_save || '{}'); } catch (e) { /* ignore */ }
  const resources = save.resources || {}, buildings = save.buildings || {}, stats = save.stats || {};
  const techs = save.techs || [], projects = save.projects || [], artifacts = save.artifacts || [];
  const input = (id, val, extra = '') => `<input id="${id}" class="input" type="number" value="${val}" min="0" ${extra} />`;
  return `<div class="stack" style="margin-top:12px">
    <p class="muted small">Bearbeite <strong>${escapeHtml(user.username)}</strong> – registriert ${escapeHtml(String(user.created_at || '—'))}</p>
    <div class="admin-editor-section"><div class="eyebrow">Account</div><div class="admin-editor-grid">
      <label class="lbl">Prestige-Score ${input('admin-editor-prestige', user.prestige_score, 'step="1"')}</label>
      <label class="lbl">Total Scrap ${input('admin-editor-scrap', user.total_scrap)}</label>
      <label class="lbl">Flag-Grund <input id="admin-editor-flag-reason" class="input" type="text" value="${escapeHtml(user.flag_reason || '')}" /></label>
      <label class="lbl" style="flex-direction:row;align-items:center;gap:8px"><input id="admin-editor-flagged" type="checkbox" ${user.flagged ? 'checked' : ''} /> Geflaggt</label>
      <label class="lbl">Neues Passwort (leer = unverändert) <input id="admin-editor-new-password" class="input" type="password" autocomplete="new-password" /></label>
    </div></div>
    <div class="admin-editor-section"><div class="eyebrow">Ressourcen</div><div class="admin-editor-grid">${RESOURCES.map(r => `<label class="lbl">${escapeHtml(RESOURCE_LABELS[r])} ${input(`admin-ed-res-${r}`, resources[r] ?? 0)}</label>`).join('')}</div></div>
    <div class="admin-editor-section"><div class="eyebrow">Statistiken</div><div class="admin-editor-grid">
      ${[['lifetime', 'Spielzeit (s)'], ['prestigeCount', 'Prestige'], ['projectsBuilt', 'Releases'], ['expeditionsDone', 'Aufträge'], ['manualClicks', 'Klicks'], ['fleetXP', 'Agentur-XP'], ['fleetLevel', 'Agentur-Level']].map(([f, l]) => `<label class="lbl">${l} ${input(`admin-ed-stat-${f}`, stats[f] ?? 0)}</label>`).join('')}
      <label class="lbl">Chronicle-XP ${input('admin-ed-chronicle', save.chronicle ?? 0)}</label>
      <label class="lbl">Mainframe-Slots ${input('admin-ed-mainframeSlots', save.mainframeSlots ?? 3, 'min="1"')}</label>
    </div></div>
    <div class="admin-editor-section"><div class="eyebrow">Gebäude</div><div class="admin-editor-grid">${BUILDINGS.map(bd => `<label class="lbl">${escapeHtml(bd.name)} ${input(`admin-ed-bld-${bd.id}`, buildings[bd.id] ?? 0, 'step="1"')}</label>`).join('')}</div></div>
    <div class="admin-editor-section"><div class="eyebrow">Technologien</div><div class="admin-editor-checks">${TECHS.map(t => `<label><input type="checkbox" id="admin-ed-tech-${t.id}" ${techs.includes(t.id) ? 'checked' : ''} /> ${escapeHtml(t.name)}</label>`).join('')}</div></div>
    <div class="admin-editor-section"><div class="eyebrow">Releases</div><div class="admin-editor-checks">${PROJECTS.map(p => `<label><input type="checkbox" id="admin-ed-proj-${p.id}" ${projects.includes(p.id) ? 'checked' : ''} /> ${escapeHtml(p.name)}</label>`).join('')}</div></div>
    <div class="admin-editor-section"><div class="eyebrow">Funde</div><div class="admin-editor-checks">${ARTIFACTS.map(a => `<label><input type="checkbox" id="admin-ed-art-${a.id}" ${artifacts.includes(a.id) ? 'checked' : ''} /> ${escapeHtml(a.name)}</label>`).join('')}</div></div>
    <div class="toggle-row" style="position:sticky;bottom:0;background:var(--surface);padding:10px 0"><button class="btn primary" data-action="admin-save-user-data" data-username="${escapeHtml(user.username)}">Speichern</button><button class="btn" data-action="admin-clear-editor">Schließen</button></div>
  </div>`;
}

function renderAdmin() {
  const rows = adminUsers;
  return `
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Moderation</div><h3>${getIcon('shield')} Geflaggte Accounts</h3><div class="sub">Geflaggte User sind aus dem Leaderboard ausgeblendet.</div></div><button class="btn sm" data-action="admin-refresh">Aktualisieren</button></div>
      <div class="stack">${rows.length ? rows.map(u => `<div class="admin-user-row"><div class="admin-user-info"><strong>${escapeHtml(u.username)}</strong><span class="muted">Prestige ${u.prestige_score} · Scrap ${fmt(u.total_scrap)}</span><span class="bad small">${escapeHtml(u.flag_reason || '—')}</span></div><div class="admin-user-actions"><button class="btn xs" data-action="admin-unflag" data-username="${escapeHtml(u.username)}">Entflaggen</button><button class="btn xs danger" data-action="admin-ban" data-username="${escapeHtml(u.username)}">Neu flaggen</button><button class="btn xs" data-action="admin-rename-user" data-username="${escapeHtml(u.username)}">Umbenennen</button><button class="btn xs danger" data-action="admin-delete-user" data-username="${escapeHtml(u.username)}">Löschen</button></div></div>`).join('') : '<p class="muted small">Keine geflaggten User.</p>'}</div>
    </section>
    <div class="grid-3">
      <section class="panel"><div class="eyebrow">Flaggen</div><div class="admin-form" style="margin-top:8px"><input id="admin-flag-username" class="input" placeholder="Username" /><input id="admin-flag-reason" class="input" placeholder="Grund" /><button class="btn danger sm" data-action="admin-flag-submit">Flaggen</button></div></section>
      <section class="panel"><div class="eyebrow">Umbenennen</div><div class="admin-form" style="margin-top:8px"><input id="admin-rename-old-username" class="input" placeholder="Alter Name" /><input id="admin-rename-new-username" class="input" placeholder="Neuer Name" /><button class="btn sm" data-action="admin-rename-user">Umbenennen</button></div></section>
      <section class="panel"><div class="eyebrow">Löschen</div><div class="admin-form" style="margin-top:8px"><input id="admin-delete-username" class="input" placeholder="Username" /><button class="btn danger sm" data-action="admin-delete-user">Löschen</button></div></section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Editor</div><h3>${getIcon('settings')} Spielstand bearbeiten</h3></div></div>
      <div class="admin-form"><input id="admin-editor-username" class="input" placeholder="Username" /><button class="btn sm" data-action="admin-load-user">Laden</button></div>
      ${adminSelectedUser ? renderAdminUserEditor(adminSelectedUser) : ''}
    </section>
  `;
}

// ═══════════════════════════ CYBER EVENT ═══════════════════════════
function renderDecisionOverlay() {
  const def = currentDecisionDef();
  if (!def || !state.decision) return '';
  const remaining = Math.max(0, (state.decision.endsAt - Date.now()) / 1000);
  const total = Math.max(1, (state.decision.endsAt - state.decision.startedAt) / 1000);
  return `<div class="cyber-panel info decision">
    <div class="cyber-head"><span style="font-size:1.4rem">${def.icon}</span><strong>${escapeHtml(def.title)}</strong><span class="t" style="color:var(--muted)">${fmtSec(remaining)}</span></div>
    <div class="cyber-desc">${escapeHtml(def.text)}</div>
    <div class="progress thin"><span style="width:${(remaining / total) * 100}%"></span></div>
    <div class="stack" style="gap:6px">${def.options.map((o, i) => `<button class="btn ${i === 0 ? 'primary' : ''} block decision-opt" data-action="decide" data-index="${i}" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px"><span>${escapeHtml(o.label)}</span><span class="small" style="font-weight:500;opacity:0.8;white-space:normal;text-align:left">${escapeHtml(o.desc)}</span></button>`).join('')}</div>
  </div>`;
}

export function renderCyberEventOverlay() {
  const ce = state.cyberEvent;
  if (!ce) return renderDecisionOverlay();
  const remaining = Math.max(0, (ce.endsAt - Date.now()) / 1000);
  const pct = ce.type === 'interactive'
    ? Math.min(100, ((ce.clicksDone || 0) / ce.clicksRequired) * 100)
    : Math.min(100, (1 - remaining / ((ce.endsAt - ce.startedAt) / 1000)) * 100);
  return `<div class="cyber-panel ${ce.color}">
    <div class="cyber-head"><span style="font-size:1.4rem">${ce.icon || '⚡'}</span><strong>${escapeHtml(ce.name)}</strong><span class="t">${fmtSec(remaining)}</span></div>
    <div class="cyber-desc">${escapeHtml(ce.desc)}</div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    ${ce.type === 'interactive' ? `<button class="btn primary block cyber-btn" data-action="cyber-event-click">${ce.icon || '⚡'} Patch deployen (${ce.clicksDone || 0}/${ce.clicksRequired})</button>` : '<div class="muted small" style="text-align:center">Wird automatisch aktiv…</div>'}
  </div>`;
}

// ═══════════════════════════ DISPATCH ═══════════════════════════
export function renderTabContent() {
  switch (state.selectedTab) {
    case 'buildings': return renderBuildings();
    case 'research': return renderResearch();
    case 'projects': return renderProjects();
    case 'expansion': return renderExpansion();
    case 'market': return renderMarket();
    case 'prestige': return renderPrestige();
    case 'codex': return renderCodex();
    case 'account': return renderAccount();
    case 'admin': return renderAdmin();
    case 'overview':
    default: return renderOverview();
  }
}
