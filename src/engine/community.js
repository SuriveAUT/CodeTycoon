// community.js – Open-Source-Projekt auf Client-Seite: Paketkosten, Bezahlen mit Pending-Eintrag (bis der Server
// bestätigt oder ablehnt), Erstattung und das Übernehmen des Serverstands (Bonus, Abzeichen, Meilenstein-Boosts).
// Ohne API-Aufrufe – die macht App.jsx (syncCommunity), damit die Engine auch in der Simulation läuft.
// Kontingent, Projektfortschritt und Belohnungsansprüche führt der Server (backend/lib/community.js).
import { state, setState, canAfford, spend, log } from '../store/gameState.js';
import { currentRates } from '../store/bonuses.js';
import { LAB_MIN_COST, LAB_MAX_STOCK_SHARE } from '../data/lab.js';
import { PACKAGE_MINUTES, COMMUNITY_MAX_PENDING, COMMUNITY_MAX_CLAIMED, MILESTONE_BOOST, getPackageType } from '../data/community.js';
import { setBoost } from './daily.js';

// Kosten eines Pakets: 15 min Bruttoproduktion der Ressource, höchstens die Hälfte des Vorrats, mindestens 100
// (wie beim Labor). null, solange die Ressource nicht produziert wird.
export function packageCost(type, s = state) {
  const def = getPackageType(type);
  if (!def) return null;
  const produced = currentRates(s).__produced?.[def.res] || 0;
  if (!(produced > 0)) return null;
  const byProduction = produced * PACKAGE_MINUTES * 60;
  return { [def.res]: Math.ceil(Math.max(LAB_MIN_COST, Math.min((s.resources[def.res] || 0) * LAB_MAX_STOCK_SHARE, byProduction))) };
}

export function pendingContributions(s = state) { return s.community?.pending || []; }

// Freies Kontingent laut letztem Serverstand, abzüglich bezahlter, noch unbestätigter Pakete
export function freeQuota(server, s = state) {
  return Math.max(0, (server?.me?.quota ?? 0) - pendingContributions(s).length);
}

// Warum gerade kein Beitrag möglich ist (null = möglich)
export function contributionBlock(type, server, s = state) {
  if (!server?.project) return 'Community gerade nicht erreichbar.';
  if (!server.me) return 'Nur mit Account.';
  if (pendingContributions(s).length >= COMMUNITY_MAX_PENDING) return 'Zu viele offene Buchungen.';
  if (freeQuota(server, s) < 1) return 'Kein Paket-Kontingent frei.';
  const cost = packageCost(type, s);
  if (!cost) return 'Diese Ressource produzierst du noch nicht.';
  if (!canAfford(cost)) return 'Nicht genug Vorrat.';
  return null;
}

// Paket bezahlen und als unbestätigt merken; App.jsx sendet es (auch wiederholt) mit derselben requestId
export function beginContribution(type, projectId, requestId, now = Date.now()) {
  const cost = packageCost(type);
  if (!cost || !canAfford(cost)) return null;
  spend(cost);
  const entry = { requestId, projectId, type, cost, at: now };
  setState('community', 'pending', [...pendingContributions(), entry]);
  return entry;
}

// Erstattung direkt auf den Vorrat – zählt nicht als Produktion (stats.total)
function refundCost(cost) {
  Object.entries(cost || {}).forEach(([res, amt]) => { if (amt > 0) setState('resources', res, (state.resources[res] || 0) + amt); });
}

// Antwort des Servers: 'booked' (gebucht, auch als Wiederholung) oder 'refund' (abgelehnt → Kosten zurück)
export function settleContribution(requestId, outcome) {
  const entry = pendingContributions().find(p => p.requestId === requestId);
  if (!entry) return false;
  setState('community', 'pending', pendingContributions().filter(p => p.requestId !== requestId));
  const name = getPackageType(entry.type)?.name || 'Paket';
  if (outcome === 'refund') {
    refundCost(entry.cost);
    log(`Community: ${name} nicht gebucht, Kosten erstattet.`);
  } else {
    setState('community', 'packagesTotal', (state.community.packagesTotal || 0) + 1);
    setState('community', 'contributor', true);
    log(`🧩 Community: ${name} zum Open-Source-Projekt beigetragen.`);
  }
  return true;
}

// Serverstand übernehmen: fertige Projekte (Bonus), Beteiligung, Abzeichen; neue Meilenstein-Belohnungen einmalig
// als Boost einreihen. Gibt die neuen Belohnungs-IDs zurück (für Toasts).
export function applyCommunityState(server) {
  if (!server) return [];
  if (Number.isInteger(server.projectsDone) && server.projectsDone >= 0) setState('community', 'projectsDone', server.projectsDone);
  const me = server.me;
  if (!me) return [];
  if (me.contributor === true) setState('community', 'contributor', true);
  setState('community', 'packagesTotal', Math.max(state.community.packagesTotal || 0, Math.floor(me.packagesTotal) || 0));
  setState('community', 'badges', Math.max(0, Math.floor(me.badges) || 0));
  const claimed = new Set(state.community.claimed || []);
  const fresh = [...new Set((Array.isArray(me.rewards) ? me.rewards : []).filter(id => typeof id === 'string' && id.length <= 24 && !claimed.has(id)))];
  fresh.forEach(() => setBoost({ name: MILESTONE_BOOST.name, effects: { ...MILESTONE_BOOST.effects }, duration: MILESTONE_BOOST.duration }));
  if (fresh.length) {
    setState('community', 'claimed', [...(state.community.claimed || []), ...fresh].slice(-COMMUNITY_MAX_CLAIMED));
    log(`🧩 Community-Schub: ${fresh.length} Meilenstein${fresh.length > 1 ? 'e' : ''} im Open-Source-Projekt erreicht.`);
  }
  return fresh;
}

// Anfrage-ID für eine Buchung (32 Zeichen, vom Server als Idempotenzschlüssel genutzt)
export function newRequestId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
}
