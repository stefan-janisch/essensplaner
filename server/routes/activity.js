/**
 * Apple Health "Active Energy" per day.
 *
 * Apple Health has no web API, so an iOS Shortcut (personal automation, e.g. daily 23:50) reads
 * the last days from Health and POSTs them to /ingest with a personal bearer token — no session
 * cookie there. Only the token's SHA-256 is stored. Values are kept regardless of
 * users.health_enabled; that toggle only decides whether the client uses them for day targets.
 */

import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const MAX_DAYS_PER_REQUEST = 400;
const MAX_ACTIVE_KCAL = 10000;
const HISTORY_DAYS = 400;

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Local calendar date (YYYY-MM-DD) offset by `days` from today.
function localDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Shortcuts hands numbers over as locale text ("512,3", "1.024,5 kcal", "1,024.5") depending on
// the device. The last separator is the decimal one; a lone "1.024" is a thousands group.
function parseKcal(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  let s = value.replace(/[^\d.,]/g, '');
  const decimalAt = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(s) || decimalAt < 0) {
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1);
  }
  return s ? Number(s) : NaN;
}

// Accepts {date, activeKcal}, {days: {"YYYY-MM-DD": kcal}} or {days: [{date, activeKcal}]}.
function extractDays(body) {
  if (!body || typeof body !== 'object') return [];
  if (body.date !== undefined) return [[body.date, body.activeKcal]];
  if (Array.isArray(body.days)) return body.days.map(d => [d?.date, d?.activeKcal]);
  if (body.days && typeof body.days === 'object') return Object.entries(body.days);
  return [];
}

router.post('/ingest', ingestLimiter, (req, res) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  const user = match && db.prepare('SELECT id FROM users WHERE health_token_hash = ?').get(hashToken(match[1]));
  if (!user) {
    return res.status(401).json({ error: 'Ungültiger Token' });
  }

  const maxDate = localDate(1); // one day of slack for the phone being ahead of the server's timezone
  const valid = [];
  for (const [date, raw] of extractDays(req.body).slice(0, MAX_DAYS_PER_REQUEST)) {
    const kcal = parseKcal(raw);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > maxDate) continue;
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > MAX_ACTIVE_KCAL) continue;
    valid.push([date, Math.round(kcal * 10) / 10]);
  }

  const upsert = db.prepare(`
    INSERT INTO activity_days (user_id, date, active_kcal) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET active_kcal = excluded.active_kcal, updated_at = datetime('now')
  `);
  db.transaction(() => { for (const [date, kcal] of valid) upsert.run(user.id, date, kcal); })();

  res.json({ ok: true, saved: valid.length });
});

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT date, active_kcal, updated_at FROM activity_days WHERE user_id = ? AND date >= ? ORDER BY date'
  ).all(req.userId, localDate(-HISTORY_DAYS));
  const lastReceivedAt = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), '');
  res.json({
    days: rows.map(r => ({ date: r.date, activeKcal: r.active_kcal })),
    // SQLite datetime('now') is UTC without a zone marker.
    lastReceivedAt: lastReceivedAt ? `${lastReceivedAt.replace(' ', 'T')}Z` : null,
  });
});

router.delete('/', requireAuth, (req, res) => {
  db.prepare('DELETE FROM activity_days WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

// New token (replaces any previous one); the plain value is only ever returned here.
router.post('/token', requireAuth, (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET health_token_hash = ? WHERE id = ?').run(hashToken(token), req.userId);
  res.json({ token });
});

router.delete('/token', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET health_token_hash = NULL WHERE id = ?').run(req.userId);
  res.json({ ok: true });
});

export default router;
