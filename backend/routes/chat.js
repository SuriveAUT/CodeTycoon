const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { censorProfanity, censorChatRows } = require('../lib/profanityFilter');

const MSG_COOLDOWN_MS = 5000;
const MAX_MSG_LENGTH = 200;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Dominik';
const MODERATOR_USERNAMES = new Set(
  (process.env.MODERATOR_USERNAMES || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
);
const CHAT_CLEAR_MESSAGE = 'Chat wurde geleert.';

// 60 reads/min per IP — stops scraping
const readBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of readBuckets.entries()) {
    if (now > r.resetAt) readBuckets.delete(ip);
  }
}, 60000).unref();
function limitChatRead(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let r = readBuckets.get(ip);
  if (!r || now > r.resetAt) r = { count: 0, resetAt: now + 60000 };
  r.count++;
  readBuckets.set(ip, r);
  if (r.count > 60) return res.status(429).json({ error: 'Zu viele Anfragen.' });
  next();
}

const userLastMessage = new Map();

// Clean up stale cooldown entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - MSG_COOLDOWN_MS * 2;
  for (const [user, ts] of userLastMessage.entries()) {
    if (ts < cutoff) userLastMessage.delete(user);
  }
}, 10 * 60 * 1000).unref();

// Delete chat messages older than 24 hours, runs every hour
setInterval(() => {
  db.run(
    "DELETE FROM chat_messages WHERE created_at < datetime('now', '-24 hours')",
    (err) => { if (err) console.error('Chat cleanup error:', err.message); }
  );
}, 60 * 60 * 1000).unref();

function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const secret = process.env.JWT_SECRET || 'very_secret_key_change_in_production';
  try {
    return jwt.verify(auth.slice(7), secret);
  } catch {
    return null;
  }
}

function isChatModerator(username) {
  return username === ADMIN_USERNAME || MODERATOR_USERNAMES.has(username);
}

// GET /api/chat/messages
// ?since=<id>  → new messages since that id (polling)
// no since     → last 50 messages (initial load)
router.get('/messages', limitChatRead, (req, res) => {
  const sinceRaw = req.query.since;
  const hasSince = sinceRaw !== undefined;
  const since = parseInt(sinceRaw);

  if (hasSince && (isNaN(since) || since < 0)) {
    return res.status(400).json({ error: 'Ungültiger since-Parameter.' });
  }

  if (hasSince) {
    db.all(
      'SELECT id, username, message, created_at FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT 50',
      [since],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        res.json({ messages: censorChatRows(rows) });
      }
    );
  } else {
    db.all(
      'SELECT id, username, message, created_at FROM chat_messages ORDER BY id DESC LIMIT 50',
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        res.json({ messages: censorChatRows((rows || []).reverse()) });
      }
    );
  }
});

function postSystem(msg, cb) {
  db.run('INSERT INTO chat_messages (username, message) VALUES (?, ?)', ['System', msg], function(err) {
    cb(err, this?.lastID);
  });
}

function handleChatCommand(cmd, args, username, isAdmin, isMod, res) {
  switch (cmd) {
    case 'clear': {
      if (!isMod) return res.status(403).json({ error: 'Kein Zugriff.' });
      db.serialize(() => {
        db.run('DELETE FROM chat_messages', (err) => {
          if (err) return res.status(500).json({ error: 'DB-Fehler.' });
          postSystem(CHAT_CLEAR_MESSAGE, (e, id) => {
            if (e) return res.status(500).json({ error: 'DB-Fehler.' });
            res.json({ ok: true, command: 'clear', id });
          });
        });
      });
      break;
    }
    case 'me': {
      if (!args) return res.status(400).json({ error: 'Aktion fehlt. Beispiel: /me lacht.' });
      const emoteText = censorProfanity(args.slice(0, MAX_MSG_LENGTH - 1));
      db.run(
        'INSERT INTO chat_messages (username, message) VALUES (?, ?)',
        [username, `\x01${emoteText}`],
        function(err) {
          if (err) return res.status(500).json({ error: 'DB-Fehler.' });
          res.json({ ok: true, id: this.lastID });
        }
      );
      break;
    }
    case 'ping': {
      res.json({ ok: true, command: 'ping', serverTime: Date.now() });
      break;
    }
    case 'top': {
      db.all(
        'SELECT username, prestige_score, total_scrap, xp_earned FROM users WHERE flagged = 0 ORDER BY xp_earned DESC, total_scrap DESC LIMIT 5',
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ error: 'DB-Fehler.' });
          res.json({ ok: true, command: 'top', rows: rows || [] });
        }
      );
      break;
    }
    case 'announce': {
      if (!isMod) return res.status(403).json({ error: 'Kein Zugriff. (nur Moderatoren)' });
      if (!args) return res.status(400).json({ error: 'Text fehlt. Beispiel: /announce Server-Update um 20 Uhr.' });
      postSystem(`📢 ${args.slice(0, 180)}`, (err, id) => {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        res.json({ ok: true, command: 'announce', id });
      });
      break;
    }
    case 'warn': {
      if (!isMod) return res.status(403).json({ error: 'Kein Zugriff. (nur Moderatoren)' });
      const warnParts = args.split(/\s+/);
      const warnTarget = warnParts[0];
      const warnReason = warnParts.slice(1).join(' ') || 'Bitte die Chat-Regeln beachten.';
      if (!warnTarget) return res.status(400).json({ error: 'Username fehlt. Beispiel: /warn User123 Spam' });
      db.get('SELECT username FROM users WHERE username = ?', [warnTarget], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        if (!row) return res.status(404).json({ error: `User "${warnTarget}" nicht gefunden.` });
        postSystem(`⚠ ${warnTarget} wurde verwarnt: ${warnReason}`, (e, id) => {
          if (e) return res.status(500).json({ error: 'DB-Fehler.' });
          res.json({ ok: true, command: 'warn', id });
        });
      });
      break;
    }
    case 'ban': {
      if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff. (nur Admin)' });
      const banParts = args.split(/\s+/);
      const banTarget = banParts[0];
      const banReason = banParts.slice(1).join(' ') || 'Manuell via Chat geflaggt';
      if (!banTarget) return res.status(400).json({ error: 'Username fehlt. Beispiel: /ban User123 Cheating' });
      if (banTarget === ADMIN_USERNAME) return res.status(400).json({ error: 'Admin kann nicht gebannt werden.' });
      db.run('UPDATE users SET flagged = 1, flag_reason = ? WHERE username = ?', [banReason, banTarget], function(err) {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        if (this.changes === 0) return res.status(404).json({ error: `User "${banTarget}" nicht gefunden.` });
        postSystem(`🚫 ${banTarget} wurde gebannt. Grund: ${banReason}`, (e, id) => {
          if (e) return res.status(500).json({ error: 'DB-Fehler.' });
          res.json({ ok: true, command: 'ban', id });
        });
      });
      break;
    }
    case 'unban': {
      if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff. (nur Admin)' });
      const unbanTarget = args.split(/\s+/)[0];
      if (!unbanTarget) return res.status(400).json({ error: 'Username fehlt. Beispiel: /unban User123' });
      db.run('UPDATE users SET flagged = 0, flag_reason = "" WHERE username = ?', [unbanTarget], function(err) {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        if (this.changes === 0) return res.status(404).json({ error: `User "${unbanTarget}" nicht gefunden.` });
        postSystem(`✅ ${unbanTarget} wurde entbannt.`, (e, id) => {
          if (e) return res.status(500).json({ error: 'DB-Fehler.' });
          res.json({ ok: true, command: 'unban', id });
        });
      });
      break;
    }
    case 'users': {
      if (!isAdmin) return res.status(403).json({ error: 'Kein Zugriff. (nur Admin)' });
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      db.get('SELECT COUNT(*) as total FROM users', [], (err, totalRow) => {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        db.get('SELECT COUNT(*) as active FROM users WHERE server_last_save_at > ?', [weekAgo], (err2, activeRow) => {
          if (err2) return res.status(500).json({ error: 'DB-Fehler.' });
          db.get('SELECT COUNT(*) as flagged FROM users WHERE flagged = 1', [], (err3, flagRow) => {
            if (err3) return res.status(500).json({ error: 'DB-Fehler.' });
            res.json({
              ok: true,
              command: 'users',
              total: totalRow?.total || 0,
              active: activeRow?.active || 0,
              flagged: flagRow?.flagged || 0
            });
          });
        });
      });
      break;
    }
    default:
      res.status(400).json({ error: `Unbekannter Befehl: /${cmd}. Tippe /help für alle Befehle.` });
  }
}

// POST /api/chat/send
router.post('/send', (req, res) => {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Nicht eingeloggt.' });

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Keine Nachricht.' });
  }

  const trimmed = message.trim().slice(0, MAX_MSG_LENGTH);
  if (!trimmed) return res.status(400).json({ error: 'Nachricht leer.' });

  db.get('SELECT username FROM users WHERE id = ?', [user.id], (userErr, row) => {
    if (userErr) return res.status(500).json({ error: 'DB-Fehler.' });
    if (!row) return res.status(404).json({ error: 'User nicht gefunden.' });

    const username = row.username;
    const isAdmin = username === ADMIN_USERNAME;
    const isMod = isChatModerator(username);

    // Parse commands
    const cmdMatch = trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
    if (cmdMatch) {
      return handleChatCommand(
        cmdMatch[1].toLowerCase(),
        (cmdMatch[2] || '').trim(),
        username, isAdmin, isMod, res
      );
    }

    // Regular message — apply cooldown
    const now = Date.now();
    const lastAt = userLastMessage.get(username) || 0;
    if (now - lastAt < MSG_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Zu schnell! Warte kurz.' });
    }
    userLastMessage.set(username, now);

    const filtered = censorProfanity(trimmed);
    db.run(
      'INSERT INTO chat_messages (username, message) VALUES (?, ?)',
      [username, filtered],
      function (err) {
        if (err) return res.status(500).json({ error: 'DB-Fehler.' });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });
});

module.exports = router;
