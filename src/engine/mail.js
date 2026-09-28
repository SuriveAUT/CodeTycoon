// mail.js – Story-Postfach (data/mails.js): Mails zustellen, lesen, beantworten. Zustellung in runProgressChecks.
import { state, setState, add, log } from '../store/gameState.js';
import { currentRates } from '../store/bonuses.js';
import { MAILS, MAIL_SENDERS, getMail } from '../data/mails.js';
import { RESOURCE_LABELS } from '../data/misc.js';
import { COFFEE_MAX } from '../data/daily.js';
import { setBoost } from './daily.js';
import { speedUpLab } from './lab.js';
import { fmt } from '../lib/format.js';
import { emitToast } from '../lib/toast.js';

export function mailInbox(s = state) { return s.mail?.inbox || []; }
export function mailUnread(s = state) { return mailInbox(s).filter(m => !m.read).length; }
export function mailOpenDecisions(s = state) {
  return mailInbox(s).filter(m => m.choice === null && getMail(m.id)?.choices?.length).length;
}

// Läuft in runProgressChecks: fällige Mails zustellen. Beim ersten Durchlauf mit einem schon fortgeschrittenen
// Spielstand landet alles bereits Erreichte still und gelesen im Archiv, statt das Postfach zu fluten.
export function checkMail(silent = false, now = Date.now()) {
  const inbox = mailInbox();
  const have = new Set(inbox.map(m => m.id));
  const due = MAILS.filter(m => !have.has(m.id) && m.trigger(state));
  const archive = !state.mail?.initialized;
  if (archive) setState('mail', 'initialized', true);
  if (!due.length) return;
  setState('mail', 'inbox', [...inbox, ...due.map(m => ({ id: m.id, at: now, read: archive, choice: null }))]);
  if (archive || silent) return;
  due.forEach(m => emitToast(`📬 ${MAIL_SENDERS[m.from]?.name}: ${m.subject}`, 'info'));
}

export function markMailsRead() {
  if (!mailInbox().some(m => !m.read)) return;
  setState('mail', 'inbox', mailInbox().map(m => (m.read ? m : { ...m, read: true })));
}

// Kurzbeschreibung eines Antwort-Effekts (Tooltips)
export function mailEffectLabel(choice) {
  const parts = [];
  if (choice.grant) parts.push(`${choice.grant.minutes} min ${RESOURCE_LABELS[choice.grant.res] || choice.grant.res}-Produktion`);
  if (choice.boost) parts.push(`Boost „${choice.boost.name}“: ${Object.entries(choice.boost.effects).map(([k, v]) => (k === 'allMult' ? `Gesamt ×${v}` : `${k} ×${v}`)).join(', ')} für ${choice.boost.minutes} min`);
  if (choice.lab) parts.push(`laufende Laborprojekte ${choice.lab} h schneller`);
  if (choice.coffee) parts.push(`+${choice.coffee} Kaffee`);
  return parts.join(' · ') || 'Nur Antwort';
}

function applyChoice(choice) {
  const parts = [];
  if (choice.grant) {
    const perSec = Math.max(0, currentRates().__produced?.[choice.grant.res] || 0);
    const amount = Math.max(50, perSec * choice.grant.minutes * 60);
    add(choice.grant.res, amount);
    parts.push(`+${fmt(amount)} ${RESOURCE_LABELS[choice.grant.res] || choice.grant.res}`);
  }
  if (choice.boost) {
    const started = setBoost({ name: choice.boost.name, effects: choice.boost.effects, duration: choice.boost.minutes * 60e3 });
    parts.push(`${choice.boost.name} (${choice.boost.minutes} min${started ? '' : ', nach dem laufenden Boost'})`);
  }
  if (choice.lab) {
    const n = speedUpLab(choice.lab * 3600e3);
    parts.push(n ? `Labor ${choice.lab} h schneller` : 'kein Laborprojekt lief');
  }
  if (choice.coffee) {
    const beans = Math.min(COFFEE_MAX, (state.coffee?.beans || 0) + choice.coffee);
    setState('coffee', 'beans', beans);
    parts.push(`+${choice.coffee} Kaffee`);
  }
  return parts;
}

// Antwort auf eine Mail mit Entscheidung. Gibt die Effekt-Texte zurück (oder null).
export function answerMail(id, index) {
  const def = getMail(id);
  const i = mailInbox().findIndex(m => m.id === id);
  const choice = def?.choices?.[index];
  if (i < 0 || !choice || mailInbox()[i].choice !== null) return null;
  const parts = applyChoice(choice);
  setState('mail', 'inbox', i, { choice: index, read: true });
  log(`📬 ${def.subject}: ${choice.label}${parts.length ? ` – ${parts.join(', ')}` : ''}.`);
  return parts;
}
