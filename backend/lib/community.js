// community.js – Wochenwertung und gemeinsames Open-Source-Projekt.
// Der Server führt Wochenwerte, Abzeichen, Projektfortschritt, Kontingente und Belohnungsansprüche; die
// Spielwirtschaft bleibt im Client. Wochenwerte kommen über /api/game/save (recordWeekly), Beiträge über
// routes/community.js. Schreibabläufe laufen nacheinander (exclusive), jeder Einzelschritt ist idempotent –
// ein Absturz mittendrin hinterlässt nichts Doppeltes, ensureActiveProject repariert ein fehlendes Projekt.
const db = require('../db');
const { postSystem } = require('./chatSystem');
const { weekOf, weekById, dayOf, nextDayStart, prevWeekId, weekIndex, daysBetween } = require('./week');
const { projectDef } = require('./communityProjects');

const QUOTA_START = 3;
const QUOTA_PER_DAY = 3;
const QUOTA_MAX = 9;
const PACKAGES_PER_ACTIVE = 20;
const MIN_ACTIVE = 2;
const ACTIVE_WINDOW_MS = 7 * 86400e3;
const MILESTONES = [25, 50, 75];
const TYPES = ['code', 'qa', 'docs'];
const BASELINE_XP = 1000;          // Mindestbasis fürs Wachstum: 487 → 974 XP sind +49 %, nicht +100 %
const MAX_SLOTS = 4;
const MIN_SLOT_MS = 3600e3;        // Forschung erst ab einer Slot-Stunde werten
const MAX_SPRINT = 100;
const AWARD_WEEKS = 8;
const REWARD_PROJECTS = 20;
const SPRINT_POOL_SIZE = 6;        // Größe von WEEKLY_SPRINT_POOL in src/data/challenges.js
const CATEGORIES = ['growth', 'sprint', 'lab'];
const CATEGORY_LABELS = { growth: 'Wachstum', sprint: 'Wochen-Sprint', lab: 'Forschung' };
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

// ── Promise-Hilfen ──
function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ changes: this.changes, lastID: this.lastID });
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
}

// Schreibabläufe nacheinander: Zwischen zwei await eines Ablaufs startet kein anderer.
// Innerhalb von exclusive nie wieder exclusive aufrufen (würde auf sich selbst warten).
let chain = Promise.resolve();
function exclusive(fn) {
  const result = chain.then(fn, fn);
  chain = result.catch(() => {});
  return result;
}

function announce(message) {
  return postSystem(message).catch(err => console.error('[Community] Chat-Meldung fehlgeschlagen:', err.message));
}

const finiteNonNeg = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const formatDay = (id) => { const [, m, d] = id.split('-'); return `${d}.${m}.`; };
function formatValue(category, value) {
  if (category === 'growth') return `+${Math.round(value * 100)} %`;
  if (category === 'sprint') return `${Math.round(value * 100)} %`;
  return `${value.toFixed(1)} h/Slot-Tag`;
}

// ── Wochenwertung ──

function readWeekly(gameData, week) {
  const stats = gameData?.stats || {};
  const weekly = gameData?.weekly || {};
  const slots = Number.isInteger(weekly.labSlots) ? Math.min(MAX_SLOTS, Math.max(1, weekly.labSlots)) : 1;
  const sprint = weekly.week === week.id ? Math.min(MAX_SPRINT, finiteNonNeg(weekly.sprintBest)) : 0;
  return { xp: finiteNonNeg(stats.xpEarned), lab: finiteNonNeg(stats.labHours), slots, sprint };
}

// Nach jedem Cloud-Save: Wochenwerte fortschreiben. Werte sinken nie (ein veralteter Tab setzt nichts zurück).
function recordWeekly(userId, gameData, now = Date.now()) {
  return exclusive(async () => {
    const week = weekOf(now);
    const v = readWeekly(gameData, week);
    const row = await get('SELECT * FROM weekly_stats WHERE week_id = ? AND user_id = ?', [week.id, userId]);
    if (!row) {
      // Startwerte: Endstand der unmittelbaren Vorwoche, sonst dieser Save (Baseline, noch kein Zuwachs).
      // Mit Vorwoche lief das Labor seit Wochenbeginn weiter → Slot-Zeit ab Montag 00:00.
      const prev = await get('SELECT * FROM weekly_stats WHERE week_id = ? AND user_id = ?', [prevWeekId(week.id), userId]);
      await run(
        `INSERT OR IGNORE INTO weekly_stats (week_id, user_id, xp_start, xp_now, lab_start, lab_now, slot_ms, slots, last_at, sprint_best)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [week.id, userId,
          prev ? Math.min(prev.xp_now, v.xp) : v.xp, v.xp,
          prev ? Math.min(prev.lab_now, v.lab) : v.lab, v.lab,
          prev ? prev.slots * Math.max(0, now - week.start) : 0, v.slots, now, v.sprint]
      );
      return;
    }
    // Slot-Zeit seit dem letzten Save mit der alten Slotzahl (SET-Ausdrücke sehen die alten Spaltenwerte)
    await run(
      `UPDATE weekly_stats SET xp_now = MAX(xp_now, ?), lab_now = MAX(lab_now, ?), slot_ms = slot_ms + slots * ?,
         slots = ?, last_at = ?, sprint_best = MAX(sprint_best, ?)
       WHERE week_id = ? AND user_id = ?`,
      [v.xp, v.lab, Math.max(0, now - row.last_at), v.slots, Math.max(row.last_at, now), v.sprint, week.id, userId]
    );
  });
}

// Werte einer Zeile; die Slot-Zeit läuft bis `capEnd` weiter (Wochenende bzw. jetzt)
function weekValues(row, capEnd) {
  const growth = (row.xp_now - row.xp_start) / Math.max(row.xp_start, BASELINE_XP);
  const slotMs = row.slot_ms + row.slots * Math.max(0, capEnd - row.last_at);
  const lab = slotMs >= MIN_SLOT_MS ? (row.lab_now - row.lab_start) / (slotMs / 86400e3) : null;
  return { growth, sprint: row.sprint_best, lab };
}

function rankCategory(entries, category) {
  return entries
    .map(e => ({ userId: e.userId, username: e.username, value: e.values[category] }))
    .filter(e => e.value != null && Number.isFinite(e.value) && e.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Sieger einer Kategorie: alle mit dem Höchstwert (Gleichstand teilt)
function winners(entries, category) {
  const ranked = rankCategory(entries, category);
  if (!ranked.length) return [];
  const best = ranked[0].value;
  return ranked.filter(e => Math.abs(e.value - best) <= 1e-9 * best);
}

// Abgelaufene Wochen abschließen: Abzeichen vergeben, dann die Woche als abgeschlossen markieren. Beides ist
// idempotent; die Chat-Meldung geht nur mit, wenn diese Runde die Woche tatsächlich abgeschlossen hat.
function closeDueWeeks(now = Date.now()) {
  return exclusive(async () => {
    const current = weekOf(now).id;
    const due = await all(
      `SELECT DISTINCT week_id FROM weekly_stats
       WHERE week_id < ? AND week_id NOT IN (SELECT week_id FROM weeks_closed) ORDER BY week_id`,
      [current]
    );
    const closed = [];
    for (const { week_id: weekId } of due) {
      const week = weekById(weekId);
      const rows = await all(
        `SELECT s.*, u.username, u.flagged FROM weekly_stats s JOIN users u ON u.id = s.user_id WHERE s.week_id = ?`,
        [weekId]
      );
      const entries = rows.filter(r => !r.flagged).map(r => ({ userId: r.user_id, username: r.username, values: weekValues(r, week.end) }));
      const lines = [];
      for (const category of CATEGORIES) {
        const top = winners(entries, category);
        for (const w of top) {
          await run('INSERT OR IGNORE INTO weekly_awards (week_id, category, user_id, value) VALUES (?, ?, ?, ?)', [weekId, category, w.userId, w.value]);
        }
        if (top.length) lines.push(`${CATEGORY_LABELS[category]} – ${top.map(w => w.username).join(', ')} (${formatValue(category, top[0].value)})`);
      }
      const res = await run('INSERT OR IGNORE INTO weeks_closed (week_id, closed_at) VALUES (?, ?)', [weekId, now]);
      if (res.changes === 1) {
        closed.push(weekId);
        if (lines.length) await announce(`🏅 Woche ab ${formatDay(weekId)}: ${lines.join(' · ')}`);
      }
    }
    return closed;
  });
}

// ── Open-Source-Projekt ──

function quotaNow(row, today) {
  if (!row) return QUOTA_START;
  const days = daysBetween(row.day, today);
  return days > 0 ? Math.min(QUOTA_MAX, row.balance + QUOTA_PER_DAY * days) : row.balance;
}

// Tagesgutschrift verbuchen (nur innerhalb von exclusive)
async function refreshQuota(userId, now) {
  const today = dayOf(now);
  const row = await get('SELECT balance, day FROM community_quota WHERE user_id = ?', [userId]);
  if (!row) {
    await run('INSERT OR IGNORE INTO community_quota (user_id, balance, day) VALUES (?, ?, ?)', [userId, QUOTA_START, today]);
    return;
  }
  if (daysBetween(row.day, today) > 0) {
    await run('UPDATE community_quota SET balance = ?, day = ? WHERE user_id = ?', [quotaNow(row, today), today, userId]);
  }
}

function activeProject() {
  return get('SELECT * FROM community_projects WHERE completed_at IS NULL ORDER BY id DESC LIMIT 1');
}

// Ohne aktives Projekt das nächste der Kette anlegen; Ziel nach aktiven Accounts, beim Start festgelegt
// (nur innerhalb von exclusive)
async function createProjectIfMissing(now) {
  const current = await activeProject();
  if (current) return current;
  const { n } = await get('SELECT COUNT(*) AS n FROM community_projects');
  const { active } = await get('SELECT COUNT(*) AS active FROM users WHERE flagged = 0 AND server_last_save_at > ?', [now - ACTIVE_WINDOW_MS]);
  const def = projectDef(n);
  const goal = PACKAGES_PER_ACTIVE * Math.max(MIN_ACTIVE, active);
  await run(
    'INSERT INTO community_projects (def_index, name, description, goal, started_at) VALUES (?, ?, ?, ?, ?)',
    [def.index, def.name, def.desc, goal, now]
  );
  return activeProject();
}

function ensureActiveProject(now = Date.now()) {
  return exclusive(() => createProjectIfMissing(now));
}

// Nach einer Buchung: Meilenstein melden, bei erreichtem Ziel abschließen und das nächste Projekt starten
async function afterContribution(project, now) {
  const { n: progress } = await get('SELECT COUNT(*) AS n FROM community_contributions WHERE project_id = ?', [project.id]);
  const reached = MILESTONES.filter(p => progress * 100 >= p * project.goal).length;
  if (reached > 0 && progress < project.goal) {
    const res = await run('UPDATE community_projects SET milestones_announced = ? WHERE id = ? AND milestones_announced < ?', [reached, project.id, reached]);
    if (res.changes === 1) await announce(`🧩 ${project.name}: ${MILESTONES[reached - 1]} % geschafft (${progress}/${project.goal} Pakete).`);
  }
  if (progress >= project.goal) {
    const res = await run(
      'UPDATE community_projects SET completed_at = ?, milestones_announced = ? WHERE id = ? AND completed_at IS NULL',
      [now, MILESTONES.length, project.id]
    );
    if (res.changes === 1) {
      const next = await createProjectIfMissing(now);
      await announce(`🎉 ${project.name} ist fertig! +3 % Produktion für alle Mitwirkenden. Weiter geht's mit ${next.name}.`);
    }
  }
}

// Ein Paket buchen. Antwort { status, body }; bei Ablehnung trägt body.refund = true (Client erstattet die Kosten).
// Eine schon gebuchte requestId desselben Nutzers gilt als Erfolg – der Client darf nach Verbindungsabbrüchen
// beliebig oft wiederholen.
async function contribute(userId, body, now = Date.now()) {
  const type = body?.type;
  const requestId = body?.requestId;
  const projectId = Number(body?.projectId);
  if (!TYPES.includes(type) || typeof requestId !== 'string' || !REQUEST_ID.test(requestId) || !Number.isInteger(projectId) || projectId <= 0) {
    return { status: 400, body: { error: 'Ungültiger Beitrag.', refund: true } };
  }
  const result = await exclusive(async () => {
    const user = await get('SELECT id, flagged FROM users WHERE id = ?', [userId]);
    if (!user) return { status: 404, body: { error: 'User nicht gefunden.', refund: true } };
    if (user.flagged) return { status: 403, body: { error: 'Account geflaggt – Beiträge sind gesperrt.', refund: true } };
    const booked = await get('SELECT id FROM community_contributions WHERE request_id = ? AND user_id = ?', [requestId, userId]);
    if (booked) return { status: 200, body: { ok: true, duplicate: true } };
    const project = await createProjectIfMissing(now);
    if (project.id !== projectId) return { status: 409, body: { error: 'Das Projekt hat inzwischen gewechselt.', refund: true } };
    await refreshQuota(userId, now);
    const spent = await run('UPDATE community_quota SET balance = balance - 1 WHERE user_id = ? AND balance >= 1', [userId]);
    if (spent.changes !== 1) return { status: 429, body: { error: 'Kein Paket-Kontingent mehr frei.', refund: true } };
    try {
      await run(
        'INSERT INTO community_contributions (project_id, user_id, type, request_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [project.id, userId, type, requestId, now]
      );
    } catch (err) {
      await run('UPDATE community_quota SET balance = balance + 1 WHERE user_id = ?', [userId]);
      if (err.code === 'SQLITE_CONSTRAINT') return { status: 409, body: { error: 'Anfrage-ID schon vergeben.', refund: true } };
      throw err;
    }
    await afterContribution(project, now);
    return { status: 200, body: { ok: true } };
  });
  if (result.status === 200) result.body.state = await getCommunityState(userId, now);
  return result;
}

// ── Zustand für den Client ──

async function getCommunityState(userId, now = Date.now()) {
  await closeDueWeeks(now);
  const project = await ensureActiveProject(now);
  const week = weekOf(now);
  const idx = weekIndex(week.id);
  let awardsFrom = week.id;
  for (let i = 0; i < AWARD_WEEKS; i++) awardsFrom = prevWeekId(awardsFrom);

  const [rows, awardRows, contributors, progressRow, completedRows, doneRow] = await Promise.all([
    all(`SELECT s.*, u.username FROM weekly_stats s JOIN users u ON u.id = s.user_id WHERE s.week_id = ? AND u.flagged = 0`, [week.id]),
    all(`SELECT a.week_id, a.category, a.value, u.username FROM weekly_awards a JOIN users u ON u.id = a.user_id
         WHERE a.week_id >= ? ORDER BY a.week_id DESC, a.category`, [awardsFrom]),
    all(`SELECT u.username, COUNT(*) AS packages FROM community_contributions c JOIN users u ON u.id = c.user_id
         WHERE c.project_id = ? GROUP BY c.user_id ORDER BY packages DESC, MIN(c.created_at)`, [project.id]),
    get('SELECT COUNT(*) AS n FROM community_contributions WHERE project_id = ?', [project.id]),
    all(`SELECT p.id, p.name, p.completed_at, COUNT(DISTINCT c.user_id) AS contributors FROM community_projects p
         LEFT JOIN community_contributions c ON c.project_id = p.id
         WHERE p.completed_at IS NOT NULL GROUP BY p.id ORDER BY p.completed_at DESC LIMIT 10`),
    get('SELECT COUNT(*) AS n FROM community_projects WHERE completed_at IS NOT NULL')
  ]);

  const entries = rows.map(r => ({ userId: r.user_id, username: r.username, values: weekValues(r, now) }));
  const ranking = Object.fromEntries(CATEGORIES.map(c => [c, rankCategory(entries, c).map(e => ({ username: e.username, value: e.value }))]));

  let me = null;
  if (userId != null) {
    const [quotaRow, mine, badges, mineProjects] = await Promise.all([
      get('SELECT balance, day FROM community_quota WHERE user_id = ?', [userId]),
      get('SELECT COUNT(*) AS n FROM community_contributions WHERE user_id = ?', [userId]),
      get('SELECT COUNT(*) AS n FROM weekly_awards WHERE user_id = ?', [userId]),
      all(`SELECT p.id, p.goal, p.completed_at, (SELECT COUNT(*) FROM community_contributions c2 WHERE c2.project_id = p.id) AS progress
           FROM community_projects p WHERE p.id IN (SELECT DISTINCT project_id FROM community_contributions WHERE user_id = ?)
           ORDER BY p.id DESC LIMIT ?`, [userId, REWARD_PROJECTS])
    ]);
    const quota = quotaNow(quotaRow, dayOf(now));
    me = {
      quota,
      quotaMax: QUOTA_MAX,
      nextQuotaAt: quota < QUOTA_MAX ? nextDayStart(now) : null,
      contributor: mine.n > 0,
      packagesTotal: mine.n,
      badges: badges.n,
      rewards: mineProjects.flatMap(p => MILESTONES
        .filter(m => p.completed_at != null || p.progress * 100 >= m * p.goal)
        .map(m => `p${p.id}:m${m}`))
    };
  }

  return {
    week: { id: week.id, start: week.start, end: week.end, sprint: ((idx % SPRINT_POOL_SIZE) + SPRINT_POOL_SIZE) % SPRINT_POOL_SIZE },
    ranking,
    awards: awardRows.map(a => ({ week: a.week_id, category: a.category, username: a.username, value: a.value })),
    project: {
      id: project.id,
      name: project.name,
      desc: project.description,
      goal: project.goal,
      progress: progressRow.n,
      startedAt: project.started_at,
      contributors: contributors.map(c => ({ username: c.username, packages: c.packages }))
    },
    completed: completedRows.map(p => ({ id: p.id, name: p.name, completedAt: p.completed_at, contributors: p.contributors })),
    projectsDone: doneRow.n,
    me
  };
}

// ── Start ──
let timer = null;
async function initCommunity() {
  await ensureActiveProject();
  await closeDueWeeks();
  if (!timer) {
    timer = setInterval(() => {
      closeDueWeeks().catch(err => console.error('[Community] Wochenabschluss fehlgeschlagen:', err.message));
    }, 60e3);
    timer.unref();
  }
  console.log('[Community] bereit.');
}

module.exports = {
  recordWeekly, closeDueWeeks, ensureActiveProject, contribute, getCommunityState, initCommunity,
  QUOTA_START, QUOTA_PER_DAY, QUOTA_MAX, MILESTONES, TYPES
};
