const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'very_secret_key_change_in_production';
}

// Admin username — override via ADMIN_USERNAME env var
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Dominik';

const MAX_SAVE_BYTES = 1.5 * 1024 * 1024;

// Max ~30 prestiges per real hour (generous — early game is fast)
const MAX_PRESTIGE_PER_MS = 30 / (60 * 60 * 1000);

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'system',
  'root',
  'owner',
  'staff',
  'devtycoon',
  'codetyc',
  'astraforge'
]);

const BLOCKED_USERNAME_KEYWORDS = [
  'hitler',
  'nazi',
  'nsdap',
  'kkk',
  'terror',
  'isis',
  'rape',
  'rapist',
  'pedo',
  'paedo',
  'pedophile',
  'pedophil',
  'childporn',
  'porn',
  'sex',
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'cunt',
  'asshole',
  'whore',
  'slut',
  'arsch',
  'scheisse',
  'scheiße',
  'fick',
  'fotze',
  'hure',
  'wichser',
  'spast',
  'hurensohn',
  'kanake',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'suicide',
  'murder'
];

function normalizeUsernameForPolicy(username) {
  return username
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[@]/g, 'a')
    .replace(/[4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function validateUsername(username) {
  if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return 'Name muss 3-30 Zeichen lang sein.';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Nur Buchstaben, Zahlen, - und _ erlaubt.';
  }
  const normalized = normalizeUsernameForPolicy(username);
  if (RESERVED_USERNAMES.has(normalized)) {
    return 'Dieser Name ist reserviert.';
  }
  if (BLOCKED_USERNAME_KEYWORDS.some((word) => normalized.includes(normalizeUsernameForPolicy(word)))) {
    return 'Dieser Name ist nicht erlaubt.';
  }
  return null;
}

// ── Generic IP rate limiter ────────────────────────────────────────────────
function makeRateLimit(maxReqs, windowMs) {
  const buckets = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, r] of buckets.entries()) {
      if (now > r.resetAt) buckets.delete(ip);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let r = buckets.get(ip);
    if (!r || now > r.resetAt) r = { count: 0, resetAt: now + windowMs };
    r.count++;
    buckets.set(ip, r);
    if (r.count > maxReqs) {
      res.setHeader('Retry-After', Math.ceil((r.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Zu viele Anfragen. Kurz warten.' });
    }
    next();
  };
}

// Per-user save cooldown (8s)
const saveLastAt = new Map();
setInterval(() => {
  const cutoff = Date.now() - 20000;
  for (const [id, ts] of saveLastAt.entries()) if (ts < cutoff) saveLastAt.delete(id);
}, 60000).unref();

const limitPublic = makeRateLimit(30, 60 * 1000);
const limitSave   = makeRateLimit(20, 60 * 1000);

// ── Auth ───────────────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Nicht authentifiziert.' });
  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (err) return res.status(403).json({ error: 'Token ungültig.' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: 'Kein Zugriff.' });
  }
  next();
};

// ── Save validation ────────────────────────────────────────────────────────
function validateSave(data) {
  if (!data || typeof data !== 'object') return 'Ungültige Save-Struktur.';
  for (const [key, val] of Object.entries(data.resources || {})) {
    if (typeof val !== 'number' || !isFinite(val) || val < 0)
      return `Ungültiger Ressourcenwert: ${key}`;
  }
  const lifetime = data.stats?.lifetime;
  if (lifetime !== undefined && (typeof lifetime !== 'number' || !isFinite(lifetime) || lifetime < 0))
    return 'Ungültige Spielzeit.';
  const prestige = data.stats?.prestigeCount || 0;
  if (typeof prestige !== 'number' || prestige < 0 || prestige > 10000)
    return 'Ungültiger Prestige-Wert.';
  const totalScrap = data.stats?.total?.scrap;
  if (totalScrap !== undefined && (typeof totalScrap !== 'number' || !isFinite(totalScrap) || totalScrap < 0))
    return 'Ungültiger Gesamtwert.';
  const xpEarned = data.stats?.xpEarned;
  if (xpEarned !== undefined && (typeof xpEarned !== 'number' || !isFinite(xpEarned) || xpEarned < 0))
    return 'Ungültige XP.';
  return null;
}

// ── Anti-cheat checks (flag, don't block legitimate users) ─────────────────
function runAntiCheatChecks(gameData, row, serverNow) {
  const flags = [];
  const clientLastSave  = Number(gameData.stats?.lastSave || 0);
  const serverLastSave  = Number(row.server_last_save_at || 0);
  const prevPrestige    = Number(row.prestige_score || 0);
  const newPrestige     = Number(gameData.stats?.prestigeCount || 0);

  // 1. Offline time forgery: client claims more elapsed time than server observed
  if (serverLastSave > 0) {
    const serverElapsed = serverNow - serverLastSave;           // real ms since last save
    const clientClaimed = serverNow - clientLastSave;           // ms client claims since last save
    const grace = Math.max(600_000, serverElapsed * 0.15);     // 10min or 15% buffer
    if (clientClaimed > serverElapsed + grace) {
      flags.push(`Offline-Zeit gefälscht: server=${Math.round(serverElapsed/60000)}min, client=${Math.round(clientClaimed/60000)}min`);
    }
  }

  // 2. Client timestamp in the future
  if (clientLastSave > serverNow + 300_000) {
    flags.push(`lastSave liegt in der Zukunft: ${new Date(clientLastSave).toISOString()}`);
  }

  // 3. Prestige jumped impossibly fast
  if (serverLastSave > 0 && newPrestige > prevPrestige) {
    const serverElapsed = serverNow - serverLastSave;
    const maxAllowed = prevPrestige + Math.max(5, Math.ceil(serverElapsed * MAX_PRESTIGE_PER_MS));
    if (newPrestige > maxAllowed) {
      flags.push(`Prestige-Sprung: ${prevPrestige} → ${newPrestige}, max erlaubt: ${maxAllowed}`);
    }
  }

  return flags;
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.post('/save', authenticateToken, limitSave, (req, res) => {
  const userId   = req.user.id;
  const gameData = req.body.gameData;

  if (!gameData) return res.status(400).json({ error: 'Game data missing' });

  const lastAt = saveLastAt.get(userId) || 0;
  if (Date.now() - lastAt < 8000) return res.status(429).json({ error: 'Speichert zu schnell.' });
  saveLastAt.set(userId, Date.now());

  const validationError = validateSave(gameData);
  if (validationError) return res.status(400).json({ error: validationError });

  const gameDataStr = JSON.stringify(gameData);
  if (Buffer.byteLength(gameDataStr, 'utf8') > MAX_SAVE_BYTES)
    return res.status(413).json({ error: 'Save-Datei zu groß.' });

  // Fetch current row for anti-cheat comparison
  db.get('SELECT username, server_last_save_at, prestige_score, flagged, flag_reason, save_version FROM users WHERE id = ?', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'User nicht gefunden.' });

    // Ein veralteter Tab (älteres Save-Format) darf einen neueren Spielstand nicht überschreiben
    const saveVersion = Number(gameData.version) || 0;
    if (saveVersion < (row.save_version || 0)) {
      return res.status(409).json({ error: 'Veraltete Spielversion – bitte die Seite neu laden.' });
    }
    const xpEarned = Number.isFinite(gameData.stats?.xpEarned) ? gameData.stats.xpEarned : null;

    const serverNow  = Date.now();
    const flags      = runAntiCheatChecks(gameData, row, serverNow);
    const prestige   = gameData.stats?.prestigeCount || 0;
    const scrap      = gameData.stats?.total?.scrap  || 0;

    const shouldFlag = flags.length > 0;
    const reason     = flags.join(' | ');

    // Only escalate flag — never auto-unflag (admin must do that)
    const newFlagged = shouldFlag ? 1 : (row.flagged || 0);
    const newReason  = shouldFlag ? reason : (row.flag_reason || '');

    db.run(
      `UPDATE users
       SET game_save = ?, prestige_score = ?, total_scrap = ?,
           server_last_save_at = ?, flagged = ?, flag_reason = ?,
           xp_earned = COALESCE(?, xp_earned), save_version = ?
       WHERE id = ?`,
      [gameDataStr, prestige, scrap, serverNow, newFlagged, newReason, xpEarned, saveVersion, userId],
      function(err2) {
        if (err2) return res.status(500).json({ error: 'Failed to save game' });
        res.json({
          message: 'Game saved successfully',
          account: { username: row.username, flagged: Boolean(newFlagged), flagReason: newReason || '' }
        });
      }
    );
  });
});

router.get('/load', authenticateToken, (req, res) => {
  db.get('SELECT username, game_save, flagged, flag_reason FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User nicht gefunden.' });
    const account = { username: row.username, flagged: Boolean(row.flagged), flagReason: row.flag_reason || '' };
    if (!row.game_save) return res.json({ gameData: null, account, message: 'No save found' });
    res.json({ gameData: JSON.parse(row.game_save), account });
  });
});

router.get('/status', authenticateToken, (req, res) => {
  db.get('SELECT username, flagged, flag_reason FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User nicht gefunden.' });
    res.json({ username: row.username, flagged: Boolean(row.flagged), flagReason: row.flag_reason || '' });
  });
});

// Leaderboard — excludes flagged users
router.get('/leaderboard', limitPublic, (req, res) => {
  db.all(
    `SELECT username, prestige_score, total_scrap, xp_earned
     FROM users WHERE flagged = 0
     ORDER BY xp_earned DESC, total_scrap DESC LIMIT 100`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error fetching leaderboard' });
      res.json(rows);
    }
  );
});

router.get('/profile/:username', limitPublic, (req, res) => {
  db.get('SELECT username, prestige_score, total_scrap, game_save FROM users WHERE username = ?', [req.params.username], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User not found' });
    let s = {};
    try { s = row.game_save ? JSON.parse(row.game_save) : {}; } catch (e) {}
    res.json({
      username: row.username,
      prestige: row.prestige_score,
      totalScrap: row.total_scrap,
      lifetime: s.stats?.lifetime || 0,
      projects: s.stats?.projectsBuilt || 0,
      expeditions: s.stats?.expeditionsDone || 0,
      artifacts: s.artifacts?.length || 0,
      colonies: s.colonies?.length || 0
    });
  });
});

// ── Admin endpoints (only Dominik) ────────────────────────────────────────

// List all flagged users
router.get('/admin/flagged', authenticateToken, requireAdmin, (req, res) => {
  db.all(
    `SELECT id, username, prestige_score, total_scrap, flagged, flag_reason, created_at
     FROM users WHERE flagged = 1 ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(rows);
    }
  );
});

// Unflag a user (clear them for leaderboard)
router.post('/admin/unflag/:username', authenticateToken, requireAdmin, (req, res) => {
  db.run(
    `UPDATE users SET flagged = 0, flag_reason = '' WHERE username = ?`,
    [req.params.username],
    function(err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (this.changes === 0) return res.status(404).json({ error: 'User nicht gefunden.' });
      res.json({ ok: true, message: `${req.params.username} entflaggt.` });
    }
  );
});

// Manually flag a user
router.post('/admin/flag/:username', authenticateToken, requireAdmin, (req, res) => {
  const reason = req.body.reason || 'Manuell geflaggt von Admin';
  db.run(
    `UPDATE users SET flagged = 1, flag_reason = ? WHERE username = ?`,
    [reason, req.params.username],
    function(err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (this.changes === 0) return res.status(404).json({ error: 'User nicht gefunden.' });
      res.json({ ok: true, message: `${req.params.username} geflaggt.` });
    }
  );
});

// Rename a user account
router.patch('/admin/user/:username/rename', authenticateToken, requireAdmin, (req, res) => {
  const oldUsername = req.params.username;
  const newUsername = String(req.body?.newUsername || '').trim();

  if (oldUsername === ADMIN_USERNAME || newUsername === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'Admin-Account kann nicht umbenannt werden.' });
  }

  const validationError = validateUsername(newUsername);
  if (validationError) return res.status(400).json({ error: validationError });
  if (oldUsername === newUsername) return res.status(400).json({ error: 'Alter und neuer Name sind identisch.' });

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE', (beginErr) => {
      if (beginErr) return res.status(500).json({ error: 'DB error' });

      const rollback = (status, error) => {
        db.run('ROLLBACK', () => res.status(status).json({ error }));
      };

      db.run(
        'UPDATE users SET username = ? WHERE username = ?',
        [newUsername, oldUsername],
        function(userErr) {
          if (userErr) {
            const isConflict = userErr.code === 'SQLITE_CONSTRAINT';
            return rollback(isConflict ? 400 : 500, isConflict ? 'Name bereits vergeben.' : 'DB error');
          }
          if (this.changes === 0) return rollback(404, 'User nicht gefunden.');

          db.run('UPDATE chat_messages SET username = ? WHERE username = ?', [newUsername, oldUsername], (chatErr) => {
            if (chatErr) return rollback(500, 'DB error');

            db.run('COMMIT', (commitErr) => {
              if (commitErr) return rollback(500, 'DB error');
              res.json({ ok: true, message: `${oldUsername} in ${newUsername} umbenannt.` });
            });
          });
        }
      );
    });
  });
});

// Get full user data (admin)
router.get('/admin/user/:username/data', authenticateToken, requireAdmin, (req, res) => {
  db.get(
    'SELECT id, username, prestige_score, total_scrap, flagged, flag_reason, game_save, created_at FROM users WHERE username = ?',
    [req.params.username],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!row) return res.status(404).json({ error: 'User nicht gefunden.' });
      res.json(row);
    }
  );
});

// Update user data fields (admin) — partial updates, all fields optional
router.patch('/admin/user/:username/data', authenticateToken, requireAdmin, async (req, res) => {
  const username = req.params.username;
  const { prestige_score, total_scrap, flagged, flag_reason, game_save, new_password } = req.body;

  const updates = [];
  const params = [];

  if (prestige_score !== undefined) {
    const ps = Number(prestige_score);
    if (!isFinite(ps) || ps < 0) return res.status(400).json({ error: 'Ungültiger Prestige-Wert.' });
    updates.push('prestige_score = ?');
    params.push(Math.floor(ps));
  }
  if (total_scrap !== undefined) {
    const ts = Number(total_scrap);
    if (!isFinite(ts) || ts < 0) return res.status(400).json({ error: 'Ungültiger Scrap-Wert.' });
    updates.push('total_scrap = ?');
    params.push(ts);
  }
  if (flagged !== undefined) {
    updates.push('flagged = ?');
    params.push(flagged ? 1 : 0);
  }
  if (flag_reason !== undefined) {
    updates.push('flag_reason = ?');
    params.push(String(flag_reason));
  }
  if (game_save !== undefined) {
    let saveStr;
    try {
      const parsed = typeof game_save === 'string' ? JSON.parse(game_save) : game_save;
      saveStr = JSON.stringify(parsed);
    } catch (e) {
      return res.status(400).json({ error: 'Ungültiges JSON im game_save.' });
    }
    if (Buffer.byteLength(saveStr, 'utf8') > MAX_SAVE_BYTES)
      return res.status(413).json({ error: 'Save-Datei zu groß.' });
    updates.push('game_save = ?');
    params.push(saveStr);
  }
  if (new_password) {
    if (typeof new_password !== 'string' || new_password.length < 6)
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' });
    const hash = await bcrypt.hash(new_password, 10);
    updates.push('password_hash = ?');
    params.push(hash);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Keine Felder zum Aktualisieren.' });

  params.push(username);
  db.run(
    `UPDATE users SET ${updates.join(', ')} WHERE username = ?`,
    params,
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (this.changes === 0) return res.status(404).json({ error: 'User nicht gefunden.' });
      res.json({ ok: true, message: `${username} aktualisiert.` });
    }
  );
});

// Delete a user account
router.delete('/admin/user/:username', authenticateToken, requireAdmin, (req, res) => {
  const username = req.params.username;
  if (username === ADMIN_USERNAME) {
    return res.status(400).json({ error: 'Admin-Account kann nicht gelöscht werden.' });
  }

  db.serialize(() => {
    db.run('DELETE FROM chat_messages WHERE username = ?', [username], (chatErr) => {
      if (chatErr) return res.status(500).json({ error: 'DB error' });

      db.run('DELETE FROM users WHERE username = ?', [username], function(err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        if (this.changes === 0) return res.status(404).json({ error: 'User nicht gefunden.' });
        res.json({ ok: true, message: `${username} gelöscht.` });
      });
    });
  });
});

module.exports = router;
