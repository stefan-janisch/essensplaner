import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// Flexible sport mode: trainings logged per day in the plan (type, intensity, minutes). The
// client turns them into the day's extra expenditure (MET based, see src/utils/sportModel.ts).
const router = Router();
router.use(requireAuth);

const TYPES = new Set(['cardio', 'strength', 'sport', 'mobility']);
const INTENSITIES = new Set(['light', 'moderate', 'intense']);
const MAX_MINUTES = 600;

function rowToTraining(row) {
  return { id: row.id, date: row.date, type: row.type, intensity: row.intensity, minutes: row.minutes };
}

/** Validate a create/update body; returns { error } or the clean values. */
function parseTraining(body) {
  const { date, type, intensity } = body || {};
  const minutes = Math.round(Number(body?.minutes));
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Ungültiges Datum' };
  if (!TYPES.has(type)) return { error: 'Ungültige Trainingsart' };
  if (!INTENSITIES.has(intensity)) return { error: 'Ungültige Intensität' };
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) return { error: 'Dauer muss zwischen 1 und 600 Minuten liegen' };
  return { date, type, intensity, minutes };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM training_logs WHERE user_id = ? ORDER BY date, id').all(req.userId);
  res.json(rows.map(rowToTraining));
});

router.post('/', (req, res) => {
  const t = parseTraining(req.body);
  if (t.error) return res.status(400).json({ error: t.error });
  const result = db.prepare(
    'INSERT INTO training_logs (user_id, date, type, intensity, minutes) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, t.date, t.type, t.intensity, t.minutes);
  res.status(201).json(rowToTraining(db.prepare('SELECT * FROM training_logs WHERE id = ?').get(result.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM training_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Training nicht gefunden' });
  const t = parseTraining({ ...rowToTraining(existing), ...req.body });
  if (t.error) return res.status(400).json({ error: t.error });
  db.prepare('UPDATE training_logs SET date = ?, type = ?, intensity = ?, minutes = ? WHERE id = ?')
    .run(t.date, t.type, t.intensity, t.minutes, existing.id);
  res.json(rowToTraining(db.prepare('SELECT * FROM training_logs WHERE id = ?').get(existing.id)));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM training_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Training nicht gefunden' });
  res.json({ ok: true });
});

export default router;
