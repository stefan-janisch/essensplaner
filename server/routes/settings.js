import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = db.prepare('SELECT default_servings, nutrition_targets, meals_per_day FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({
    defaultServings: user.default_servings,
    nutritionTargets: user.nutrition_targets ? JSON.parse(user.nutrition_targets) : null,
    mealsPerDay: user.meals_per_day,
  });
});

router.put('/', (req, res) => {
  const { defaultServings, nutritionTargets, mealsPerDay } = req.body;

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

  const user = db.prepare('SELECT default_servings, nutrition_targets, meals_per_day FROM users WHERE id = ?').get(req.userId);
  res.json({
    defaultServings: user.default_servings,
    nutritionTargets: user.nutrition_targets ? JSON.parse(user.nutrition_targets) : null,
    mealsPerDay: user.meals_per_day,
  });
});

export default router;
