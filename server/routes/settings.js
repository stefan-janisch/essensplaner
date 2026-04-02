import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = db.prepare('SELECT default_servings, nutrition_targets, meals_per_day, nutrition_profile FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({
    defaultServings: user.default_servings,
    nutritionTargets: user.nutrition_targets ? JSON.parse(user.nutrition_targets) : null,
    mealsPerDay: user.meals_per_day,
    nutritionProfile: user.nutrition_profile ? JSON.parse(user.nutrition_profile) : null,
  });
});

router.put('/', (req, res) => {
  const { defaultServings, nutritionTargets, mealsPerDay, nutritionProfile } = req.body;

  if (defaultServings != null) {
    if (defaultServings < 1) {
      return res.status(400).json({ error: 'Ungültige Portionsanzahl' });
    }
    db.prepare('UPDATE users SET default_servings = ? WHERE id = ?').run(defaultServings, req.userId);
  }

  if (mealsPerDay != null) {
    const mpd = Math.max(1, Math.min(10, Math.round(Number(mealsPerDay) || 3)));
    db.prepare('UPDATE users SET meals_per_day = ? WHERE id = ?').run(mpd, req.userId);
  }

  if (nutritionTargets !== undefined) {
    if (nutritionTargets === null) {
      db.prepare('UPDATE users SET nutrition_targets = NULL WHERE id = ?').run(req.userId);
    } else {
      const { kcal, protein, carbs, fat, fiber } = nutritionTargets;
      if ([kcal, protein, carbs, fat, fiber].some(v => typeof v !== 'number' || v < 0)) {
        return res.status(400).json({ error: 'Ungültige Nährwertziele' });
      }
      db.prepare('UPDATE users SET nutrition_targets = ? WHERE id = ?')
        .run(JSON.stringify({ kcal, protein, carbs, fat, fiber }), req.userId);
    }
  }

  if (nutritionProfile !== undefined) {
    if (nutritionProfile === null) {
      db.prepare('UPDATE users SET nutrition_profile = NULL WHERE id = ?').run(req.userId);
    } else {
      db.prepare('UPDATE users SET nutrition_profile = ? WHERE id = ?')
        .run(JSON.stringify(nutritionProfile), req.userId);
    }
  }

  const user = db.prepare('SELECT default_servings, nutrition_targets, meals_per_day, nutrition_profile FROM users WHERE id = ?').get(req.userId);
  res.json({
    defaultServings: user.default_servings,
    nutritionTargets: user.nutrition_targets ? JSON.parse(user.nutrition_targets) : null,
    mealsPerDay: user.meals_per_day,
    nutritionProfile: user.nutrition_profile ? JSON.parse(user.nutrition_profile) : null,
  });
});

// Weight history
router.get('/weight-history', (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit)) || 100));
  const rows = db.prepare('SELECT id, date, weight, body_fat FROM weight_history WHERE user_id = ? ORDER BY date DESC LIMIT ?')
    .all(req.userId, limit);
  res.json(rows.map(r => ({ id: r.id, date: r.date, weight: r.weight, bodyFat: r.body_fat })));
});

router.post('/weight-history', (req, res) => {
  const { date, weight, bodyFat } = req.body;
  if (!date || !weight || weight <= 0) {
    return res.status(400).json({ error: 'Datum und Gewicht sind erforderlich' });
  }
  db.prepare('INSERT OR REPLACE INTO weight_history (user_id, date, weight, body_fat) VALUES (?, ?, ?, ?)')
    .run(req.userId, date, weight, bodyFat ?? null);
  const row = db.prepare('SELECT id, date, weight, body_fat FROM weight_history WHERE user_id = ? AND date = ?')
    .get(req.userId, date);
  res.json({ id: row.id, date: row.date, weight: row.weight, bodyFat: row.body_fat });
});

router.delete('/weight-history/:id', (req, res) => {
  const result = db.prepare('DELETE FROM weight_history WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }
  res.json({ ok: true });
});

export default router;
