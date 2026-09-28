// Einfaches Rate-Limit je Schlüssel (Standard: IP) und Zeitfenster.
function makeRateLimit(maxReqs, windowMs, keyOf = (req) => req.ip || req.connection?.remoteAddress || 'unknown') {
  const buckets = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, r] of buckets.entries()) {
      if (now > r.resetAt) buckets.delete(key);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const key = keyOf(req);
    const now = Date.now();
    let r = buckets.get(key);
    if (!r || now > r.resetAt) r = { count: 0, resetAt: now + windowMs };
    r.count++;
    buckets.set(key, r);
    if (r.count > maxReqs) {
      res.setHeader('Retry-After', Math.ceil((r.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Zu viele Anfragen. Kurz warten.' });
    }
    next();
  };
}

module.exports = { makeRateLimit };
