import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { readHabit, sanitizeHabit, resetCoffeeHabit, resolveToday } from '../coffee.js';

const router = Router();
router.use(requireAuth);

// Recipe list sort orders — keep in sync with `SortBy` in src/utils/mealFilters.ts.
const RECIPE_SORTS = new Set(['name', 'rating', 'newest', 'kcal', 'protein', 'proteinDensity', 'fiber', 'sugar', 'score']);
const DEFAULT_RECIPE_SORT = 'score';

// Normalize an arbitrary value into a clean array of ingredient-name strings.
function sanitizeIngredientList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = item.trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 200) break;
  }
  return result;
}

// Settings as the client sees them (camelCase), or null for an unknown user.
function readSettings(userId) {
  const user = db.prepare(`SELECT default_servings, nutrition_targets, meals_per_day, nutrition_profile, use_optimal_portions,
    pantry_staples, fresh_ingredients, nutrition_log_enabled, default_recipe_sort,
    health_enabled, health_active_factor, health_token_hash, flexible_sport_enabled FROM users WHERE id = ?`).get(userId);
  if (!user) return null;
  return {
    defaultServings: user.default_servings,
    nutritionTargets: user.nutrition_targets ? JSON.parse(user.nutrition_targets) : null,
    mealsPerDay: user.meals_per_day,
    nutritionProfile: user.nutrition_profile ? JSON.parse(user.nutrition_profile) : null,
    useOptimalPortions: !!user.use_optimal_portions,
    pantryStaples: user.pantry_staples ? JSON.parse(user.pantry_staples) : [],
    freshIngredients: user.fresh_ingredients ? JSON.parse(user.fresh_ingredients) : [],
    nutritionLogEnabled: !!user.nutrition_log_enabled,
    defaultRecipeSort: RECIPE_SORTS.has(user.default_recipe_sort) ? user.default_recipe_sort : DEFAULT_RECIPE_SORT,
    healthEnabled: !!user.health_enabled,
    healthActiveFactor: user.health_active_factor,
    healthTokenSet: !!user.health_token_hash,
    coffeeHabit: readHabit(userId),
    flexibleSportEnabled: !!user.flexible_sport_enabled,
  };
}

router.get('/', (req, res) => {
  const settings = readSettings(req.userId);
  if (!settings) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json(settings);
});

router.put('/', (req, res) => {
  const { defaultServings, nutritionTargets, mealsPerDay, nutritionProfile, useOptimalPortions, pantryStaples, freshIngredients, nutritionLogEnabled, defaultRecipeSort, healthEnabled, healthActiveFactor, coffeeHabit, today, flexibleSportEnabled } = req.body;

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

  if (useOptimalPortions !== undefined) {
    db.prepare('UPDATE users SET use_optimal_portions = ? WHERE id = ?').run(useOptimalPortions ? 1 : 0, req.userId);
  }

  if (defaultRecipeSort !== undefined) {
    if (!RECIPE_SORTS.has(defaultRecipeSort)) {
      return res.status(400).json({ error: 'Ungültige Sortierung' });
    }
    db.prepare('UPDATE users SET default_recipe_sort = ? WHERE id = ?').run(defaultRecipeSort, req.userId);
  }

  if (nutritionLogEnabled !== undefined) {
    db.prepare('UPDATE users SET nutrition_log_enabled = ? WHERE id = ?').run(nutritionLogEnabled ? 1 : 0, req.userId);
  }

  if (healthEnabled !== undefined) {
    db.prepare('UPDATE users SET health_enabled = ? WHERE id = ?').run(healthEnabled ? 1 : 0, req.userId);
  }

  if (flexibleSportEnabled !== undefined) {
    db.prepare('UPDATE users SET flexible_sport_enabled = ? WHERE id = ?').run(flexibleSportEnabled ? 1 : 0, req.userId);
  }

  if (healthActiveFactor != null) {
    const factor = Number(healthActiveFactor);
    if (!Number.isFinite(factor)) {
      return res.status(400).json({ error: 'Ungültiger Anrechnungsfaktor' });
    }
    db.prepare('UPDATE users SET health_active_factor = ? WHERE id = ?')
      .run(Math.max(0.5, Math.min(1, factor)), req.userId);
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

  if (pantryStaples !== undefined) {
    db.prepare('UPDATE users SET pantry_staples = ? WHERE id = ?')
      .run(JSON.stringify(sanitizeIngredientList(pantryStaples)), req.userId);
  }

  if (freshIngredients !== undefined) {
    db.prepare('UPDATE users SET fresh_ingredients = ? WHERE id = ?')
      .run(JSON.stringify(sanitizeIngredientList(freshIngredients)), req.userId);
  }

  // ☕ Daily habit: future untouched habit entries are replaced on the next plan load.
  if (coffeeHabit !== undefined) {
    db.prepare('UPDATE users SET coffee_habit = ? WHERE id = ?')
      .run(JSON.stringify(sanitizeHabit(coffeeHabit, req.userId)), req.userId);
    resetCoffeeHabit(req.userId, resolveToday(today));
  }

  res.json(readSettings(req.userId));
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
