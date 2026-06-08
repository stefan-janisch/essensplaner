import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Snapshot every entry the user marked as COOKED — in this app's workflow the ✗ marker
// (enabled = 0) means "I cooked this" — up to and including today, that isn't logged yet.
// INSERT OR IGNORE + UNIQUE(user_id, entry_id) make it idempotent, so it can run on every read.
// persons = plan.default_servings, falling back to user.default_servings.
const reconcileStmt = db.prepare(`
  INSERT OR IGNORE INTO nutrition_logs
    (user_id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons, nutrition_per_serving)
  SELECT
    p.user_id, e.plan_id, e.id, e.meal_id, m.name, e.date, e.meal_type, e.servings,
    COALESCE(p.default_servings, u.default_servings, 1), m.nutrition_per_serving
  FROM meal_plan_entries e
  JOIN meal_plans p ON p.id = e.plan_id
  JOIN users u ON u.id = p.user_id
  JOIN meals m ON m.id = e.meal_id
  WHERE p.user_id = ?
    AND e.enabled = 0
    AND e.date <= date('now')
`);

// Bring the log up to date for a user. No-op unless the user has the log enabled in settings.
// "Cooked" = the ✗ marker (enabled = 0). Known, accepted edge case: an entry re-marked or moved
// after being logged keeps its original immutable snapshot.
export function reconcileNutritionLogs(userId) {
  const user = db.prepare('SELECT nutrition_log_enabled FROM users WHERE id = ?').get(userId);
  if (!user || !user.nutrition_log_enabled) return 0;
  return reconcileStmt.run(userId).changes;
}

// Distinct months (YYYY-MM) that have log data — feeds the report's month navigator.
router.get('/months', (req, res) => {
  reconcileNutritionLogs(req.userId);
  const rows = db.prepare(
    `SELECT DISTINCT substr(date, 1, 7) AS month FROM nutrition_logs WHERE user_id = ? ORDER BY month DESC`
  ).all(req.userId);
  res.json(rows.map(r => r.month));
});

router.get('/', (req, res) => {
  reconcileNutritionLogs(req.userId);
  // Optional ?month=YYYY-MM filter (used by the monthly report).
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : null;
  const rows = month
    ? db.prepare(
        `SELECT id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons,
                nutrition_per_serving, logged_at
         FROM nutrition_logs WHERE user_id = ? AND substr(date, 1, 7) = ? ORDER BY date DESC, id DESC`
      ).all(req.userId, month)
    : db.prepare(
        `SELECT id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons,
                nutrition_per_serving, logged_at
         FROM nutrition_logs WHERE user_id = ? ORDER BY date DESC, id DESC`
      ).all(req.userId);
  res.json(rows.map(r => ({
    id: r.id,
    planId: r.plan_id,
    entryId: r.entry_id,
    mealId: r.meal_id,
    mealName: r.meal_name,
    date: r.date,
    mealType: r.meal_type,
    servings: r.servings,
    persons: r.persons,
    nutritionPerServing: r.nutrition_per_serving ? JSON.parse(r.nutrition_per_serving) : null,
    loggedAt: r.logged_at,
  })));
});

export default router;
