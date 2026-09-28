// JWT-Prüfung für die Community-Route: gleiche Secret-Logik wie routes/game.js und routes/chat.js.
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'very_secret_key_change_in_production';
}

// Payload des Bearer-Tokens oder null
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), getJwtSecret());
  } catch {
    return null;
  }
}

// Nur mit gültigem Token: 401 ohne Token, 403 bei ungültigem
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht authentifiziert.' });
  const user = verifyToken(req);
  if (!user) return res.status(403).json({ error: 'Token ungültig.' });
  req.user = user;
  next();
}

// Token optional: req.user ist der Nutzer oder null
function optionalAuth(req, _res, next) {
  req.user = verifyToken(req);
  next();
}

module.exports = { verifyToken, requireAuth, optionalAuth };
