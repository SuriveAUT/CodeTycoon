// desktopNotify.js – optionale Desktop-Hinweise, solange der Tab im Hintergrund offen ist (Browser-Notification-API,
// kein Push-Server). Beim Verstecken plant App.jsx die nächsten Anlässe aus dem Spielstand: Labor fertig, Kaffee reif,
// neuer Tag, Auftrag fertig. Das Spiel pausiert im versteckten Tab, deshalb zählen nur Zeitstempel.
// Keine Zustellgarantie: Browser drosseln Timer versteckter Tabs und frieren manche Tabs ganz ein.
import { state } from '../store/gameState.js';
import { getLabProject } from '../data/lab.js';
import { dayKey, DAY_MS, COFFEE_INTERVAL_MS, COFFEE_MAX } from '../data/daily.js';
import { getSetting, setSetting } from './settings.js';

// Der Hinweis zum neuen Tag kommt erst um 8 Uhr, nicht um Mitternacht
const STANDUP_HOUR = 8;
// Anlässe, die höchstens so viel zu früh fällig sind, gehen mit in denselben Hinweis
const BUNDLE_MS = 5000;

let timer = null;
const sent = new Set();

// Beginn des lokalen Kalendertags `day` (Umkehrung von dayKey)
function localMidnight(day) {
  const utc = day * DAY_MS;
  return utc + new Date(utc).getTimezoneOffset() * 60000;
}

// Anstehende Anlässe ab `now` als [{ key, at, text }], nach Zeit sortiert
export function desktopNotifyEvents(s = state, now = Date.now()) {
  const events = [];
  for (const r of s.lab?.running || []) {
    if (r.endsAt > now) events.push({ key: `lab:${r.id}:${r.endsAt}`, at: r.endsAt, text: `Labor: ${getLabProject(r.id)?.name || r.id} ist fertig` });
  }
  const beans = s.coffee?.beans || 0;
  const nextBeanAt = s.coffee?.nextBeanAt || 0;
  if (beans < COFFEE_MAX && nextBeanAt > now) {
    for (let k = 0; k < COFFEE_MAX - beans; k++) {
      const at = nextBeanAt + k * COFFEE_INTERVAL_MS;
      events.push({ key: `coffee:${at}`, at, text: 'Kaffee ist reif' });
    }
  }
  // Heutiger Standup noch offen und vor 8 Uhr → um 8 Uhr erinnern; sonst am nächsten Tag um 8 Uhr
  const today = dayKey(now);
  for (const day of [today, today + 1]) {
    const at = localMidnight(day) + STANDUP_HOUR * 3600e3;
    if (at <= now || (day === today && s.daily?.lastClaimDay === today)) continue;
    const streak = s.daily?.streak || 0;
    events.push({ key: `day:${day}`, at, text: `Neuer Tag: Daily Standup wartet${streak ? ` (Streak ${streak})` : ''}` });
  }
  for (const m of s.expeditions || []) {
    if (m.end > now) events.push({ key: `mission:${m.id}:${m.end}`, at: m.end, text: `Auftrag fertig: ${m.name}` });
  }
  return events.sort((a, z) => a.at - z.at);
}

export function desktopNotifyOn() {
  return Boolean(getSetting('desktopNotify')) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

function show(lines) {
  try {
    const n = new Notification('CodeTycoon', { body: lines.join('\n'), icon: '/icon-512.png', tag: 'codetycoon', renotify: true });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (_) { /* z. B. mobile Browser ohne Notification-Konstruktor */ }
}

function scheduleNext(events) {
  const next = events.find(e => !sent.has(e.key));
  if (!next) return;
  timer = setTimeout(() => {
    timer = null;
    const due = events.filter(e => !sent.has(e.key) && e.at <= Date.now() + BUNDLE_MS);
    due.forEach(e => sent.add(e.key));
    if (due.length) show(due.map(e => e.text));
    scheduleNext(events);
  }, Math.max(0, next.at - Date.now()));
}

// Tab wird versteckt: nächste Anlässe planen
export function armDesktopNotify() {
  disarmDesktopNotify();
  if (desktopNotifyOn()) scheduleNext(desktopNotifyEvents());
}

// Tab wieder sichtbar: das Spiel zeigt alles selbst
export function disarmDesktopNotify() {
  if (timer) clearTimeout(timer);
  timer = null;
}

// Schalter in den Einstellungen. Fragt beim Einschalten nach der Browser-Erlaubnis (muss aus einem Klick kommen).
export async function toggleDesktopNotify() {
  if (getSetting('desktopNotify')) { setSetting('desktopNotify', false); return { on: false }; }
  if (typeof Notification === 'undefined') return { on: false, text: 'Dieser Browser kann keine Desktop-Hinweise anzeigen.' };
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return { on: false, text: 'Desktop-Hinweise sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.' };
  setSetting('desktopNotify', true);
  return { on: true, text: 'Desktop-Hinweise an: Labor, Kaffee, neuer Tag und Aufträge, solange der Tab im Hintergrund offen ist.' };
}
