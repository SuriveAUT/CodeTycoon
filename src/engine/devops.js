// devops.js – Regeln der Automatisierung, jede über ein einmaliges Laborprojekt freigeschaltet (data/devops.js):
//   Sparziel      ein Release oder eine Tech; hält die Kosten zurück, sobald das Ziel in 30 min erreichbar ist,
//                 und kauft es, sobald es bezahlbar ist (auch offline, unabhängig von den Schaltern)
//   Reserven      je Ressource ein Mindestvorrat in Minuten Bruttoproduktion, den automatische Käufe nie antasten
//   Auftrags-Fokus  wonach Auto-Freelance Aufträge wählt
//   Profile       zwei gespeicherte Einstellungssätze (Schalter, Reserven, Fokus, Arbeitsmodus, Drossel)
// Manuelle Käufe sind nie betroffen. Keine API- und DOM-Zugriffe: läuft auch in der Balancing-Simulation.
import { state, setState, log, getTech, isProjectUnlocked, isTechUnlocked } from '../store/gameState.js';
import { currentRates, currentBonuses } from '../store/bonuses.js';
import { PROJECTS } from '../data/projects.js';
import { RESOURCES, RESOURCE_LABELS } from '../data/misc.js';
import { DEVOPS_RULES, RESERVE_MINUTES, MISSION_FOCI, SAVE_HORIZON_MIN, PROFILE_NAMES } from '../data/devops.js';
import { nextProjectCost, nextResearchCost, purchaseProject, purchaseTech, setOperationsMode } from './actions.js';
import { getDynamicMissionRewards, missionSuccessChance } from './events.js';
import { emitToast } from '../lib/toast.js';

const FAIL_REWARD_SHARE = 0.55;   // wie completeMission: ein gescheiterter Auftrag bringt 55 %

export function devopsUnlocked(rule, s = state) {
  return (s.lab?.done || []).includes(DEVOPS_RULES[rule]);
}

// ── Reserven ──

// Mindestvorrat, den automatische Käufe liegen lassen (0 ohne Regel)
export function reserveAmount(res, s = state) {
  if (!devopsUnlocked('reserves', s)) return 0;
  const minutes = s.devops?.reserves?.[res] || 0;
  if (!minutes) return 0;
  return Math.max(0, currentRates(s).__produced?.[res] || 0) * minutes * 60;
}

export function setReserve(res, minutes) {
  if (!devopsUnlocked('reserves') || !RESOURCES.includes(res) || !RESERVE_MINUTES.includes(minutes)) return false;
  setState('devops', 'reserves', res, minutes);
  return true;
}

// ── Sparziel ──

export function targetInfo(s = state) {
  const t = s.devops?.target;
  if (!t) return null;
  const def = t.kind === 'project' ? PROJECTS.find(p => p.id === t.id) : t.kind === 'tech' ? getTech(t.id) : null;
  if (!def || def.manual) return null;
  return { kind: t.kind, id: t.id, def, name: def.name };
}

// Status des Sparziels:
//   none    kein (gültiges) Ziel oder Regel gesperrt
//   done    schon im Besitz (wird beim nächsten Automationsschritt gelöscht)
//   locked  noch nicht freigeschaltet – pausiert, hält nichts zurück
//   growing zu weit weg (> SAVE_HORIZON_MIN bei aktueller Nettoproduktion) – die Firma wächst normal weiter
//   saving  in Reichweite – automatische Käufe lassen die Kosten liegen
//   ready   bezahlbar (Kosten + Reserven) – wird gekauft
// rows: je Kostenressource Vorrat, Kosten, Reserve, Fehlbetrag, Nettoproduktion/s und Restzeit (s)
export function targetState(s = state, b = currentBonuses(s)) {
  const info = targetInfo(s);
  if (!info || !devopsUnlocked('target', s)) return { status: 'none', info };
  const owned = info.kind === 'project' ? (s.projects || []).includes(info.id) : (s.techs || []).includes(info.id);
  if (owned) return { status: 'done', info };
  const unlocked = info.kind === 'project' ? isProjectUnlocked(info.def) : isTechUnlocked(info.def);
  if (!unlocked) return { status: 'locked', info };
  const cost = info.kind === 'project' ? nextProjectCost(info.def, b) : { research: nextResearchCost(info.def, b) };
  const rates = currentRates(s);
  const rows = Object.entries(cost).map(([res, amt]) => {
    const have = s.resources[res] || 0;
    const reserve = reserveAmount(res, s);
    const missing = Math.max(0, amt + reserve - have);
    const net = rates[res] || 0;
    return { res, cost: amt, have, reserve, missing, net, eta: missing <= 0 ? 0 : net > 0 ? missing / net : Infinity };
  });
  const eta = Math.max(0, ...rows.map(r => r.eta));
  const status = rows.every(r => r.missing <= 0) ? 'ready' : eta <= SAVE_HORIZON_MIN * 60 ? 'saving' : 'growing';
  return { status, info, cost, rows, eta };
}

// Ziel wählbar: Regel frei, Release (nicht der manuelle Börsengang) oder Tech, noch nicht im Besitz
export function canTarget(kind, id, s = state) {
  if (!devopsUnlocked('target', s)) return false;
  if (kind === 'project') { const p = PROJECTS.find(x => x.id === id); return !!p && !p.manual && !(s.projects || []).includes(id); }
  if (kind === 'tech') return !!getTech(id) && !(s.techs || []).includes(id);
  return false;
}

export function isTarget(kind, id, s = state) {
  const t = s.devops?.target;
  return !!t && t.kind === kind && t.id === id;
}

// Ziel setzen; dasselbe Ziel nochmal → löschen
export function setTarget(kind, id) {
  if (!canTarget(kind, id)) return false;
  if (isTarget(kind, id)) return clearTarget();
  setState('devops', 'target', { kind, id });
  log(`🎯 Sparziel: ${targetInfo()?.name || id}.`);
  return true;
}

export function clearTarget() {
  if (!state.devops?.target) return false;
  const name = targetInfo()?.name;
  setState('devops', 'target', null);
  log(`🎯 Sparziel entfernt${name ? `: ${name}` : ''}.`);
  return true;
}

// Haltebeträge automatischer Käufe: Reserven plus – sobald das Ziel in Reichweite ist – seine Kosten
export function autoHolds(s = state, b = currentBonuses(s)) {
  const holds = {};
  if (devopsUnlocked('reserves', s)) {
    RESOURCES.forEach(res => { const r = reserveAmount(res, s); if (r > 0) holds[res] = r; });
  }
  const ts = targetState(s, b);
  if (ts.status === 'saving' || ts.status === 'ready') {
    Object.entries(ts.cost).forEach(([res, amt]) => { holds[res] = (holds[res] || 0) + amt; });
  }
  return holds;
}

// Automatischer Kauf nur aus dem Vorrat oberhalb der Haltebeträge
export function canAffordAuto(cost, holds) {
  for (const [res, amt] of Object.entries(cost || {})) {
    if ((state.resources[res] || 0) - (holds?.[res] || 0) < amt) return false;
  }
  return true;
}

// Erster Schritt jedes Automationsdurchgangs (tick.js): erledigtes Ziel löschen, bezahlbares kaufen.
// Unabhängig von den Schaltern, aber nicht während eines Sprints ohne Automatisierung.
export function pursueTarget(b = currentBonuses(), silent = false) {
  if (b.challengeNoAuto) return false;
  const ts = targetState(state, b);
  if (ts.status === 'done') {
    setState('devops', 'target', null);
    log(`🎯 Sparziel erledigt: ${ts.info.name}.`);
    return false;
  }
  if (ts.status !== 'ready') return false;
  const ok = ts.info.kind === 'project' ? purchaseProject(ts.info.id, { quiet: true }) : purchaseTech(ts.info.id, { quiet: true });
  if (!ok) return false;
  setState('devops', 'target', null);
  log(`🎯 Sparziel erreicht: ${ts.info.name} ${ts.info.kind === 'project' ? 'veröffentlicht' : 'gelernt'}.`);
  if (!silent) emitToast(`Sparziel erreicht: ${ts.info.name}`, 'good');
  return true;
}

// ── Auftrags-Fokus ──

export function setMissionFocus(id) {
  if (!devopsUnlocked('missionFocus') || !MISSION_FOCI.some(m => m.id === id)) return false;
  setState('devops', 'missionFocus', id);
  return true;
}

function missionHours(m, b) { return Math.max(30, m.duration / (b.expeditionSpeed || 1)) / 3600; }

// Auftrag aus den startbaren Kandidaten: stärkster (bisher), kürzester/längster oder der mit dem höchsten
// erwarteten Ertrag der Ressource pro Stunde (inklusive Erfolgschance); ohne Ertrag der Ressource → stärkster
export function pickMission(candidates, focus, b, rates) {
  if (!candidates.length) return null;
  const strongest = () => [...candidates].sort((a, z) => z.power - a.power)[0];
  if (focus === 'short') return [...candidates].sort((a, z) => missionHours(a, b) - missionHours(z, b) || z.power - a.power)[0];
  if (focus === 'long') return [...candidates].sort((a, z) => missionHours(z, b) - missionHours(a, b) || z.power - a.power)[0];
  const res = MISSION_FOCI.find(f => f.id === focus)?.res;
  if (!res) return strongest();
  let best = null;
  let bestScore = 0;
  for (const m of candidates) {
    const reward = getDynamicMissionRewards(m, b, rates)[res] || 0;
    if (reward <= 0) continue;
    const p = missionSuccessChance(m, b);
    const score = reward * (p + (1 - p) * FAIL_REWARD_SHARE) / missionHours(m, b);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return best || strongest();
}

export function currentMissionFocus(s = state) {
  return devopsUnlocked('missionFocus', s) ? (s.devops?.missionFocus || 'power') : 'power';
}

// ── Profile ──

// Der Live-Stand ist das aktive Profil
export function liveProfile(s = state) {
  return {
    auto: { ...s.auto },
    reserves: { ...(s.devops?.reserves || {}) },
    missionFocus: s.devops?.missionFocus || 'power',
    operationsMode: s.operationsMode,
    converterThrottle: s.converterThrottle
  };
}

// Wechsel: Live-Stand ins aktive Profil sichern, das andere laden. Ein noch leeres Profil startet als Kopie.
export function switchProfile(index) {
  if (!devopsUnlocked('profiles') || (index !== 0 && index !== 1) || index === state.devops.profile) return false;
  const current = liveProfile();
  const next = state.devops.profiles[index] || current;
  const profiles = [null, null];
  profiles[state.devops.profile] = current;
  setState('devops', 'profiles', profiles);
  setState('auto', { ...next.auto });
  if (devopsUnlocked('reserves')) setState('devops', 'reserves', { ...next.reserves });
  if (devopsUnlocked('missionFocus')) setState('devops', 'missionFocus', next.missionFocus);
  if (next.operationsMode !== state.operationsMode) setOperationsMode(next.operationsMode);
  setState('converterThrottle', next.converterThrottle);
  setState('devops', 'profile', index);
  log(`⚙️ DevOps-Profil „${PROFILE_NAMES[index]}“ aktiv.`);
  return true;
}

// Lesbare Kosten-/Fehlbetragsangabe für Logs und Tooltips
export function targetShortfall(ts) {
  return (ts.rows || []).filter(r => r.missing > 0).map(r => `${RESOURCE_LABELS[r.res] || r.res}`).join(', ');
}
