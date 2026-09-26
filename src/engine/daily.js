// daily.js – Tages-Loop: Daily Standup (Login-Streak), drei Tages-Tickets und Kaffee (reift in Echtzeit).
import { state, setState, add, log } from '../store/gameState.js';
import { currentBonuses, currentRates } from '../store/bonuses.js';
import { QUESTS } from '../data/quests.js';
import { RESOURCE_LABELS } from '../data/misc.js';
import {
  dayKey, STREAK_CYCLE, STANDUP_MINUTES, STANDUP_WEEK_RELICS, STANDUP_WEEK_BOOST,
  COFFEE_INTERVAL_MS, COFFEE_MAX, COFFEE_USES, TICKETS_PER_DAY, TICKETS_ALL_DONE_BOOST, TICKET_COUNTERS, TICKET_POOL
} from '../data/daily.js';
import { STANDUP_LAB_SPEEDUP_MS, STANDUP_WEEK_LAB_SPEEDUP_MS, OVERTIME_LAB_SPEEDUP_MS } from '../data/lab.js';
import { speedUpLab } from './lab.js';
import { fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

// Deterministischer Zufall: Tickets sind pro Tag (und Reroll) reproduzierbar.
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

// Helfer für Ticket-Ziele und Belohnungen: Minuten aktueller Bruttoproduktion.
function ticketHelpers(s = state) {
  const rates = currentRates(s);
  const gross = (res) => Math.max(0, Number(rates.__produced?.[res] || 0));
  return {
    gross,
    minutes: (res, m, min) => Math.max(min, Math.floor(gross(res) * 60 * m)),
    questsLeft: Math.max(0, QUESTS.length - (s.questIndex || 0))
  };
}

export function rewardText(reward) {
  const parts = Object.entries(reward || {}).filter(([, v]) => v > 0).map(([res, amt]) => `+${fmt(amt)} ${RESOURCE_LABELS[res] || res}`);
  return parts.length ? ' ' + parts.join(', ') : '';
}

// Temporärer Boost (Tages-Bonus, Espresso, Retro-Bonus); nur einer gleichzeitig, ersetzt den laufenden.
export function setBoost(boost, now = Date.now()) {
  setState('boost', { name: boost.name, effects: { ...boost.effects }, endsAt: now + boost.duration });
}

function counterValue(key, s = state) { return TICKET_COUNTERS[key] ? TICKET_COUNTERS[key](s) : 0; }

export function ticketDef(id) { return TICKET_POOL.find(t => t.id === id); }

export function ticketProgress(ticket, s = state) {
  const def = ticketDef(ticket.id);
  if (!def) return [0, ticket.target || 1];
  return [Math.max(0, counterValue(def.counter, s) - (ticket.base || 0)), ticket.target || 1];
}

export function ticketLabel(ticket) {
  const def = ticketDef(ticket.id);
  return def ? def.label(ticket.target, fmt) : ticket.id;
}

// Würfelt `count` Tickets; `exclude` = IDs, die möglichst nicht wieder vorkommen sollen.
function rollTickets(day, rerolls, count, exclude = []) {
  const b = currentBonuses();
  const h = ticketHelpers();
  const rnd = mulberry32(day * 31 + rerolls * 7 + 1);
  const available = TICKET_POOL.filter(t => !t.available || t.available(state, b, h));
  let pool = available.filter(t => !exclude.includes(t.id));
  if (pool.length < count) pool = available.filter(t => !state.daily.tickets.some(x => x.done && x.id === t.id));
  const chosen = [];
  while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return chosen.map(def => ({
    id: def.id,
    target: Math.max(1, Math.floor(def.target(state, b, h))),
    reward: def.reward(h),
    base: counterValue(def.counter),
    done: false
  }));
}

function newDayTickets(day, silent) {
  setState('daily', 'tickets', rollTickets(day, 0, TICKETS_PER_DAY));
  setState('daily', 'ticketsDay', day);
  setState('daily', 'rerolls', 0);
  if (!silent) { log('📋 Neue Tages-Tickets liegen im Büro.'); emitToast('Neue Tages-Tickets im Büro', 'info'); }
}

// Der Tages-Loop öffnet mit der ersten Technologie, damit das Onboarding (Klicken → Praktikant → …) sauber bleibt.
export function dailyUnlocked(s = state) {
  return s.techs.length >= 1 || (s.stats.prestigeCount || 0) > 0 || (s.daily.claimsTotal || 0) > 0;
}

// Läuft 1×/s aus processTick (auch im Offline-Catchup – alles hier ist idempotent).
export function tickDaily(now, silent) {
  if (!dailyUnlocked()) return;
  const today = dayKey(now);
  if (state.daily.ticketsDay !== today) newDayTickets(today, silent);

  // Kaffee reift in Echtzeit, auch offline
  const c = state.coffee;
  if (c.beans < COFFEE_MAX) {
    let beans = c.beans;
    let next = c.nextBeanAt || now + COFFEE_INTERVAL_MS;
    let guard = 0;
    while (beans < COFFEE_MAX && next <= now && guard++ < COFFEE_MAX) { beans++; next += COFFEE_INTERVAL_MS; }
    if (beans !== c.beans || next !== c.nextBeanAt) {
      setState('coffee', { ...c, beans, nextBeanAt: beans >= COFFEE_MAX ? 0 : next });
      if (beans > c.beans && !silent) emitToast('☕ Frischer Kaffee ist fertig.', 'info');
    }
  }

  // Ticket-Fortschritt prüfen, Belohnung sofort gutschreiben
  let anyDone = false;
  state.daily.tickets.forEach((t, i) => {
    if (t.done) return;
    const [cur, target] = ticketProgress(t);
    if (cur < target) return;
    setState('daily', 'tickets', i, 'done', true);
    setState('daily', 'ticketsDone', (state.daily.ticketsDone || 0) + 1);
    Object.entries(t.reward || {}).forEach(([res, amt]) => { if (amt > 0) add(res, amt); });
    anyDone = true;
    const txt = rewardText(t.reward);
    log(`✅ Ticket erledigt: ${ticketLabel(t)}.${txt}`);
    if (!silent) emitToast(`Ticket erledigt${txt}`, 'good');
  });
  const tickets = state.daily.tickets;
  if (anyDone && tickets.length >= TICKETS_PER_DAY && tickets.every(t => t.done) && state.daily.allDoneDay !== today) {
    setState('daily', 'allDoneDay', today);
    setBoost(TICKETS_ALL_DONE_BOOST, now);
    log(`🏁 Alle Tickets erledigt: ${TICKETS_ALL_DONE_BOOST.name} ×1,5 für 30 min.`);
    if (!silent) emitToast('Alle Tickets erledigt: Tages-Bonus ×1,5 für 30 min', 'good');
  }
}

// ── Daily Standup ──
export function canClaimStandup(s = state, now = Date.now()) {
  return s.daily.lastClaimDay !== dayKey(now);
}

// Streak, die der nächste Claim ergibt (heute schon geholt → aktuelle Streak).
export function nextStreak(s = state, now = Date.now()) {
  const today = dayKey(now);
  if (s.daily.lastClaimDay === today) return s.daily.streak;
  return s.daily.lastClaimDay === today - 1 ? s.daily.streak + 1 : 1;
}

export function standupReward(s = state, now = Date.now()) {
  const streak = nextStreak(s, now);
  const dayIdx = (Math.max(1, streak) - 1) % STREAK_CYCLE;
  const m = STANDUP_MINUTES[dayIdx];
  const h = ticketHelpers(s);
  const reward = { scrap: h.minutes('scrap', m, 50 * m), energy: h.minutes('energy', m, 10 * m) };
  if (h.gross('research') > 0) reward.research = h.minutes('research', m, 0);
  const week = dayIdx === STREAK_CYCLE - 1;
  if (week) reward.relics = STANDUP_WEEK_RELICS * Math.min(10, Math.ceil(streak / STREAK_CYCLE));
  return { streak, dayIdx, minutes: m, reward, week };
}

export function claimStandup(now = Date.now()) {
  if (!canClaimStandup(state, now)) return null;
  const info = standupReward(state, now);
  Object.entries(info.reward).forEach(([res, amt]) => { if (amt > 0) add(res, amt); });
  if (info.week) setBoost(STANDUP_WEEK_BOOST, now);
  // Der Standup bringt auch das Labor voran
  info.labSped = speedUpLab(info.week ? STANDUP_WEEK_LAB_SPEEDUP_MS : STANDUP_LAB_SPEEDUP_MS);
  setState('daily', 'lastClaimDay', dayKey(now));
  setState('daily', 'streak', info.streak);
  setState('daily', 'bestStreak', Math.max(state.daily.bestStreak || 0, info.streak));
  setState('daily', 'claimsTotal', (state.daily.claimsTotal || 0) + 1);
  log(`☀️ Daily Standup, Tag ${info.streak}:${rewardText(info.reward)}${info.week ? ` + ${STANDUP_WEEK_BOOST.name} ×2 für 15 min` : ''}.`);
  return info;
}

// ── Kaffee ──
export function coffeeUseAvailable(id, s = state) {
  if ((s.coffee.beans || 0) <= 0) return false;
  if (id === 'crunch') return s.expeditions.length > 0;
  if (id === 'reroll') return s.daily.tickets.some(t => !t.done);
  if (id === 'overtime') return (s.lab?.running || []).length > 0;
  return true;
}

export function useCoffee(id, now = Date.now()) {
  const use = COFFEE_USES.find(u => u.id === id);
  if (!use) return { ok: false, text: 'Unbekannte Kaffee-Sorte.' };
  if ((state.coffee.beans || 0) <= 0) return { ok: false, text: 'Kein Kaffee da – die nächste Bohne braucht Zeit.' };
  let text;
  if (id === 'espresso') {
    setBoost(use.boost, now);
    text = 'Espresso: ×2 Produktion für 20 Minuten.';
  } else if (id === 'crunch') {
    const running = state.expeditions.length;
    if (!running) return { ok: false, text: 'Gerade läuft kein Auftrag.' };
    setState('expeditions', state.expeditions.map(m => ({ ...m, end: now })));
    text = `Crunch: ${running} Auftr${running > 1 ? 'äge' : 'ag'} sofort fertig.`;
  } else if (id === 'overtime') {
    const sped = speedUpLab(OVERTIME_LAB_SPEEDUP_MS);
    if (!sped) return { ok: false, text: 'Im Labor läuft gerade nichts.' };
    text = `Überstunden: ${sped} Labor-Projekt${sped > 1 ? 'e' : ''} 3 Stunden schneller.`;
  } else {
    const keep = state.daily.tickets.filter(t => t.done);
    const open = state.daily.tickets.filter(t => !t.done);
    if (!open.length) return { ok: false, text: 'Alle Tickets sind schon erledigt.' };
    const rerolls = (state.daily.rerolls || 0) + 1;
    setState('daily', 'tickets', [...keep, ...rollTickets(state.daily.ticketsDay, rerolls, TICKETS_PER_DAY - keep.length, state.daily.tickets.map(t => t.id))]);
    setState('daily', 'rerolls', rerolls);
    text = 'Neue Tickets gewürfelt.';
  }
  setState('coffee', {
    beans: state.coffee.beans - 1,
    nextBeanAt: state.coffee.nextBeanAt || now + COFFEE_INTERVAL_MS,
    used: (state.coffee.used || 0) + 1
  });
  log(`☕ ${text}`);
  return { ok: true, text };
}
