// decisions.js – Entscheidungs-Ereignisse (Wahl mit Konsequenzen).
import { state, setState, add, log } from '../store/gameState.js';
import { DECISIONS } from '../data/decisions.js';
import { rand, fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';
import { RESOURCE_LABELS } from '../data/misc.js';

const DECISION_TIMEOUT_MS = 90 * 1000;

export function spawnDecision(now = Date.now()) {
  if (state.decision || state.cyberEvent || state.event) return false;
  if ((state.techs?.length || 0) < 4) return false;
  const recent = state.lastDecisionId;
  const pool = DECISIONS.filter(d => d.id !== recent);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  setState('decision', { id: chosen.id, startedAt: now, endsAt: now + DECISION_TIMEOUT_MS });
  setState('nextDecisionAt', now + rand(8 * 60e3, 14 * 60e3));
  log(`❓ Entscheidung: ${chosen.title}.`);
  return true;
}

function applyOption(def, option, silent) {
  const rates = state.cache.rates || {};
  const produced = rates.__produced || {};
  const parts = [];
  if (option.cost) {
    const have = state.resources[option.cost.res] || 0;
    const loss = have * option.cost.fraction;
    setState('resources', option.cost.res, Math.max(0, have - loss));
    parts.push(`−${fmt(loss)} ${RESOURCE_LABELS[option.cost.res]}`);
  }
  if (option.grant) {
    const perSec = Math.max(0, produced[option.grant.res] || 0);
    const amount = Math.max(50, perSec * option.grant.minutes * 60);
    add(option.grant.res, amount);
    parts.push(`+${fmt(amount)} ${RESOURCE_LABELS[option.grant.res]}`);
  }
  if (option.event) {
    const duration = option.event.minutes * 60e3;
    setState('event', { name: option.event.name, desc: option.desc, duration, effects: option.event.effects });
    setState('eventEnds', Date.now() + duration);
    parts.push(`${option.event.name} (${option.event.minutes} min)`);
  }
  if (option.xp) {
    setState('chronicle', (state.chronicle || 0) + option.xp);
    parts.push(`+${option.xp} XP`);
  }
  if (!silent) {
    log(`${def.icon} ${def.title}: ${option.label}. ${parts.join(', ')}`);
    emitToast(`${option.label}: ${parts.join(', ') || 'ok'}`, option.event && Object.values(option.event.effects).some(v => v < 1) ? 'warn' : 'good');
  }
}

export function resolveDecision(index, silent = false) {
  const current = state.decision;
  if (!current) return false;
  const def = DECISIONS.find(d => d.id === current.id);
  setState('decision', null);
  setState('lastDecisionId', current.id);
  if (!def) return false;
  const option = def.options[index] ?? def.options[def.defaultIndex ?? 0];
  applyOption(def, option, silent);
  setState('stats', 'decisionsMade', (state.stats.decisionsMade || 0) + 1);
  return true;
}

export function tickDecisions(now, silent = false) {
  if (state.decision) {
    if (now >= state.decision.endsAt) {
      const def = DECISIONS.find(d => d.id === state.decision.id);
      resolveDecision(def?.defaultIndex ?? 0, silent);
    }
    return;
  }
  // Nur spawnen, wenn der Spieler zuschaut (nicht im Hintergrund-Tick)
  if (!silent && now >= (state.nextDecisionAt || 0)) spawnDecision(now);
}

export function currentDecisionDef() {
  return state.decision ? DECISIONS.find(d => d.id === state.decision.id) || null : null;
}
