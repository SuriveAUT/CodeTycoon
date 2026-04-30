const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getState, recordTrade } = require('../lib/stockMarket');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'very_secret_key_change_in_production';
}

// Optional auth — attaches req.user if token present, otherwise continues as guest
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

// Simple IP rate limiter
function makeRateLimit(maxReqs, windowMs) {
  const buckets = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, r] of buckets.entries()) {
      if (now > r.resetAt) buckets.delete(ip);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let r = buckets.get(ip);
    if (!r || now > r.resetAt) r = { count: 0, resetAt: now + windowMs };
    r.count++;
    buckets.set(ip, r);
    if (r.count > maxReqs) {
      res.setHeader('Retry-After', Math.ceil((r.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Zu viele Anfragen.' });
    }
    next();
  };
}

const limitPrices = makeRateLimit(60, 60 * 1000);  // 60 reads/min (polling)
const limitTrade  = makeRateLimit(120, 60 * 1000); // 120 trades/min

// GET /api/stocks/prices — public, returns current market state
router.get('/prices', limitPrices, (req, res) => {
  res.json(getState());
});

// POST /api/stocks/trade — authenticated; records buy/sell volume to influence next tick
router.post('/trade', optionalAuth, limitTrade, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nicht eingeloggt.' });

  const { stockId, shares, direction } = req.body;
  if (!stockId || typeof shares !== 'number' || shares <= 0) {
    return res.status(400).json({ error: 'Ungültige Trade-Parameter.' });
  }
  if (direction !== 'buy' && direction !== 'sell') {
    return res.status(400).json({ error: 'direction muss "buy" oder "sell" sein.' });
  }

  recordTrade(stockId, shares, direction);
  res.json({ ok: true });
});

module.exports = router;
