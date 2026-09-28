// Community: Wochenwertung und Open-Source-Projekt (Logik in lib/community.js).
const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../lib/auth');
const { makeRateLimit } = require('../lib/rateLimit');
const { getCommunityState, contribute } = require('../lib/community');

// Hinter dem Reverse-Proxy teilen sich alle dieselbe IP – eingeloggte Spieler zählen daher je Account
const byUserOrIp = (req) => (req.user?.id ? `u${req.user.id}` : `ip${req.ip || 'unknown'}`);
const limitState = makeRateLimit(60, 60 * 1000, byUserOrIp);
const limitContribute = makeRateLimit(30, 60 * 1000, byUserOrIp);

router.get('/state', optionalAuth, limitState, async (req, res) => {
  try {
    res.json(await getCommunityState(req.user?.id ?? null));
  } catch (err) {
    console.error('[Community] state:', err);
    res.status(500).json({ error: 'Community gerade nicht erreichbar.' });
  }
});

router.post('/contribute', requireAuth, limitContribute, async (req, res) => {
  try {
    const { status, body } = await contribute(req.user.id, req.body || {});
    res.status(status).json(body);
  } catch (err) {
    console.error('[Community] contribute:', err);
    res.status(500).json({ error: 'Community gerade nicht erreichbar.' });
  }
});

module.exports = router;
