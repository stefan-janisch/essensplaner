import db from '../db.js';

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  req.userId = req.session.userId;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  req.userId = req.session.userId;
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Keine Admin-Berechtigung' });
  }
  next();
}
