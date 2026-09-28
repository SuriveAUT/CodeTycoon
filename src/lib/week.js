// week.js – Wiener Kalenderwoche für die Wochenwertung: Montag 00:00 Europe/Vienna bis zum nächsten Montag.
// Wochen-ID = Datum des Montags (YYYY-MM-DD), Zeitpunkte in UTC-Millisekunden. Wochen mit Zeitumstellung
// haben 167 bzw. 169 Stunden. Das Backend rechnet mit backend/lib/week.js identisch.
const TZ = 'Europe/Vienna';
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const DAY_MS = 86400e3;
const EPOCH_WEEK = Date.UTC(2026, 8, 28);   // erste Woche der Wochenwertung (Index 0)

function parts(ts) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
const pad = n => String(n).padStart(2, '0');
const idOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function utcDate(id) { const [y, m, d] = id.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function shiftDay(id, days) {
  const d = new Date(utcDate(id) + days * DAY_MS);
  return idOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// UTC-Zeitpunkt von 00:00 Wiener Zeit am Kalendertag `id` (Offset iterativ bestimmen)
function midnight(id) {
  const want = utcDate(id);
  let t = want - 3600e3;
  for (let i = 0; i < 3; i++) {
    const p = parts(t);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  }
  return t;
}

export function dayOf(ts) { const p = parts(ts); return idOf(p.y, p.m, p.d); }

export function weekOf(ts) {
  const day = dayOf(ts);
  const weekday = (new Date(utcDate(day)).getUTCDay() + 6) % 7;   // Montag = 0
  const id = shiftDay(day, -weekday);
  return { id, start: midnight(id), end: midnight(shiftDay(id, 7)) };
}

export function weekById(id) { return weekOf(utcDate(id) + 12 * 3600e3); }
export function nextDayStart(ts) { return midnight(shiftDay(dayOf(ts), 1)); }
export function prevWeekId(id) { return shiftDay(id, -7); }
export function weekIndex(id) { return Math.round((utcDate(id) - EPOCH_WEEK) / (7 * DAY_MS)); }
export function daysBetween(a, b) { return Math.round((utcDate(b) - utcDate(a)) / DAY_MS); }
