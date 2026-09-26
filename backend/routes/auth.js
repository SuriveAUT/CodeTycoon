const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { isAdminUser } = require('../lib/admin');

// In-memory rate limiter: max 10 auth attempts per 15 minutes per IP
const authAttempts = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 10;

function rateLimitAuth(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  let record = authAttempts.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  record.count++;
  authAttempts.set(ip, record);
  if (record.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte kurz.' });
  }
  next();
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of authAttempts.entries()) {
    if (now > record.resetAt) authAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'very_secret_key_change_in_production') {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: JWT_SECRET env var must be set in production. Shutting down.');
      process.exit(1);
    }
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET env var before going live.');
    return 'very_secret_key_change_in_production';
  }
  return secret;
}

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
  'astraforge',
  'dominik'
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

function validateUsernamePolicy(username) {
  const normalized = normalizeUsernameForPolicy(username);
  if (RESERVED_USERNAMES.has(normalized)) {
    return 'Dieser Name ist reserviert.';
  }
  if (BLOCKED_USERNAME_KEYWORDS.some((word) => normalized.includes(normalizeUsernameForPolicy(word)))) {
    return 'Dieser Name ist nicht erlaubt.';
  }
  return null;
}

router.post('/register', rateLimitAuth, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Name und Passwort erforderlich.' });
  }
  if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Name muss 3–30 Zeichen lang sein.' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Nur Buchstaben, Zahlen, - und _ erlaubt.' });
  }
  const usernamePolicyError = validateUsernamePolicy(username);
  if (usernamePolicyError) {
    return res.status(400).json({ error: usernamePolicyError });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' });
  }

  try {
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (row) return res.status(400).json({ error: 'Name bereits vergeben.' });

      const passwordHash = await bcrypt.hash(password, 10);
      db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash], function (err) {
        if (err) return res.status(500).json({ error: 'Registrierung fehlgeschlagen.' });
        res.status(201).json({ message: 'Account erstellt.', userId: this.lastID });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Interner Fehler.' });
  }
});

router.post('/login', rateLimitAuth, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Name und Passwort erforderlich.' });
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Ungültige Eingabe.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login erfolgreich.',
      token,
      userId: user.id,
      username: user.username,
      account: { flagged: Boolean(user.flagged), flagReason: user.flag_reason || '', isAdmin: isAdminUser(user.username) }
    });
  });
});

module.exports = router;
